-- event_participants RLS — 4 policies.
-- Self-join via SECURITY DEFINER RPC (A.7) bypasses RLS for the active upsert path.

alter table public.event_participants enable row level security;

-- SELECT: own row always; honoree sees all; co-active sees all (incl. pending).
-- Co-active check uses SECURITY DEFINER helper (is_active_event_participant)
-- to avoid infinite-recursion error 42P17 from a self-referencing RLS policy.
create policy event_participants_select on public.event_participants for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.events e
      where e.id = event_id and e.honoree_id = auth.uid()
    )
    or public.is_active_event_participant(event_id)
  );

-- INSERT: honoree only, status must be 'pending', invited_by must be self
create policy event_participants_insert on public.event_participants for insert
  with check (
    exists (select 1 from public.events e where e.id = event_id and e.honoree_id = auth.uid())
    and status = 'pending'
    and invited_by = auth.uid()
  );

-- UPDATE: own row or honoree
create policy event_participants_update on public.event_participants for update
  using (
    user_id = auth.uid()
    or exists (select 1 from public.events e where e.id = event_id and e.honoree_id = auth.uid())
  )
  with check (
    user_id = auth.uid()
    or exists (select 1 from public.events e where e.id = event_id and e.honoree_id = auth.uid())
  );

-- DELETE: honoree only (kick)
create policy event_participants_delete on public.event_participants for delete
  using (exists (select 1 from public.events e where e.id = event_id and e.honoree_id = auth.uid()));
