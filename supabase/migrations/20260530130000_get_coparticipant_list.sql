-- ============================================================================
-- get_coparticipant_list — event-discovery read
-- ============================================================================
-- A co-participant of a shared event can read another member's SHARED items so
-- they can "grab an idea" into their own list. SECURITY DEFINER + gated on
-- shares_event_with so it does NOT widen the items SELECT policy and exposes NO
-- claims — copy is the only action on a co-participant's general list.
-- Mirrors get_friend_list, but keyed on co-participation instead of friendship.
-- ============================================================================
create or replace function public.get_coparticipant_list(
  _member_id uuid,
  _category  text default null
)
returns setof public.items
language sql stable security definer
set search_path = public
as $$
  select i.*
  from public.items i
  where i.owner_id = _member_id
    and i.status = 'active'
    and i.visibility = 'shared'
    and public.shares_event_with(_member_id, auth.uid())
    and (_category is null or lower(i.category) = lower(_category));
$$;
grant execute on function public.get_coparticipant_list(uuid, text) to authenticated;
