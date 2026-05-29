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

-- ── 3. Items SELECT RLS — owner OR (shared AND friend) ───────────────────────
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

-- ── 4. can_see_item — add the friendships path ───────────────────────────────
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

-- ── 5. get_public_list — show everything non-private (was: only 'public') ────
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

-- ── 6. get_friend_list — friend's shared items (was: friends + public) ───────
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
    and i.visibility = 'shared'
    and public.are_friends(_friend_id, auth.uid())
    and (_category is null or lower(i.category) = lower(_category));
$$;

grant execute on function public.get_friend_list(uuid, text) to authenticated;

-- ── 7. Keep reapply_friend_backfill valid under the 2-tier model ─────────────
-- The PR1 backfill (20260527143650) guarded its visibility update on the old
-- default ('friends'). Post-collapse that value is gone, so the guard would
-- match nothing and a re-run would silently skip the "ungrouped → private"
-- step. Re-point the guard at the new default ('shared'). Friendships,
-- add_me_token, and archive logic are unchanged. NOT re-fired here — the
-- one-time prod backfill already ran; this only keeps the helper correct for
-- integration tests and any future manual re-run.
create or replace function public.reapply_friend_backfill()
returns void
language plpgsql security definer
set search_path = public, extensions
as $$
begin
  insert into public.friendships (user_a, user_b, created_at)
  select
    gm1.user_id,
    gm2.user_id,
    min(least(gm1.joined_at, gm2.joined_at))
  from public.group_members gm1
  join public.group_members gm2
    on gm1.group_id = gm2.group_id
    and gm1.user_id < gm2.user_id
  group by gm1.user_id, gm2.user_id
  on conflict do nothing;

  -- Ungrouped items still on the default ('shared') become 'private' — an
  -- item in no group had no group-mate audience under the old model. Items
  -- in a group keep 'shared' (visible to the friends those memberships became).
  update public.items
  set visibility = 'private'
  where visibility = 'shared'
    and not exists (
      select 1 from public.item_groups ig where ig.item_id = items.id
    );

  update public.profiles
  set add_me_token = encode(gen_random_bytes(16), 'hex')
  where add_me_token is null;

  drop table if exists public.archive_groups;
  drop table if exists public.archive_group_members;
  drop table if exists public.archive_group_invites;
  drop table if exists public.archive_item_groups;
  create table public.archive_groups        as select * from public.groups;
  create table public.archive_group_members as select * from public.group_members;
  create table public.archive_group_invites as select * from public.invites;
  create table public.archive_item_groups   as select * from public.item_groups;
end;
$$;

grant execute on function public.reapply_friend_backfill() to service_role;
