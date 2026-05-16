-- ============================================================================
-- Extend Realtime publication to cover group changes.
-- ============================================================================
-- The first realtime migration only covered items / item_groups / claims.
-- The UI also needs to react live to:
--
--   groups        — name / description / emoji edits, deletes
--   group_members — joins (new members via redeem_invite), role flips,
--                   kicks, leaves.
--
-- Adding both lets the Groups screen reflect membership changes
-- without a manual refresh, and the GroupCard's member-count update
-- live when someone joins or leaves.
-- ============================================================================

alter publication supabase_realtime add table public.groups;
alter publication supabase_realtime add table public.group_members;

alter table public.groups        replica identity full;
alter table public.group_members replica identity full;
