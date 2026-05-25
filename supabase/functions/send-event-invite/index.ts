/**
 * `send-event-invite` — email a pre-invite for an event to a batch of
 * recipients picked from the coordinator's People list.
 *
 * Trigger: `InviteFromPeopleModal` (Phase D) calls this fire-and-forget
 * after writing pending rows into `event_participants` via the
 * `invite_to_event` RPC. The email points at `/event/<share_token>`;
 * sign-in flips the recipient's pending row to active via
 * `join_event_via_token`.
 *
 * Authorisation: caller JWT must belong to the event's honoree. The
 * RLS INSERT policy on `event_participants` already says "honoree
 * only" for direct inserts; this function mirrors that on the email
 * side so a stranger can't fan out unsolicited invites for someone
 * else's event.
 *
 * Idempotency: per (event_id, recipient_id, 'invite') via
 * `event_email_log`. Insert is the claim — 23505 means already-sent
 * and the recipient is skipped. `sent_at` is filled in after Resend
 * confirms acceptance.
 *
 * Failure mode: the function never throws to break the caller flow.
 * Resend dry-runs silently when `RESEND_API_KEY` is unset (local /
 * preview), which is the same convention as the other email functions.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { bindCors } from '../_shared/cors.ts';
import { sendEmail, sanitizeHeaderValue } from '../_shared/email.ts';
import { renderHtml, renderText } from './template.ts';

const PROD_ORIGIN = 'https://ratlist.app';

interface RequestBody {
  event_id?: string;
  user_ids?: string[];
}

interface EventRow {
  id: string;
  honoree_id: string;
  title: string;
  occurs_on: string | null;
  share_token: string;
}

interface ProfileRow {
  id: string;
  display_name: string | null;
}

interface AuthUserRow {
  id: string;
  email: string | null;
}

Deno.serve(async (req) => {
  const cors = bindCors(req);
  if (req.method === 'OPTIONS') return cors.preflight();
  if (req.method !== 'POST') return cors.json({ error: 'method_not_allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return cors.json({ error: 'server_misconfigured' }, 500);
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return cors.json({ error: 'invalid_json' }, 400);
  }
  const eventId = body.event_id;
  const userIds = body.user_ids;
  if (!eventId || typeof eventId !== 'string') {
    return cors.json({ error: 'missing_event_id' }, 400);
  }
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return cors.json({ error: 'missing_user_ids' }, 400);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return cors.json({ error: 'unauthenticated' }, 401);

  // Caller-scoped client: only used to read the calling user identity.
  // Event-honoree match is verified explicitly below via service-role.
  const supabaseAsCaller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userResult, error: userErr } = await supabaseAsCaller.auth.getUser();
  if (userErr || !userResult.user) return cors.json({ error: 'unauthenticated' }, 401);
  const callerId = userResult.user.id;

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // Resolve event under service-role: RLS would otherwise let the caller
  // see only their own honoured events anyway, but going through admin
  // keeps the auth check explicit and the error surface narrow.
  const { data: eventData, error: eventErr } = await admin
    .from('events')
    .select('id, honoree_id, title, occurs_on, share_token')
    .eq('id', eventId)
    .maybeSingle();
  if (eventErr) return cors.json({ error: 'db_error', detail: eventErr.message }, 500);
  if (!eventData) return cors.json({ error: 'event_not_found' }, 404);
  const event = eventData as EventRow;
  if (event.honoree_id !== callerId) {
    return cors.json({ error: 'not_honoree' }, 403);
  }

  // Inviter display name (honoree).
  const { data: inviterRow } = await admin
    .from('profiles')
    .select('display_name')
    .eq('id', callerId)
    .maybeSingle();
  const inviterName =
    (inviterRow?.display_name as string | undefined) ?? 'A fellow rat';

  // Recipient profiles + emails. Joined separately because emails live
  // in auth.users and profiles is the user-facing display name table.
  const { data: profileRows, error: profilesErr } = await admin
    .from('profiles')
    .select('id, display_name')
    .in('id', userIds);
  if (profilesErr) return cors.json({ error: 'db_error', detail: profilesErr.message }, 500);
  const profiles = (profileRows ?? []) as ProfileRow[];

  const { data: authUsersData, error: authUsersErr } = await admin
    .schema('auth')
    .from('users')
    .select('id, email')
    .in('id', userIds);
  if (authUsersErr) return cors.json({ error: 'db_error', detail: authUsersErr.message }, 500);
  const emailById = new Map<string, string>();
  for (const u of (authUsersData ?? []) as AuthUserRow[]) {
    if (u.email) emailById.set(u.id, u.email);
  }

  const eventUrl = `${PROD_ORIGIN}/event/${encodeURIComponent(event.share_token)}`;
  const safeInviter = sanitizeHeaderValue(inviterName) || 'A fellow rat';
  const safeTitle = sanitizeHeaderValue(event.title) || 'event';
  const subject = sanitizeHeaderValue(
    `${safeInviter} приглашает тебя на «${safeTitle}»`,
  );

  // Insert log row first (claim), then send. 23505 = already sent (skip).
  // Send results are reflected back as sent_at update; failed sends leave
  // sent_at null so the row stays "claimed but not confirmed" — a
  // human-readable signal for triage. UI does not surface this state.
  const sendOps = profiles.map(async (recipient) => {
    const email = emailById.get(recipient.id);
    if (!email) return { ok: false as const, reason: 'no_email' };

    const { error: claimErr } = await admin.from('event_email_log').insert({
      event_id: event.id,
      recipient_id: recipient.id,
      email_type: 'invite',
    });
    if (claimErr?.code === '23505') return { ok: false as const, reason: 'already_sent' };
    if (claimErr) return { ok: false as const, reason: 'log_error' };

    const result = await sendEmail({
      to: email,
      subject,
      html: renderHtml({
        inviterName,
        recipientName: recipient.display_name ?? '',
        eventTitle: event.title,
        eventOccursOn: event.occurs_on,
        eventUrl,
      }),
      text: renderText({
        inviterName,
        recipientName: recipient.display_name ?? '',
        eventTitle: event.title,
        eventOccursOn: event.occurs_on,
        eventUrl,
      }),
    });

    if (result.ok) {
      await admin
        .from('event_email_log')
        .update({ sent_at: new Date().toISOString() })
        .eq('event_id', event.id)
        .eq('recipient_id', recipient.id)
        .eq('email_type', 'invite');
      return { ok: true as const, id: result.id };
    }
    return { ok: false as const, reason: result.error };
  });

  const settled = await Promise.allSettled(sendOps);
  let sent = 0;
  let skipped = 0;
  for (const s of settled) {
    if (s.status === 'fulfilled' && s.value.ok) sent++;
    else skipped++;
  }

  return cors.json({ ok: true, sent, skipped, total: profiles.length }, 200);
});
