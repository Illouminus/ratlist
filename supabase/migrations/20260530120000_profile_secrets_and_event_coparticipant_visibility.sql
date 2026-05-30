-- ============================================================================
-- profile_secrets + event co-participant profile visibility
-- ============================================================================
-- Two coupled changes that MUST ship together; the ORDER is load-bearing:
--   1. Move share_token + add_me_token out of `profiles` into an owner-read-only
--      `profile_secrets` table. Closes the token exposure the friend-view SELECT
--      policy (20260529150000) opened, and is the prerequisite for (2).
--   2. Add shares_event_with(a,b) + a `profiles` SELECT policy letting event
--      co-participants read each other's now-token-free profile rows. This makes
--      the claims-embed in useEvent resolve for non-friend co-participants
--      (critical bug F: co-participants couldn't see who claimed) and powers the
--      new guest-facing participant UI.
-- Token move FIRST so the new cross-user profile read can't leak a token.
-- ============================================================================

-- ── 1. profile_secrets: owner-only home for the two tokens ───────────────────
create table public.profile_secrets (
  user_id      uuid primary key references public.profiles(id) on delete cascade,
  share_token  text unique,
  add_me_token text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger profile_secrets_updated_at
  before update on public.profile_secrets
  for each row execute function public.set_updated_at();

alter table public.profile_secrets enable row level security;

-- Self-read only. No INSERT/UPDATE/DELETE policy: every write goes through a
-- SECURITY DEFINER RPC (set_share_token / rotate_add_me_token) or the
-- handle_new_user trigger, all of which bypass RLS.
create policy "profile_secrets: self can read own"
  on public.profile_secrets for select
  using (user_id = auth.uid());

-- ── 2. Backfill from the columns we're about to drop ─────────────────────────
-- Preserve every existing share_token (nullable) and add_me_token; mint a fresh
-- add_me_token for any legacy row that never had one (handle_new_user never set
-- it, so accounts created after 20260527140032 may be null).
insert into public.profile_secrets (user_id, share_token, add_me_token)
select
  p.id,
  p.share_token,
  coalesce(p.add_me_token, encode(extensions.gen_random_bytes(16), 'hex'))
from public.profiles p
on conflict (user_id) do nothing;

-- ── 3. New profiles get a secrets row automatically ──────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, handle)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    null
  )
  on conflict (id) do nothing;

  insert into public.profile_secrets (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- ── 4. Rewrite the six RPCs that read/write the tokens ───────────────────────

-- set_share_token: write to profile_secrets
create or replace function public.set_share_token(_enabled boolean)
returns text
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  _caller uuid := auth.uid();
  _token  text;
begin
  if _caller is null then raise exception 'not_authenticated'; end if;
  if _enabled then
    _token := translate(encode(gen_random_bytes(18), 'base64'), '+/=', '-_');
    update public.profile_secrets set share_token = _token where user_id = _caller;
  else
    update public.profile_secrets set share_token = null where user_id = _caller;
    _token := null;
  end if;
  return _token;
end;
$$;
revoke all     on function public.set_share_token(boolean) from public;
grant  execute on function public.set_share_token(boolean) to authenticated;

-- rotate_add_me_token: write to profile_secrets
create or replace function public.rotate_add_me_token()
returns text
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  caller    uuid := auth.uid();
  new_token text;
begin
  if caller is null then raise exception 'not_authenticated'; end if;
  new_token := encode(gen_random_bytes(16), 'hex');
  update public.profile_secrets set add_me_token = new_token where user_id = caller;
  return new_token;
end;
$$;
grant execute on function public.rotate_add_me_token() to authenticated;

-- get_public_list: token lookup now joins profile_secrets → profiles
-- (disabled_at stays on profiles). Body otherwise identical to 20260529130000.
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
language plpgsql security definer set search_path = public stable
as $$
declare
  _owner_id uuid;
  _profile  public.profiles%rowtype;
  _items    public.public_item[];
begin
  if _token is null or _token = '' then raise exception 'invite_not_found'; end if;

  select p.id into _owner_id
    from public.profile_secrets s
    join public.profiles p on p.id = s.user_id
   where s.share_token = _token
     and p.disabled_at is null;
  if _owner_id is null then raise exception 'invite_not_found'; end if;

  select * into _profile from public.profiles where id = _owner_id;

  select coalesce(
           array_agg(
             row(i.id, i.title, i.maker, i.url, i.price_text, i.occasion,
                 i.note, i.cover_url, i.priority, i.created_at, i.category)::public.public_item
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
revoke all     on function public.get_public_list(text, text) from public;
grant  execute on function public.get_public_list(text, text) to anon, authenticated;

-- befriend_via_share: token lookup joins profile_secrets → profiles
create or replace function public.befriend_via_share(_share_token text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  caller   uuid := auth.uid();
  owner_id uuid;
  lo uuid;
  hi uuid;
begin
  if caller is null then raise exception 'not_authenticated'; end if;
  if _share_token is null or _share_token = '' then raise exception 'invite_not_found'; end if;

  select p.id into owner_id
    from public.profile_secrets s
    join public.profiles p on p.id = s.user_id
   where s.share_token = _share_token
     and p.disabled_at is null;
  if not found then raise exception 'invite_not_found'; end if;
  if owner_id = caller then raise exception 'self_link'; end if;

  lo := least(owner_id, caller);
  hi := greatest(owner_id, caller);
  insert into public.friendships (user_a, user_b) values (lo, hi) on conflict do nothing;
  return owner_id;
end;
$$;
grant execute on function public.befriend_via_share(text) to authenticated;

-- accept_add_me: lookup by profile_secrets.add_me_token
create or replace function public.accept_add_me(_token text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  caller   uuid := auth.uid();
  owner_id uuid;
  lo uuid;
  hi uuid;
begin
  if caller is null then raise exception 'not_authenticated'; end if;
  select user_id into owner_id from public.profile_secrets where add_me_token = _token;
  if not found then raise exception 'token_not_found'; end if;
  if owner_id = caller then raise exception 'self_link'; end if;
  lo := least(owner_id, caller);
  hi := greatest(owner_id, caller);
  insert into public.friendships (user_a, user_b) values (lo, hi) on conflict do nothing;
  return owner_id;
end;
$$;
grant execute on function public.accept_add_me(text) to authenticated;

-- get_add_me_preview: lookup joins profile_secrets → profiles
create or replace function public.get_add_me_preview(_token text)
returns table (id uuid, display_name text, handle text, avatar_url text)
language sql stable security definer set search_path = public
as $$
  select p.id, p.display_name, p.handle, p.avatar_url
  from public.profile_secrets s
  join public.profiles p on p.id = s.user_id
  where s.add_me_token = _token
    and p.disabled_at is null;
$$;
revoke all     on function public.get_add_me_preview(text) from public;
grant  execute on function public.get_add_me_preview(text) to anon, authenticated;

-- ── 5. Drop the columns now that nothing reads them ──────────────────────────
alter table public.profiles drop column share_token;
alter table public.profiles drop column add_me_token;

-- ── 6. shares_event_with(a,b): order-agnostic co-participation ────────────────
-- True when a and b are both ACTIVE in a common event, OR one is the honoree of
-- an event the other is active in. SECURITY DEFINER so the profiles SELECT
-- policy that calls it doesn't recurse through event_participants RLS. Mirrors
-- the order-agnostic style of are_friends.
create or replace function public.shares_event_with(_a uuid, _b uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.event_participants pa
    join public.event_participants pb on pa.event_id = pb.event_id
    where pa.user_id = _a and pa.status = 'active'
      and pb.user_id = _b and pb.status = 'active'
  )
  or exists (
    select 1
    from public.events e
    join public.event_participants p on p.event_id = e.id
    where p.status = 'active'
      and ( (e.honoree_id = _a and p.user_id = _b)
         or (e.honoree_id = _b and p.user_id = _a) )
  );
$$;
grant execute on function public.shares_event_with(uuid, uuid) to authenticated;

-- ── 7. profiles SELECT: event co-participants can read each other ─────────────
create policy "profiles: event co-participants can read each other"
  on public.profiles for select
  using (public.shares_event_with(id, auth.uid()));

-- ── 8. get_my_people: has_public_list must read from profile_secrets ─────────
-- get_my_people derived `has_public_list` from `p.share_token is not null`,
-- which we just dropped. It is SECURITY INVOKER, so reading another user's
-- profile_secrets directly would be RLS-blocked → a tiny SECURITY DEFINER
-- helper computes the flag.
create or replace function public.profile_has_share(_user uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profile_secrets s
    where s.user_id = _user and s.share_token is not null
  );
$$;
grant execute on function public.profile_has_share(uuid) to authenticated;

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
    public.profile_has_share(p.id) as has_public_list,
    cp.last_seen
  from co_participants cp
  join public.profiles p on p.id = cp.user_id
  where p.disabled_at is null
  order by cp.last_seen desc;
$$;
grant execute on function public.get_my_people() to authenticated;

-- ── 9. reapply_friend_backfill: drop the now-obsolete add_me_token step ───────
-- add_me_token now lives in profile_secrets (auto-minted by a NOT NULL default),
-- so the legacy "backfill null add_me_token on profiles" step is both dead and
-- broken post-column-drop. Friendships + visibility + archive steps unchanged.
-- The one-time install-time call in 20260527143650 already ran against the old
-- schema; this redefinition only affects later callers (the migration test).
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

  update public.items
  set visibility = 'private'
  where visibility = 'friends'
    and not exists (
      select 1 from public.item_groups ig where ig.item_id = items.id
    );

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
