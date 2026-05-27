/**
 * `send-friend-invite` — email a friend-invite token to a recipient.
 *
 * Trigger: client calls this Edge Function right after `create_friend_invite`
 * RPC succeeds. The token is already in the `friend_invites` table; the
 * function looks up sender's display name and posts the branded email
 * through Resend (dry-run if RESEND_API_KEY is absent — matches the
 * convention from the other transactional emails).
 *
 * Authorisation: caller must own the invite (`from_user = auth.uid()`).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { bindCors } from '../_shared/cors.ts';
import { sendEmail, sanitizeHeaderValue } from '../_shared/email.ts';
import { renderFriendInviteEmail, renderFriendInviteText } from './template.ts';

const PROD_ORIGIN = 'https://ratlist.app';

interface RequestBody {
  token?: string;
  email?: string;
}

interface InviteRow {
  token: string;
  from_user: string;
  to_email: string;
  message: string | null;
  accepted_at: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    .from('friend_invites')
    .select('token, from_user, to_email, message, accepted_at')
    .eq('token', token)
    .maybeSingle();
  if (inviteErr) return cors.json({ error: 'db_error', detail: inviteErr.message }, 500);
  if (!inviteData) return cors.json({ error: 'invite_not_found' }, 404);
  const invite = inviteData as InviteRow;

  if (invite.from_user !== callerId) {
    return cors.json({ error: 'not_owner' }, 403);
  }
  if (invite.accepted_at) {
    return cors.json({ error: 'invite_used' }, 409);
  }

  const { data: senderRow } = await admin
    .from('profiles')
    .select('display_name')
    .eq('id', invite.from_user)
    .maybeSingle();
  const senderName = (senderRow?.display_name as string | undefined) ?? 'A fellow rat';

  const inviteUrl = `${PROD_ORIGIN}/friend-invite/${encodeURIComponent(invite.token)}`;
  const safeSender = sanitizeHeaderValue(senderName) || 'A fellow rat';
  const subject = sanitizeHeaderValue(`${safeSender} зовёт тебя дружить на Rat List`);
  const tplInput = {
    senderName,
    inviteUrl,
    message: invite.message,
  };

  const result = await sendEmail({
    to: recipientEmail,
    subject,
    html: renderFriendInviteEmail(tplInput),
    text: renderFriendInviteText(tplInput),
  });

  if (!result.ok) {
    return cors.json({ error: 'send_failed', detail: result.error }, 502);
  }
  return cors.json({ ok: true, id: result.id });
});
