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
--
-- Why a row policy (not an RPC returning only display columns): the
-- friend-list view also resolves *claimer* profiles through a PostgREST
-- embed (`claims(... user:profiles(...))`) so co-viewers can see who's
-- already claimed a gift. That embed reads `profiles` directly and needs
-- the same friend-visibility, which a single-row RPC wouldn't cover.
--
-- Column exposure — acknowledged, not an oversight: RLS is row-level, so a
-- friend who can SELECT the row could read the non-display columns too
-- (`share_token`, `add_me_token`, `disabled_at`). Accepted at the friend
-- trust level for v1: `share_token` is already public (it's the /share
-- link), `add_me_token` is a shareable + rotatable invite capability, and
-- `disabled_at` is a minor moderation flag. No client over-selects a
-- friend's row (useFriendList enumerates id/display_name/handle/avatar_url).
-- Defense-in-depth follow-up: move the token columns to an owner-only
-- `profile_secrets` table so they're unreachable by any cross-user read.

create policy "profiles: friends can read each other"
  on public.profiles for select
  using (public.are_friends(id, auth.uid()));
