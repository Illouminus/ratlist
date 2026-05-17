/**
 * `send-santa-start` — invite every member of the host group to a
 * newly-created Secret Santa event.
 *
 * Trigger: the client fires this fire-and-forget right after the
 * organiser creates a new `santa_events` row (see
 * `useSantaEvents.createEvent`). Group members get an email that
 * announces who started what, with a single CTA back into the app
 * to join.
 *
 * Recipients: every `group_members` row for the host group, minus
 * the creator. We don't email people who *aren't* in the group —
 * the Secret Santa is scoped to the friend circle by design.
 *
 * Auth: caller must be the event's creator. The function would
 * happily fire a notification fan-out for someone else's event
 * otherwise, which is the same abuse surface as the draw email.
 *
 * Failure mode: parallel sends via Promise.allSettled, partial
 * delivery returned in the response, HTTP is 200 unless the request
 * itself was malformed. The draw doesn't happen here, so an email
 * failure has zero impact on the underlying Santa flow.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { bindCors } from '../_shared/cors.ts';
import { sendEmail } from '../_shared/email.ts';
import { renderSantaStartEmail, renderSantaStartText } from './template.ts';

const PROD_ORIGIN = 'https://ratlist.app';

interface RequestBody {
  event_id?: string;
}

interface SantaEventWithGroup {
  id: string;
  name: string;
  status: string;
  created_by: string;
  group_id: string;
  draw_deadline: string | null;
  groups: { name: string } | null;
}

interface MemberRow {
  user_id: string;
  user: { display_name: string } | null;
}

interface AuthUserRow {
  id: string;
  email: string | null;
}

/**
 * Format a Postgres timestamptz into a human-readable English phrase
 * for the email body. e.g. `"on Thu 18 Dec, 19:00 UTC"`. Returns null
 * if the input is null or unparseable — caller renders a generic
 * "fill in your wishlist" line in that case.
 */
function formatDeadline(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
      hour12: false,
    }).format(d) + ' UTC';
  } catch {
    return d.toISOString();
  }
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
  if (!eventId || typeof eventId !== 'string') {
    return cors.json({ error: 'missing_event_id' }, 400);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return cors.json({ error: 'unauthenticated' }, 401);

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

  const { data: event, error: eventErr } = await admin
    .from('santa_events')
    .select('id, name, status, created_by, group_id, draw_deadline, groups(name)')
    .eq('id', eventId)
    .maybeSingle();
  if (eventErr) return cors.json({ error: 'db_error', detail: eventErr.message }, 500);
  if (!event) return cors.json({ error: 'event_not_found' }, 404);
  const santaEvent = event as unknown as SantaEventWithGroup;

  if (santaEvent.created_by !== callerId) {
    return cors.json({ error: 'not_organizer' }, 403);
  }
  // Only invite-stage events get a start announcement. If the
  // organiser already ran the draw, the `send-santa-draw` function
  // is what they want — not this one.
  if (santaEvent.status !== 'collecting') {
    return cors.json({ error: 'wrong_status', status: santaEvent.status }, 409);
  }

  // Fetch all group members minus the creator. Joining `profiles`
  // pulls each member's display_name in one round-trip.
  const { data: membersData, error: membersErr } = await admin
    .from('group_members')
    .select('user_id, user:profiles!user_id(display_name)')
    .eq('group_id', santaEvent.group_id)
    .neq('user_id', callerId);
  if (membersErr) return cors.json({ error: 'db_error', detail: membersErr.message }, 500);
  const members = (membersData ?? []) as unknown as MemberRow[];
  if (members.length === 0) {
    // Organiser is the only one in the group — no one to email.
    return cors.json({ ok: true, sent: 0, failed: 0, total: 0 });
  }

  // Organiser display name for the email body.
  const { data: organizerRow } = await admin
    .from('profiles')
    .select('display_name')
    .eq('id', callerId)
    .maybeSingle();
  const organizerName = (organizerRow?.display_name as string | undefined) ?? 'A fellow rat';
  const groupName = santaEvent.groups?.name ?? 'the group';

  // Batch-fetch emails.
  const memberIds = members.map((m) => m.user_id);
  const { data: usersData, error: usersErr } = await admin
    .schema('auth')
    .from('users')
    .select('id, email')
    .in('id', memberIds);
  if (usersErr) return cors.json({ error: 'db_error', detail: usersErr.message }, 500);
  const emailById = new Map<string, string>();
  for (const u of (usersData ?? []) as AuthUserRow[]) {
    if (u.email) emailById.set(u.id, u.email);
  }

  const eventUrl = `${PROD_ORIGIN}/santa/${encodeURIComponent(santaEvent.id)}`;
  const subject = `🎄 ${organizerName} started a Secret Santa — ${santaEvent.name}`;
  const drawDeadlineText = formatDeadline(santaEvent.draw_deadline);

  const sendOps = members.map(async (member) => {
    const email = emailById.get(member.user_id);
    if (!email) {
      return { user_id: member.user_id, ok: false, reason: 'no_email' as const };
    }
    const recipientName =
      (member.user?.display_name as string | undefined) ?? 'a fellow rat';
    const input = {
      recipientName,
      organizerName,
      eventName: santaEvent.name,
      groupName,
      eventUrl,
      drawDeadlineText,
    };
    const result = await sendEmail({
      to: email,
      subject,
      html: renderSantaStartEmail(input),
      text: renderSantaStartText(input),
    });
    return result.ok
      ? { user_id: member.user_id, ok: true as const, id: result.id }
      : { user_id: member.user_id, ok: false as const, reason: result.error };
  });

  const settled = await Promise.allSettled(sendOps);
  let sent = 0;
  let failed = 0;
  for (const s of settled) {
    if (s.status === 'fulfilled' && s.value.ok) sent++;
    else failed++;
  }

  return cors.json({ ok: true, sent, failed, total: members.length });
});
