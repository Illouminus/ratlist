-- Let a group's creator always SELECT their own group row.
--
-- Why this exists:
--   The previous SELECT policy on `groups` was members-only:
--     using (public.is_group_member(id))
--
--   That looks correct, but it broke `INSERT ... RETURNING *` from the
--   client. PostgreSQL evaluates RETURNING immediately after the row
--   is inserted, *before* AFTER ROW triggers fire. Our
--   `bootstrap_group_admin` trigger is exactly the thing that inserts
--   the creator into `group_members`, so at the moment RETURNING runs
--   the creator is not yet a member and `is_group_member` returns
--   false → SQLSTATE 42501 → the UI shows «нет доступа».
--
-- Adding a `created_by = auth.uid()` policy is OR-ed with the existing
-- one, so:
--   - the creator can always read rows they made (used by RETURNING),
--   - everyone else continues to read only via group membership.
-- No privacy regression: the creator obviously already knows the group
-- exists; they just inserted it.

create policy "groups: creator can read"
  on public.groups for select
  using (created_by = auth.uid());
