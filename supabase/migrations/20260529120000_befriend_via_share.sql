-- ============================================================================
-- befriend_via_share — close the share-link growth loop
-- ============================================================================
-- The public `/share/<token>` page is the product's main viral surface: a
-- list owner pastes the link into a group chat / TikTok bio, and viewers
-- land on a read-only render. Until now that page was a dead end — a viewer
-- could look but had no in-product path back (no signup nudge, no way to
-- connect with the owner).
--
-- This migration adds the server half of the fix:
--
--   1. `befriend_via_share(_share_token)` — a logged-in viewer of a share
--      page can become the owner's mutual friend in one tap. Mirrors
--      `accept_add_me` exactly (canonical-ordered insert, ON CONFLICT
--      DO NOTHING, self-guard) but keys off the owner's `share_token`
--      instead of their `add_me_token`. Treating "owner enabled a public
--      share link" as the same soft consent as "owner published an add-me
--      link": worst case a viewer becomes the owner's friend, gated by the
--      owner being able to rotate/disable the token at any time.
--
--   2. `get_public_list` gains an `owner_id` column so the client can tell
--      whether the viewer is the owner (hide the befriend affordance) and
--      can deep-link to `/p/<owner_id>` once friended. The `public_owner`
--      composite is intentionally NOT touched — the og-image Edge Function
--      reads it by field name and adding a trailing top-level column to the
--      RETURNS TABLE leaves that consumer untouched.
-- ============================================================================

-- ── 1. befriend_via_share ──────────────────────────────────────────────────
create or replace function public.befriend_via_share(_share_token text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  caller   uuid := auth.uid();
  owner_id uuid;
  lo uuid;
  hi uuid;
begin
  if caller is null then
    raise exception 'not_authenticated';
  end if;
  if _share_token is null or _share_token = '' then
    raise exception 'invite_not_found';
  end if;

  -- Same lookup shape as get_public_list: a disabled or rotated token
  -- reads as "no such share" rather than leaking a distinct error.
  select id into owner_id
    from public.profiles
   where share_token = _share_token
     and disabled_at is null;
  if owner_id is null then
    raise exception 'invite_not_found';
  end if;
  if owner_id = caller then
    raise exception 'self_link';
  end if;

  lo := least(owner_id, caller);
  hi := greatest(owner_id, caller);
  insert into public.friendships (user_a, user_b)
  values (lo, hi)
  on conflict do nothing;

  return owner_id;
end;
$$;

grant execute on function public.befriend_via_share(text) to authenticated;

-- ── 2. get_public_list — add owner_id to the return table ────────────────────
-- Return type changes (extra OUT column), so drop + recreate. Body is
-- identical to 20260527171213 except for the trailing `owner_id` select.
drop function if exists public.get_public_list(text, text);

create or replace function public.get_public_list(
  _token    text,
  _category text default null
)
returns table (
  owner    public.public_owner,
  items    public.public_item[],
  owner_id uuid
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
     and i.visibility = 'public'
     and (_category is null or lower(i.category) = lower(_category));

  return query select
    row(_profile.display_name, _profile.handle, _profile.avatar_url)::public.public_owner,
    _items,
    _owner_id;
end;
$$;

revoke all on function public.get_public_list(text, text) from public;
grant execute on function public.get_public_list(text, text) to anon, authenticated;
