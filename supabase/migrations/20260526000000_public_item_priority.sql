-- ============================================================================
-- Add priority to the public share view.
-- ============================================================================
-- Friends/groups/event-participants already see item priority. Anon visitors
-- to /share/<token> were previously not shown priority — reversing that so
-- the sectioned UI added in the priority-DnD feature renders correctly for
-- everyone, not just authenticated viewers.
--
-- Composite-type evolution: PostgreSQL allows ALTER TYPE ADD ATTRIBUTE, but
-- only in transactions that don't already reference the type. The cleanest
-- approach is drop function → drop type cascade → recreate both. The
-- function is SECURITY DEFINER on anon+authenticated; the recreate restores
-- the exact same grants.
-- ============================================================================

-- 1. Drop the function (it returns the type we're about to drop).
drop function if exists public.get_public_list(text);

-- 2. Drop the composite type (cascades through any other references — none
--    expected, but cascade keeps the migration robust).
drop type if exists public.public_item cascade;

-- 3. Recreate the composite type, this time including priority.
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
  created_at  timestamptz
);

-- 4. Recreate the RPC. Body is identical to the prior version except the
--    row constructor now includes i.priority in the right ordinal slot.
--    Uses the disabled_at-inline approach from the disabled_accounts
--    migration (20260517175752) — the most recent authoritative definition.
create or replace function public.get_public_list(_token text)
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
               i.created_at
             )::public.public_item
             order by i.created_at desc
           ),
           '{}'::public.public_item[]
         )
    into _items
    from public.items i
   where i.owner_id = _owner_id
     and i.status = 'active';

  return query select
    row(_profile.display_name, _profile.handle, _profile.avatar_url)::public.public_owner,
    _items;
end;
$$;

revoke all on function public.get_public_list(text) from public;
grant execute on function public.get_public_list(text) to anon, authenticated;
