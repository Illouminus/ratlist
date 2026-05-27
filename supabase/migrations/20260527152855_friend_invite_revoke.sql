-- ────────────────────────────────────────────────────────────
-- revoke_friend_invite(_token) — caller deletes their own pending
-- invite by token. PR-1 RLS on friend_invites only has a SELECT
-- policy (from_user = auth.uid()); INSERT/UPDATE/DELETE are blocked
-- except via SECURITY DEFINER. Without this RPC, a direct PostgREST
-- delete silently succeeds with zero rows touched.
--
-- Idempotent: DELETE of a missing row is a no-op, same shape as
-- `unfriend`. The `from_user = caller` filter scopes the delete so
-- a hostile caller passing someone else's token leaves the row in
-- place without raising.
-- ────────────────────────────────────────────────────────────
create or replace function public.revoke_friend_invite(_token text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'unauthenticated';
  end if;
  delete from public.friend_invites
  where token = _token and from_user = caller;
end;
$$;

grant execute on function public.revoke_friend_invite(text) to authenticated;
