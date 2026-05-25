-- Extend can_see_item with event-participation path.
-- Legacy item_groups path is preserved.
create or replace function public.can_see_item(_item_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select
    exists (select 1 from public.items where id = _item_id and owner_id = auth.uid())
    or exists (
      select 1 from public.item_groups ig
      join public.group_members gm on gm.group_id = ig.group_id
      where ig.item_id = _item_id and gm.user_id = auth.uid()
    )
    or exists (
      select 1 from public.event_items ei
      join public.event_participants ep on ep.event_id = ei.event_id
      where ei.item_id = _item_id
        and ep.user_id = auth.uid()
        and ep.status = 'active'
    );
$$;
