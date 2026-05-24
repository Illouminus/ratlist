-- Add participant-based SELECT policy on events. Honoree-read, INSERT, UPDATE,
-- DELETE policies stay (honoree-only). The legacy "events: audience members
-- can read" policy was already dropped in 20260524120000.

drop policy if exists "events: audience members can read" on public.events;

create policy events_participants_can_read on public.events for select
  using (
    exists (
      select 1 from public.event_participants ep
      where ep.event_id = events.id
        and ep.user_id = auth.uid()
        and ep.status = 'active'
    )
  );
