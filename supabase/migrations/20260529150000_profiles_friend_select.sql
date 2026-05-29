-- supabase/migrations/20260529150000_profiles_friend_select.sql
--
-- Let friend-graph friends read each other's profiles.
--
-- The init RLS allowed profile SELECT only for self + group-mates
-- (`shares_group_with`). The friend graph (PR-1) replaced groups-as-audience
-- with symmetric `friendships`, but the profiles policy was never extended.
-- So viewing a pure friend-graph friend's profile via `/p/:id` — which does
-- a direct `from('profiles').select(...)` in `useFriendList` — returned zero
-- rows → the friend-list screen rendered "something went wrong" with a blank
-- avatar. The People directory dodged this because `get_my_people` is
-- SECURITY DEFINER (bypasses RLS).
--
-- Mirror the items-visibility RLS, which already gates on `are_friends()`
-- (SECURITY DEFINER + least/greatest, so it's order-agnostic and won't
-- recurse into friendships RLS). Anonymous callers (auth.uid() null) match
-- nothing.

create policy "profiles: friends can read each other"
  on public.profiles for select
  using (public.are_friends(id, auth.uid()));
