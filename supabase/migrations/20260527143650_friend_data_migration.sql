-- ────────────────────────────────────────────────────────────
-- One-time data migration: circles → friendships, item_groups →
-- visibility, populate add_me_token, snapshot old tables.
-- Wrapped in a function so integration tests can re-run it after
-- truncate_test_state(). In prod the function fires once via the
-- DO block at the bottom.
--
-- Schema notes confirmed during Task 4 implementation:
--   - Group invites live in `public.invites` (not `group_invites`).
--     The table has `group_id NOT NULL` so every row is a group
--     invite; no filter needed.
--   - `group_members.joined_at` is the timestamp column.
-- ────────────────────────────────────────────────────────────
create or replace function public.reapply_friend_backfill()
returns void
language plpgsql security definer
-- `extensions` on search_path so pgcrypto's gen_random_bytes resolves
-- unqualified (the extension lives in the extensions schema).
set search_path = public, extensions
as $$
begin
  -- friendships: cartesian within each group, canonicalised.
  -- gm1.user_id < gm2.user_id guarantees the canonical (lo, hi) order
  -- enforced by the friendships check constraint.
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

  -- items.visibility: 'friends' if in any item_groups, else 'private'.
  -- Only touch items still on the default ('friends', set by
  -- 20260527140032); never overwrite an explicit value a user set
  -- after PR 2. Since 'friends' is the default, an item not in any
  -- item_groups was effectively private before (no group → no
  -- group-mate could see it), so move it to 'private' explicitly.
  update public.items
  set visibility = 'private'
  where visibility = 'friends'
    and not exists (
      select 1 from public.item_groups ig where ig.item_id = items.id
    );

  -- add_me_token: 16 random bytes hex (32 chars), URL-safe.
  update public.profiles
  set add_me_token = encode(gen_random_bytes(16), 'hex')
  where add_me_token is null;

  -- Refresh archive snapshots — re-create on every call so they
  -- always reflect the current source state (idempotent for tests
  -- and safe to re-run in prod if needed during the 7-day window).
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

-- Fire once at install.
do $$ begin
  perform public.reapply_friend_backfill();
end $$;
