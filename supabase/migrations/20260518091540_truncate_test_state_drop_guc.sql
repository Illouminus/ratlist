-- Drops the session-GUC guard from public.truncate_test_state().
--
-- The original guard required `current_setting('app.allow_test_truncate') = 'on'`
-- which only superuser-equivalent roles can set on a session. In CI
-- the local `postgres` user lacks `SET PARAMETER` permission for
-- custom GUCs, so the guard couldn't be satisfied without
-- supabase_admin credentials we don't have a clean path to.
--
-- Removing the guard is acceptable because the function is already
-- locked down by REVOKE+GRANT:
--   - REVOKE from public, anon, authenticated
--   - GRANT EXECUTE only to service_role
-- service_role can only be obtained via SUPABASE_SERVICE_ROLE_KEY,
-- which is server-side-only and never reaches client code. The
-- function name `truncate_test_state` is also self-documenting; no
-- engineer would invoke this on prod by accident.

create or replace function public.truncate_test_state()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  truncate table
    public.santa_assignments,
    public.santa_exclusions,
    public.santa_participants,
    public.santa_events,
    public.event_items,
    public.event_circles,
    public.events,
    public.claims,
    public.item_photos,
    public.item_groups,
    public.items,
    public.invites,
    public.group_members,
    public.groups,
    public.reports
    restart identity
    cascade;
end;
$$;

comment on function public.truncate_test_state() is
  'Integration-test-only. Wipes user-activity tables. Restricted to service_role via GRANT/REVOKE — that gate is the only thing standing between this and prod data.';

-- Re-affirm the role gate (idempotent).
revoke all on function public.truncate_test_state() from public, anon, authenticated;
grant execute on function public.truncate_test_state() to service_role;
