-- SECURITY INVOKER RPC: auto-populated friends list.
-- Returns co-active-participants from events where caller is honoree or active.
-- Excludes self + disabled profiles.
create or replace function public.get_my_people()
returns table (
  user_id              uuid,
  display_name         text,
  handle               text,
  avatar_url           text,
  has_public_list      boolean,
  last_interaction_at  timestamptz
)
language sql security invoker stable
set search_path = public
as $$
  with my_events as (
    select id from public.events where honoree_id = auth.uid()
    union
    select event_id from public.event_participants
      where user_id = auth.uid() and status = 'active'
  ),
  co_participants as (
    select
      ep.user_id,
      max(coalesce(ep.joined_at, ep.invited_at, ep.created_at)) as last_seen
    from public.event_participants ep
    where ep.event_id in (select id from my_events)
      and ep.user_id != auth.uid()
      and ep.status = 'active'
    group by ep.user_id
  )
  select
    p.id,
    p.display_name,
    p.handle::text,
    p.avatar_url,
    p.share_token is not null as has_public_list,
    cp.last_seen
  from co_participants cp
  join public.profiles p on p.id = cp.user_id
  where p.disabled_at is null
  order by cp.last_seen desc;
$$;

grant execute on function public.get_my_people() to authenticated;
