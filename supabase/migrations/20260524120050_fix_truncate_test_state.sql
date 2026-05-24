-- Remove event_circles from truncate_test_state (dropped in link-first migration).
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
    public.event_participants,
    public.event_items,
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
