-- ============================================================================
-- Realtime publication — broadcast row changes to subscribed clients.
-- ============================================================================
-- Supabase creates the empty `supabase_realtime` publication during
-- `supabase start`. Tables only emit Realtime events once they're
-- explicitly added to it. We opt in to the three tables the UI needs
-- to react to in real-time:
--
--   items        — own list updates, friend's list updates
--   item_groups  — publishing/un-publishing an item to a group
--   claims       — appearance/release of a claim on a friend's item
--
-- We deliberately do NOT include `claims` for the item owner's
-- subscriptions: the SELECT RLS on `claims` already hides claims from
-- the item owner, and Realtime is RLS-aware, so the owner won't
-- receive those events anyway. Same goes for other privacy filters
-- (santa_assignments, etc.) — we'll add them when we wire them up to
-- the UI.
-- ============================================================================

alter publication supabase_realtime add table public.items;
alter publication supabase_realtime add table public.item_groups;
alter publication supabase_realtime add table public.claims;

-- REPLICA IDENTITY FULL means UPDATE/DELETE events carry the old row,
-- not just the primary key. Useful for the client to know what got
-- removed when an item it cares about disappears.
alter table public.items        replica identity full;
alter table public.item_groups  replica identity full;
alter table public.claims       replica identity full;
