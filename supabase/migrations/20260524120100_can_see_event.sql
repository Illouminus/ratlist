-- Rewire can_see_event to use event_participants instead of event_circles.
create or replace function public.can_see_event(_event_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.events e
    where e.id = _event_id
      and (
        e.honoree_id = auth.uid()
        or exists (
          select 1 from public.event_participants ep
          where ep.event_id = e.id
            and ep.user_id = auth.uid()
            and ep.status = 'active'
        )
      )
  );
$$;
