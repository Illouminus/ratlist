-- Items RLS — rewrite SELECT for 3-state visibility (private / friends /
-- public). Owner-only INSERT/UPDATE/DELETE remain unchanged.
--
-- Old policies replaced:
--   "items: owner can read"                       — redundant; folded into
--                                                   the new policy's
--                                                   `owner_id = auth.uid()`
--                                                   branch.
--   "items: group-mates can read published items" — legacy item_groups
--                                                   model. Backfilled into
--                                                   friendships by Task 4
--                                                   (PR 1's data migration);
--                                                   group-mates that become
--                                                   friends keep visibility
--                                                   via the new policy.
--
-- Old policy KEPT (not friend-graph-related, still load-bearing):
--   "items: visible via event audience"           — event participants must
--                                                   continue to see items
--                                                   the honoree curated on
--                                                   the event, regardless
--                                                   of friend status. This
--                                                   is the link-first event
--                                                   model from 2026-05-24.

drop policy if exists "items: owner can read"                       on public.items;
drop policy if exists "items: group-mates can read published items" on public.items;

create policy items_select_3state
  on public.items for select
  using (
    owner_id = auth.uid()
    or visibility = 'public'
    or (visibility = 'friends' and public.are_friends(owner_id, auth.uid()))
  );
