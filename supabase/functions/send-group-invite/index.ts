/**
 * `send-group-invite` — email an existing invite token to a recipient.
 *
 * Trigger: the InviteList component's "send by email" affordance. The
 * URL token already exists (`invites.token`); the function's job is
 * just to look up the surrounding context (group name, inviter
 * display name, expiry, note) and post the branded email through
 * Resend. We deliberately do NOT mint a new token — re-sending the
 * same invite to different recipients is cheaper and the existing
 * single-use semantics still apply.
 *
 * Authorisation: caller must be a member of the group the invite is
 * bound to. We don't require them to be the invite's creator —
 * anyone with eyes on the invite token (i.e., anyone in the group)
 * is allowed to re-share it via email. That mirrors how URL-based
 * invites work today.
 *
 * Recipient privacy: the email argument never lands in the database.
 * We send the email and forget. If the user wants a paper trail of
 * who they invited, that's outside the scope of this function.
 *
 * Validation:
 *   - email must be a plausibly-shaped address (single `@`, a dot
 *     in the host). Resend rejects junk too, but failing client-side
 *     is cheaper.
 *   - invite must exist, not be expired, and not be used.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { bindCors } from '../_shared/cors.ts';
import { sendEmail } from '../_shared/email.ts';
import { renderGroupInviteEmail, renderGroupInviteText } from './template.ts';

const PROD_ORIGIN = 'https://ratlist.app';

interface RequestBody {
  token?: string;
  email?: string;
}

interface InviteRow {
  token: string;
  group_id: string;
  created_by: string;
  expires_at: string;
  used_at: string | null;
  note: string | null;
}

interface GroupRow {
  id: string;
  name: string;
}

interface MembershipRow {
  user_id: string;
}

/** Coarse-grained email shape check — `<something>@<something>.<tld>`. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function daysUntil(iso: string): number {
  const diff = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.floor(diff / 86_400_000));
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
  const token = body.token;
  const recipientEmail = body.email?.trim();
  if (!token || typeof token !== 'string') {
    return cors.json({ error: 'missing_token' }, 400);
  }
  if (!recipientEmail || !EMAIL_RE.test(recipientEmail)) {
    return cors.json({ error: 'invalid_email' }, 400);
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

  const { data: inviteData, error: inviteErr } = await admin
    .from('invites')
    .select('token, group_id, created_by, expires_at, used_at, note')
    .eq('token', token)
    .maybeSingle();
  if (inviteErr) return cors.json({ error: 'db_error', detail: inviteErr.message }, 500);
  if (!inviteData) return cors.json({ error: 'invite_not_found' }, 404);
  const invite = inviteData as InviteRow;

  if (invite.used_at) return cors.json({ error: 'invite_used' }, 409);
  const expiresAt = new Date(invite.expires_at).getTime();
  if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
    return cors.json({ error: 'invite_expired' }, 409);
  }

  // Verify caller is in the group. The invite's `created_by` would be
  // narrower but the URL-invite flow lets any member share the link,
  // and we want the email-send affordance to match.
  const { data: membership } = await admin
    .from('group_members')
    .select('user_id')
    .eq('group_id', invite.group_id)
    .eq('user_id', callerId)
    .maybeSingle();
  if (!(membership as MembershipRow | null)) {
    return cors.json({ error: 'not_member' }, 403);
  }

  // Group name (for subject + body).
  const { data: groupData, error: groupErr } = await admin
    .from('groups')
    .select('id, name')
    .eq('id', invite.group_id)
    .maybeSingle();
  if (groupErr) return cors.json({ error: 'db_error', detail: groupErr.message }, 500);
  if (!groupData) return cors.json({ error: 'group_not_found' }, 404);
  const group = groupData as GroupRow;

  // Inviter display name (for the "X invites you" copy). Take the
  // ORIGINAL invite creator's name, not necessarily the caller's —
  // when Maša re-shares Tanya's invite link, the email should still
  // say "Tanya invites you".
  const { data: inviterRow } = await admin
    .from('profiles')
    .select('display_name')
    .eq('id', invite.created_by)
    .maybeSingle();
  const organizerName = (inviterRow?.display_name as string | undefined) ?? 'A fellow rat';

  const inviteUrl = `${PROD_ORIGIN}/invite/${encodeURIComponent(invite.token)}`;
  const subject = `${organizerName} invites you to «${group.name}» on Rat List`;
  const input = {
    organizerName,
    groupName: group.name,
    inviteUrl,
    note: invite.note,
    expiresInDays: daysUntil(invite.expires_at),
  };

  const result = await sendEmail({
    to: recipientEmail,
    subject,
    html: renderGroupInviteEmail(input),
    text: renderGroupInviteText(input),
  });

  if (!result.ok) {
    return cors.json({ error: 'send_failed', detail: result.error }, 502);
  }
  return cors.json({ ok: true, id: result.id });
});
