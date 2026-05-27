-- ────────────────────────────────────────────────────────────
-- Friend-graph: anon-friendly preview RPCs for /add-me and
-- /friend-invite landing screens.
--
-- Trade-off: these RPCs let anyone holding a valid token resolve
-- it to a minimal profile preview (display name, handle, avatar).
-- That's intentional — the recipient already has the token and
-- needs context to decide whether to accept. Abuse is bounded by:
--   * profiles.add_me_token is rotatable via rotate_add_me_token()
--   * friend_invites.token is single-use (we filter accepted_at)
--   * both tokens are 24+ random bytes from gen_random_bytes,
--     so guessing is not feasible
-- Disabled profiles (profiles.disabled_at not null) are masked.
-- ────────────────────────────────────────────────────────────

create or replace function public.get_add_me_preview(_token text)
returns table (
  id           uuid,
  display_name text,
  handle       text,
  avatar_url   text
)
language sql stable security definer
set search_path = public
as $$
  select p.id, p.display_name, p.handle, p.avatar_url
  from public.profiles p
  where p.add_me_token = _token
    and p.disabled_at is null;
$$;

revoke all on function public.get_add_me_preview(text) from public;
grant execute on function public.get_add_me_preview(text) to anon, authenticated;

create or replace function public.get_friend_invite_preview(_token text)
returns table (
  from_user_id uuid,
  display_name text,
  handle       text,
  avatar_url   text,
  to_email     text
)
language sql stable security definer
set search_path = public
as $$
  select fi.from_user, p.display_name, p.handle, p.avatar_url, fi.to_email
  from public.friend_invites fi
  join public.profiles p on p.id = fi.from_user
  where fi.token = _token
    and fi.accepted_at is null
    and p.disabled_at is null;
$$;

revoke all on function public.get_friend_invite_preview(text) from public;
grant execute on function public.get_friend_invite_preview(text) to anon, authenticated;
