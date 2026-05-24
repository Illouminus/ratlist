-- Add participant-based SELECT policy on events. Honoree-read, INSERT, UPDATE,
-- DELETE policies stay (honoree-only). The legacy "events: audience members
-- can read" policy was already dropped in 20260524120000.

drop policy if exists "events: audience members can read" on public.events;

-- Use can_see_event SECURITY DEFINER helper (defined at 20260524120100) to avoid
-- infinite-recursion (42P17) between events_select and event_participants_select
-- policies that would otherwise reference each other through inline subqueries.
create policy events_participants_can_read on public.events for select
  using (public.can_see_event(events.id));
