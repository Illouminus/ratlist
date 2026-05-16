-- ============================================================================
-- get_my_groups() — list groups the caller belongs to, with the caller's
-- role and the group's member count, in a single round-trip.
-- ============================================================================
-- The view-via-RPC pattern keeps the JS client simple (`.rpc('get_my_groups')`)
-- and lets us return exactly the shape the UI wants without juggling
-- PostgREST embed/filter quirks. Runs as the caller (SECURITY INVOKER) so the
-- underlying RLS on `groups` and `group_members` still applies.
-- ============================================================================

create or replace function public.get_my_groups()
returns table (
  id          uuid,
  name        text,
  emoji       text,
  description text,
  created_by  uuid,
  created_at  timestamptz,
  updated_at  timestamptz,
  role        text,
  member_count bigint
)
language sql stable security invoker
set search_path = public
as $$
  select
    g.id,
    g.name,
    g.emoji,
    g.description,
    g.created_by,
    g.created_at,
    g.updated_at,
    gm.role,
    mc.member_count
  from public.groups g
  join public.group_members gm
    on gm.group_id = g.id
   and gm.user_id  = auth.uid()
  join lateral (
    select count(*)::bigint as member_count
    from public.group_members
    where group_id = g.id
  ) mc on true
  order by g.created_at desc;
$$;

revoke all     on function public.get_my_groups() from public;
grant  execute on function public.get_my_groups() to authenticated;
