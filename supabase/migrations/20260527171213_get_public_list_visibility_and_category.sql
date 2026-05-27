-- ============================================================================
-- get_public_list — privacy fix (visibility filter) + category column
-- ============================================================================
-- Two changes shipped together because they touch the same composite type
-- and RPC, and re-running drop/recreate twice in two adjacent migrations
-- would be wasteful:
--
--   1. PRIVACY LEAK FIX. PR 1 (`20260527140032_friend_graph_add.sql`) added
--      `items.visibility` defaulting to `'friends'`. The previous version of
--      `get_public_list` (see `20260526000000_public_item_priority.sql`)
--      filters only on `status = 'active'`, so anonymous visitors holding a
--      share token were silently shown `'friends'`-tier and `'private'`-tier
--      items too — anything not status-archived. After this migration only
--      `visibility = 'public'` items are exposed via the share URL. The
--      RLS layer already enforces this for authenticated SELECTs against
--      `items`; we're closing the SECURITY DEFINER RPC path that bypasses
--      RLS by design.
--
--   2. PR 2 TASK 8 GAP. The PublicList chip-filter UI was wired but inert
--      — the `public_item` composite didn't carry `category`, so every row
--      read as null and the chip row stayed hidden behind its `items.some(
--      i => i.category)` gate. This migration appends `category` to the
--      composite and adds an optional `_category text default null` filter
--      argument so the chip row activates as soon as data flows.
--
-- Composite-type evolution: same dance as the priority migration. PostgreSQL
-- allows ALTER TYPE ADD ATTRIBUTE but only in transactions that don't
-- already reference the type — so we drop function → drop type cascade →
-- recreate both. The function stays SECURITY DEFINER on anon+authenticated;
-- the recreate restores the exact same grants.
-- ============================================================================

-- 1. Drop the function (it returns the type we're about to replace).
drop function if exists public.get_public_list(text);

-- 2. Drop the composite type. Cascade is paranoia — no other objects
--    reference `public_item` directly, but if a future migration adds a
--    column elsewhere typed against it we want this to survive.
drop type if exists public.public_item cascade;

-- 3. Recreate the composite type with `category` appended as the last
--    field. Order matches the previous shape (priority + created_at)
--    with one new trailing slot, so the row constructor in the RPC body
--    below has to add exactly one expression.
create type public.public_item as (
  id          uuid,
  title       text,
  maker       text,
  url         text,
  price_text  text,
  occasion    text,
  note        text,
  cover_url   text,
  priority    smallint,
  created_at  timestamptz,
  category    text
);

-- 4. Recreate the RPC. Two functional changes vs. the prior version:
--    * `where i.visibility = 'public'` — the privacy fix.
--    * `_category text default null` parameter + optional case-insensitive
--      equality filter on `lower(i.category)`. The default keeps existing
--      callers (`supabase.rpc('get_public_list', { _token })`) working.
create or replace function public.get_public_list(
  _token    text,
  _category text default null
)
returns table (
  owner public.public_owner,
  items public.public_item[]
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  _owner_id  uuid;
  _profile   public.profiles%rowtype;
  _items     public.public_item[];
begin
  if _token is null or _token = '' then
    raise exception 'invite_not_found';
  end if;

  -- Look up by share_token AND disabled_at being null in one shot
  -- so a disabled owner's token reads as "no such share" rather than
  -- a different error code — the public consumer (incl. crawlers)
  -- doesn't need to distinguish "rotated" from "disabled".
  select id into _owner_id
    from public.profiles
   where share_token = _token
     and disabled_at is null;
  if _owner_id is null then
    raise exception 'invite_not_found';
  end if;

  select * into _profile from public.profiles where id = _owner_id;

  select coalesce(
           array_agg(
             row(
               i.id,
               i.title,
               i.maker,
               i.url,
               i.price_text,
               i.occasion,
               i.note,
               i.cover_url,
               i.priority,
               i.created_at,
               i.category
             )::public.public_item
             order by i.created_at desc
           ),
           '{}'::public.public_item[]
         )
    into _items
    from public.items i
   where i.owner_id = _owner_id
     and i.status = 'active'
     and i.visibility = 'public'                                       -- privacy fix
     and (_category is null or lower(i.category) = lower(_category));  -- optional, case-insensitive

  return query select
    row(_profile.display_name, _profile.handle, _profile.avatar_url)::public.public_owner,
    _items;
end;
$$;

revoke all on function public.get_public_list(text, text) from public;
grant execute on function public.get_public_list(text, text) to anon, authenticated;
