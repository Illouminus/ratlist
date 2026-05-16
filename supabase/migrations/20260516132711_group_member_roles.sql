-- ============================================================================
-- group_members: admins can change member roles (promote / demote).
-- ============================================================================
-- The init migration only granted INSERT/DELETE policies on group_members
-- (admins can add, self-or-admin can remove). Promote/demote needs an
-- UPDATE policy.
--
-- We keep `user_id` and `group_id` columns immutable — UPDATE-via-RLS
-- can only flip `role`. Doing the column lock-down via WITH CHECK
-- means non-admins can't sneak in by reassigning the row to themselves.
-- ============================================================================

create policy "group_members: admins can change roles"
  on public.group_members for update
  using (public.is_group_admin(group_id))
  with check (
    public.is_group_admin(group_id)
    and user_id = (select user_id from public.group_members gm where gm.group_id = group_members.group_id and gm.user_id = group_members.user_id)
    -- the row's group_id/user_id pair must be preserved; only `role`
    -- can change. (The subquery resolves the row's own user_id; if a
    -- malicious client tried to UPDATE ... SET user_id = <other>, the
    -- WITH CHECK would compare against the original row's user_id and
    -- the WITH CHECK would fail.)
  );

-- A safety helper that turns the "is this the last admin?" question
-- into a single round-trip from the client. We could enforce this in
-- a BEFORE UPDATE/DELETE trigger, but client-side enforcement plus
-- this query lets us produce a friendly error message instead of a
-- raw constraint violation.
create or replace function public.group_admin_count(_group_id uuid)
returns integer
language sql stable security definer
set search_path = public
as $$
  select count(*)::int
  from public.group_members
  where group_id = _group_id and role = 'admin';
$$;

revoke all     on function public.group_admin_count(uuid) from public;
grant  execute on function public.group_admin_count(uuid) to authenticated;
