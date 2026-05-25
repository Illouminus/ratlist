-- Helper used by event_participants RLS SELECT policy to avoid infinite
-- recursion (policy on event_participants cannot directly query
-- event_participants without SECURITY DEFINER bypass).
create or replace function public.is_active_event_participant(_event_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.event_participants
    where event_id = _event_id
      and user_id = auth.uid()
      and status = 'active'
  );
$$;

grant execute on function public.is_active_event_participant(uuid) to authenticated;
