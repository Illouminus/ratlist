-- ============================================================================
-- Soft-disable for profile accounts. Sits alongside the moderation report
-- queue: when an `actioned` outcome means "stop this user from being seen
-- publicly", the operator sets `profiles.disabled_at`. Read-side:
--
--   * `get_public_list(_token)` refuses tokens belonging to a disabled
--     owner — kills the abuse vector of a porn-thumbnail-laced wishlist
--     being shared by URL.
--   * Group-member visibility (people inside the same friend circle)
--     is intentionally NOT filtered yet. The exposure surface is
--     trusted-only by design, and rewriting every SELECT policy is a
--     bigger surgery than v1 needs. If a disabled user is also a
--     nuisance inside a circle, the admin in the circle has
--     remove-member powers via the existing UI.
--
-- Re-enabling is just clearing the column. No tombstone; nothing
-- destructive happens at disable time. Their items / claims / santa
-- assignments all stay intact so re-enable is a one-line revert.
-- ============================================================================

alter table public.profiles
  add column if not exists disabled_at timestamptz;

create index if not exists profiles_disabled_idx on public.profiles(disabled_at)
  where disabled_at is not null;

-- Update `get_public_list` to refuse disabled owners. The function is
-- SECURITY DEFINER so we have to patch it explicitly — RLS wouldn't
-- catch this surface even if we'd added a SELECT policy elsewhere.
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
