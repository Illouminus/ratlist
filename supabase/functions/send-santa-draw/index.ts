/**
 * `send-santa-draw` — fire transactional "the draw is done" emails to
 * every giver in a Secret Santa event.
 *
 * Trigger: the client calls this fire-and-forget right after
 * `run_santa_draw` succeeds (see `useSantaEvent.runDraw`). The
 * function itself does the rest: verify the caller is the event
 * organiser, fetch the assignments, look up each giver's auth email
 * via service role, render the branded template, and ship via
 * Resend.
 *
 * Privacy invariants this function must preserve:
 *   - The matched recipient's *name* never leaves this function.
 *     The email tells the giver "the draw is done — open the app";
 *     the actual match still requires logging in. Email archives
 *     get screenshotted, forwarded, leaked; the app gates remain.
 *   - Only the organiser of THIS event can trigger this. We're not
 *     a generic broadcaster — calling the function for an event the
 *     caller didn't create returns 403.
 *
 * Authentication: standard Supabase Edge `verify_jwt = true` (the
 * default). The `Authorization: Bearer <jwt>` header is required;
 * we then build a service-role client to fetch giver emails from
 * `auth.users` (the `profiles` table doesn't carry email by design,
 * and RLS on the public schema doesn't let us read other users'
 * private fields anyway).
 *
 * Errors: any one giver failing to send shouldn't break the rest.
 * Sends are issued in parallel via `Promise.allSettled`; the response
 * reports `sent` / `failed` counts. The HTTP status is always 200 as
 * long as the caller was authorised — partial delivery isn't a 5xx.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { bindCors } from '../_shared/cors.ts';
import { sendEmail } from '../_shared/email.ts';
import { renderSantaDrawEmail, renderSantaDrawText } from './template.ts';

const PROD_ORIGIN = 'https://ratlist.app';

interface RequestBody {
  event_id?: string;
}

interface SantaEvent {
  id: string;
  name: string;
  status: string;
  created_by: string;
}

interface AssignmentRow {
  giver_id: string;
  giver: { display_name: string } | null;
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

  // Parse + sanity-check the body. event_id is required and must be
  // a UUID; we don't do a strict regex check, the DB will reject
  // garbage on the next query.
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

  // Identify the caller from the JWT. We use the anon-key client with
  // the caller's Authorization header so `getUser()` resolves to them.
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return cors.json({ error: 'unauthenticated' }, 401);

  const supabaseAsCaller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userResult, error: userErr } = await supabaseAsCaller.auth.getUser();
  if (userErr || !userResult.user) {
    return cors.json({ error: 'unauthenticated' }, 401);
  }
  const callerId = userResult.user.id;

  // From here on we need to bypass RLS:
  //   - santa_assignments is giver-only, so reading the full list
  //     requires service role
  //   - auth.users.email is admin-only
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: event, error: eventErr } = await admin
    .from('santa_events')
    .select('id, name, status, created_by')
    .eq('id', eventId)
    .maybeSingle();
  if (eventErr) return cors.json({ error: 'db_error', detail: eventErr.message }, 500);
  if (!event) return cors.json({ error: 'event_not_found' }, 404);
  const santaEvent = event as SantaEvent;

  if (santaEvent.created_by !== callerId) {
    return cors.json({ error: 'not_organizer' }, 403);
  }
  // Sending notifications only makes sense once the draw has happened.
  // For any other status we noop with a clear response — easier to
  // debug than a silent success.
  if (santaEvent.status !== 'drawn') {
    return cors.json({ error: 'wrong_status', status: santaEvent.status }, 409);
  }

  // Get the organiser's display name (used in the email body). The
  // organiser is the caller, so this is the caller's own profile —
  // but go through admin client to avoid relying on the
  // `profiles.self.SELECT` policy.
  const { data: organizerRow } = await admin
    .from('profiles')
    .select('display_name')
    .eq('id', callerId)
    .maybeSingle();
  const organizerName = (organizerRow?.display_name as string | undefined) ?? 'A fellow rat';

  // Pull all (giver, profile.display_name) rows for this event.
  const { data: assignmentsData, error: assignErr } = await admin
    .from('santa_assignments')
    .select('giver_id, giver:profiles!giver_id(display_name)')
    .eq('event_id', eventId);
  if (assignErr) return cors.json({ error: 'db_error', detail: assignErr.message }, 500);
  const assignments = (assignmentsData ?? []) as AssignmentRow[];
  if (assignments.length === 0) {
    return cors.json({ error: 'no_assignments' }, 409);
  }

  // Fetch all giver emails in one batch. auth.users is queryable via
  // service role on the `auth` schema; in.() avoids N+1.
  const giverIds = assignments.map((a) => a.giver_id);
  const { data: usersData, error: usersErr } = await admin
    .schema('auth')
    .from('users')
    .select('id, email')
    .in('id', giverIds);
  if (usersErr) return cors.json({ error: 'db_error', detail: usersErr.message }, 500);
  const emailById = new Map<string, string>();
  for (const u of (usersData ?? []) as AuthUserRow[]) {
    if (u.email) emailById.set(u.id, u.email);
  }

  const eventUrl = `${PROD_ORIGIN}/santa/${encodeURIComponent(santaEvent.id)}`;
  const subject = `🎁 ${santaEvent.name} — the draw is done`;

  // Send one email per giver, in parallel. Skip givers without an
  // email on file (shouldn't happen for normally-created accounts,
  // but Supabase Auth allows phone-only or empty-email users — be
  // robust to it).
  const sendOps = assignments.map(async (assignment) => {
    const email = emailById.get(assignment.giver_id);
    if (!email) {
      return { giver_id: assignment.giver_id, ok: false, reason: 'no_email' as const };
    }
    const giverName =
      (assignment.giver?.display_name as string | undefined) ?? 'a fellow rat';
    const html = renderSantaDrawEmail({
      giverName,
      organizerName,
      eventName: santaEvent.name,
      eventUrl,
    });
    const text = renderSantaDrawText({
      giverName,
      organizerName,
      eventName: santaEvent.name,
      eventUrl,
    });
    const result = await sendEmail({ to: email, subject, html, text });
    return result.ok
      ? { giver_id: assignment.giver_id, ok: true as const, id: result.id }
      : { giver_id: assignment.giver_id, ok: false as const, reason: result.error };
  });

  const settled = await Promise.allSettled(sendOps);
  let sent = 0;
  let failed = 0;
  for (const s of settled) {
    if (s.status === 'fulfilled' && s.value.ok) sent++;
    else failed++;
  }

  return cors.json({ ok: true, sent, failed, total: assignments.length });
});
