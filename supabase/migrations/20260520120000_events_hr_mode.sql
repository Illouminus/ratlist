-- supabase/migrations/20260520120000_events_hr_mode.sql

-- 1. extend events: split creator from honoree
alter table public.events
  add column created_by uuid references auth.users(id);

-- backfill: existing rows have creator = honoree
update public.events set created_by = honoree_id where created_by is null;

alter table public.events
  alter column created_by set not null,
  alter column honoree_id drop not null,
  add column honoree_name text,
  add constraint events_honoree_identified
    check (honoree_id is not null or honoree_name is not null);

-- 2. new helper: is_honoree_of_item — extends honoree-blind invariant for HR-mode.
-- For event-attached items: gates by event.honoree_id.
-- For list-only items: legacy = item owner is the honoree.
create or replace function public.is_honoree_of_item(_item_id uuid)
returns boolean language plpgsql security definer
set search_path = public as $$
declare _has_events boolean;
begin
  select exists(select 1 from event_items where item_id = _item_id) into _has_events;
  if _has_events then
    return exists (
      select 1 from event_items ei
      join events e on e.id = ei.event_id
      where ei.item_id = _item_id and e.honoree_id = auth.uid()
    );
  else
    return exists (
      select 1 from items where id = _item_id and owner_id = auth.uid()
    );
  end if;
end; $$;

grant execute on function public.is_honoree_of_item(uuid) to authenticated;

-- 3. update claims.SELECT policy — backwards-compat in self-events,
-- correct semantics in HR-mode
drop policy if exists "claims: visible to non-owners who can see the item" on public.claims;
drop policy if exists claims_select on public.claims;
create policy claims_select
  on public.claims for select
  using (
    not public.is_honoree_of_item(item_id)
    and public.can_see_item(item_id)
  );

-- 4. update existing event policies to handle new columns
-- (events RLS uses honoree_id; with creator≠honoree, creator also needs access)
drop policy if exists "events: honoree can read" on public.events;
drop policy if exists "events: audience members can read" on public.events;
drop policy if exists events_select on public.events;
create policy events_select
  on public.events for select
  using (
    created_by = auth.uid()
    or honoree_id = auth.uid()
    or exists (
      select 1 from event_circles ec
      join group_members gm on gm.group_id = ec.group_id
      where ec.event_id = events.id and gm.user_id = auth.uid()
    )
  );

drop policy if exists "events: anyone authenticated can create as themselves" on public.events;
drop policy if exists events_insert on public.events;
create policy events_insert
  on public.events for insert
  with check (
    created_by = auth.uid()
    and (
      honoree_id is null
      or honoree_id = auth.uid()
      or shares_group_with(honoree_id)
    )
  );

drop policy if exists "events: honoree can update" on public.events;
drop policy if exists events_update on public.events;
create policy events_update
  on public.events for update
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

drop policy if exists "events: honoree can delete" on public.events;
drop policy if exists events_delete on public.events;
create policy events_delete
  on public.events for delete
  using (created_by = auth.uid());

-- 5. event_items RLS — creator can add their items
drop policy if exists "event_items: honoree adds own items" on public.event_items;
drop policy if exists event_items_insert on public.event_items;
create policy event_items_insert
  on public.event_items for insert
  with check (
    exists (
      select 1 from events e
      join items i on i.id = event_items.item_id
      where e.id = event_items.event_id
        and e.created_by = auth.uid()
        and i.owner_id = auth.uid()
    )
  );
