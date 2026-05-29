-- ============================================================================
-- Collapse item visibility: private | friends | public  →  private | shared
-- ============================================================================
-- The 3-tier model (20260527140032) split "friends see it in-app" from
-- "anyone with my link sees it." Playtest data shows users don't engage with
-- audience segmentation (it's why `groups` was retired), and the `friends`
-- default left every fresh share link empty — fighting the share-link growth
-- loop. We collapse to two tiers:
--
--   shared  (default) — visible to your friends in-app AND on your /share link
--   private           — owner only (drafts, surprises, anything you hide)
--
-- The "friend vs anonymous link viewer" difference is preserved, but it now
-- lives in what the VIEWER can do (a logged-in friend can claim + gets the
-- owner-blind magic; an anonymous viewer just reads), gated by auth/friendship
-- — not by a per-item flag.
--
-- Also fixes a latent bug from the friend-graph rollout: `can_see_item` (the
-- helper behind the `claims` policy) was never taught about friendships, so a
-- pure friend-graph friend could SEE a shared item but not claim it. We add
-- the friendships path here, where the visibility semantics live.
-- ============================================================================

-- ── 1. Drop old CHECK first, then backfill, then add the new CHECK ───────────
-- Order matters: the old constraint only allows private/friends/public, so the
-- 'shared' backfill would violate it if dropped after. Drop → update → re-add.
alter table public.items drop constraint if exists items_visibility_check;

update public.items set visibility = 'shared'
 where visibility in ('friends', 'public');

alter table public.items
  add constraint items_visibility_check check (visibility in ('private', 'shared'));
alter table public.items alter column visibility set default 'shared';

-- ── 2. Items SELECT RLS — owner OR (shared AND friend) ───────────────────────
-- Drops the old 3-state policy. Note this also removes the old
-- `visibility = 'public'` branch that made public items visible to ANY
-- authenticated user in-app; anonymous/link access goes through
-- get_public_list (SECURITY DEFINER, bypasses RLS), so a logged-in
-- non-friend correctly no longer sees your items inside the app.
-- The separate "items: visible via event audience" policy is untouched.
drop policy if exists items_select_3state on public.items;

create policy items_select_2state
  on public.items for select
  using (
    owner_id = auth.uid()
    or (visibility = 'shared' and public.are_friends(owner_id, auth.uid()))
  );

-- ── 3. can_see_item — add the friendships path ───────────────────────────────
-- Used by the `claims` policy (owner-blind: `not owns_item AND can_see_item`)
-- and event policies. Owner + legacy item_groups + event-participation paths
-- preserved; the new branch lets friends claim a friend's shared item.
create or replace function public.can_see_item(_item_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select
    exists (select 1 from public.items where id = _item_id and owner_id = auth.uid())
    or exists (
      select 1 from public.items i
      where i.id = _item_id
        and i.visibility = 'shared'
        and public.are_friends(i.owner_id, auth.uid())
    )
    or exists (
      select 1 from public.item_groups ig
      join public.group_members gm on gm.group_id = ig.group_id
      where ig.item_id = _item_id and gm.user_id = auth.uid()
    )
    or exists (
      select 1 from public.event_items ei
      join public.event_participants ep on ep.event_id = ei.event_id
      where ei.item_id = _item_id
        and ep.user_id = auth.uid()
        and ep.status = 'active'
    );
$$;

-- ── 4. get_public_list — show everything non-private (was: only 'public') ────
-- Recreate (body identical to 20260529120000 except the visibility filter).
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
               i.id, i.title, i.maker, i.url, i.price_text, i.occasion,
               i.note, i.cover_url, i.priority, i.created_at, i.category
             )::public.public_item
             order by i.created_at desc
           ),
           '{}'::public.public_item[]
         )
    into _items
    from public.items i
   where i.owner_id = _owner_id
     and i.status = 'active'
     and i.visibility <> 'private'
     and (_category is null or lower(i.category) = lower(_category));

  return query select
    row(_profile.display_name, _profile.handle, _profile.avatar_url)::public.public_owner,
    _items,
    _owner_id;
end;
$$;

revoke all on function public.get_public_list(text, text) from public;
grant execute on function public.get_public_list(text, text) to anon, authenticated;

-- ── 5. get_friend_list — friend's shared items (was: friends + public) ───────
create or replace function public.get_friend_list(
  _friend_id uuid,
  _category  text default null
)
returns setof public.items
language sql stable security definer
set search_path = public
as $$
  select i.*
  from public.items i
  where i.owner_id = _friend_id
    and i.status = 'active'
    and i.visibility = 'shared'
    and public.are_friends(_friend_id, auth.uid())
    and (_category is null or lower(i.category) = lower(_category));
$$;

grant execute on function public.get_friend_list(uuid, text) to authenticated;

-- Note: reapply_friend_backfill (20260527143650) is intentionally NOT
-- recreated here. Its visibility step guards on `visibility = 'friends'`,
-- which is a harmless no-op post-collapse (no row is 'friends' anymore), so a
-- re-run cannot privatise shared items. Re-pointing it at 'shared' would make
-- a re-run wrongly downgrade legitimately-shared items, so the original is
-- left alone. The one-time prod backfill already ran via its install DO block.
