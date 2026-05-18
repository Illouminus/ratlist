-- supabase/migrations/20260518042011_truncate_test_state.sql
--
-- A SECURITY DEFINER RPC the integration test harness calls between
-- tests to wipe transient state. Restricted by a session-local guard
-- so it physically cannot run in prod: the caller must SET
-- `app.allow_test_truncate = 'on'` for the current session/transaction
-- before invoking. CI does that via the integration test setup; prod
-- never does.
--
-- Resets every table populated by user activity. Keeps `profiles` so
-- test users persist across tests in a single run. Keeps `auth.users`
-- entirely (test users are owned by Supabase Auth).

create or replace function public.truncate_test_state()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('app.allow_test_truncate', true), '') <> 'on' then
    raise exception 'truncate_test_state refused — app.allow_test_truncate is not on';
  end if;

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
  'Integration-test-only. Wipes user-activity tables. Refuses unless app.allow_test_truncate = on for the session.';

revoke all on function public.truncate_test_state() from public, anon, authenticated;
grant execute on function public.truncate_test_state() to service_role;
