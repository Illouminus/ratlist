-- ============================================================================
-- get_people() v2 — adds a preview of recent items + last-updated timestamp.
-- ============================================================================
-- The People screen previously rendered just a name and a "shared groups
-- count". Design v2 wants each row to show the three most recent item
-- titles from that person's list and a "updated X ago" caveat — useful
-- signal so the user can tell which list is fresh before tapping in.
--
-- We replace (CREATE OR REPLACE) the function with the same parameters
-- and a wider return shape. Callers that destructure the row gracefully
-- get new fields; callers selecting specific columns are unaffected.
--
-- Privacy:
--   `item_count`, `latest_at` and `preview_titles` only count items the
--   caller can already see — i.e. items the peer owns AND has published
--   to at least one group the caller is also in. This filtering is done
--   inside the function (an EXISTS clause against `item_groups` ∩
--   `group_members`) instead of relying on the items RLS policy, because
--   the function is SECURITY INVOKER and aggregates over items.
-- ============================================================================

drop function if exists public.get_people();

create or replace function public.get_people()
returns table (
  id                  uuid,
  display_name        text,
  handle              text,
  avatar_url          text,
  shared_group_count  bigint,
  item_count          bigint,
  latest_at           timestamptz,
  preview_titles      text[]
)
language sql stable security invoker
set search_path = public
as $$
  with peers as (
    -- Distinct peers sharing at least one group with the caller. We
    -- compute shared_group_count here so it doesn't have to fight with
    -- the items aggregation later.
    select
      p.id,
      p.display_name,
      p.handle,
      p.avatar_url,
      count(distinct gm_them.group_id)::bigint as shared_group_count
    from public.profiles p
    join public.group_members gm_them on gm_them.user_id = p.id
    join public.group_members gm_me
      on gm_me.group_id = gm_them.group_id
     and gm_me.user_id  = auth.uid()
    where p.id <> auth.uid()
    group by p.id, p.display_name, p.handle, p.avatar_url
  ),
  -- Items the caller is allowed to see, owner_id keyed. Mirrors the RLS
  -- check on items.select: owner OR (visible-via-item_groups).
  visible_items as (
    select i.id, i.owner_id, i.title, i.created_at
    from public.items i
    where i.status = 'active'
      and exists (
        select 1
        from public.item_groups ig
        join public.group_members gm on gm.group_id = ig.group_id
        where ig.item_id = i.id and gm.user_id = auth.uid()
      )
  ),
  agg as (
    -- Aggregate counts and latest timestamp per peer.
    select owner_id,
           count(*)::bigint as item_count,
           max(created_at)  as latest_at
    from visible_items
    group by owner_id
  ),
  -- 3 most recent titles per peer. ROW_NUMBER() lets us cap without a
  -- correlated subquery, then ARRAY_AGG collapses them in order.
  recent as (
    select owner_id, title, rn
    from (
      select owner_id, title,
             row_number() over (partition by owner_id order by created_at desc) as rn
      from visible_items
    ) ranked
    where rn <= 3
  ),
  preview as (
    select owner_id, array_agg(title order by rn) as titles
    from recent
    group by owner_id
  )
  select
    peers.id,
    peers.display_name,
    peers.handle,
    peers.avatar_url,
    peers.shared_group_count,
    coalesce(agg.item_count, 0)        as item_count,
    agg.latest_at                       as latest_at,
    coalesce(preview.titles, '{}'::text[]) as preview_titles
  from peers
  left join agg     on agg.owner_id     = peers.id
  left join preview on preview.owner_id = peers.id
  order by peers.display_name;
$$;

revoke all     on function public.get_people() from public;
grant  execute on function public.get_people() to authenticated;
