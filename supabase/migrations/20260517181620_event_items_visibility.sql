-- ============================================================================
-- Items: visible via event audience too
-- ============================================================================
-- The 20260517180518_events migration left a hole in the gift-receiver UX:
-- attaching an item to an event open to circle X did NOT make members of
-- X actually *see* the item. They had to be reachable through the older
-- `item_groups → group_members` path as well. Honorees would publish a
-- birthday curation and friends would see "title: ..., 0 items" — the
-- event was visible but the items beneath it weren't.
--
-- Fix: a third SELECT policy on `items` that opens visibility through
-- `event_items → event_circles → group_members`. PostgreSQL OR's SELECT
-- policies, so this only ever *adds* visibility — anything previously
-- hidden by the existing two policies stays hidden unless it now also
-- matches the new path. And the path requires the honoree to have taken
-- two deliberate acts (attach item to event, attach event to circle), so
-- nothing leaks accidentally.
--
-- Same reasoning for `can_see_item`: it's used by `event_items`'s own
-- SELECT policy and by claim-related policies, so it has to recognise
-- the new visibility path or guests would see the event row but still
-- get filtered out of `event_items` on the very next query.
-- ============================================================================

create policy "items: visible via event audience"
  on public.items for select
  using (
    exists (
      select 1
      from public.event_items ei
      join public.event_circles ec on ec.event_id = ei.event_id
      join public.group_members gm on gm.group_id = ec.group_id
      where ei.item_id = items.id and gm.user_id = auth.uid()
    )
  );

create or replace function public.can_see_item(_item_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.items i
    where i.id = _item_id
      and (
        i.owner_id = auth.uid()
        or exists (
          select 1
          from public.item_groups ig
          join public.group_members gm on gm.group_id = ig.group_id
          where ig.item_id = i.id and gm.user_id = auth.uid()
        )
        or exists (
          select 1
          from public.event_items ei
          join public.event_circles ec on ec.event_id = ei.event_id
          join public.group_members gm on gm.group_id = ec.group_id
          where ei.item_id = i.id and gm.user_id = auth.uid()
        )
      )
  );
$$;
