-- ============================================================================
-- Крыска / wishlist — initial schema
-- ============================================================================
-- Privacy model:
--   * An "owner" never sees claims or comments on their own items.
--   * Group membership gates visibility of everything.
--   * Santa assignments are visible only to the giver (until reveal).
-- All gates are enforced at the database level via RLS — never trust the client.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- Extensions
-- ────────────────────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto"; -- gen_random_uuid()
create extension if not exists "citext";   -- case-insensitive emails

-- ────────────────────────────────────────────────────────────────────────────
-- Updated-at trigger helper
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- profiles — public profile per auth.users row
-- ────────────────────────────────────────────────────────────────────────────
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  handle      citext unique,
  avatar_url  text,
  bio         text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- Auto-create profile on user signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
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
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ────────────────────────────────────────────────────────────────────────────
-- groups — circles of friends. A user can be in many groups.
-- ────────────────────────────────────────────────────────────────────────────
create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  emoji       text,
  description text,
  created_by  uuid not null references public.profiles(id) on delete restrict,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger groups_updated_at
before update on public.groups
for each row execute function public.set_updated_at();

create table public.group_members (
  group_id   uuid not null references public.groups(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text not null default 'member' check (role in ('admin', 'member')),
  joined_at  timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index group_members_user_idx on public.group_members(user_id);

-- Helper: is the current user a member of a given group?
-- SECURITY DEFINER avoids recursive RLS check on group_members itself.
create or replace function public.is_group_member(_group_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = _group_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_group_admin(_group_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = _group_id
      and user_id = auth.uid()
      and role = 'admin'
  );
$$;

-- Helper: do current user and another user share any group?
-- Used to scope profile visibility.
create or replace function public.shares_group_with(_other_user uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members me
    join public.group_members them
      on me.group_id = them.group_id
    where me.user_id = auth.uid()
      and them.user_id = _other_user
  );
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- invites — single-use tokens to join a group
-- ────────────────────────────────────────────────────────────────────────────
create table public.invites (
  token       text primary key default encode(gen_random_bytes(18), 'base64'),
  group_id    uuid not null references public.groups(id) on delete cascade,
  created_by  uuid not null references public.profiles(id) on delete cascade,
  expires_at  timestamptz not null default (now() + interval '14 days'),
  used_at     timestamptz,
  used_by     uuid references public.profiles(id) on delete set null,
  note        text,
  created_at  timestamptz not null default now()
);

create index invites_group_idx on public.invites(group_id);

-- ────────────────────────────────────────────────────────────────────────────
-- items — the wishlist itself
-- ────────────────────────────────────────────────────────────────────────────
create table public.items (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  title       text not null check (length(title) between 1 and 200),
  maker       text,
  url         text,
  price_min   numeric(10, 2),
  price_max   numeric(10, 2),
  currency    text not null default 'EUR' check (length(currency) = 3),
  occasion    text not null default 'anytime'
              check (occasion in ('anytime', 'birthday', 'holidays', 'treat')),
  priority    smallint not null default 2 check (priority between 1 and 3),
  note        text,
  status      text not null default 'active'
              check (status in ('active', 'received', 'archived')),
  cover_url   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger items_updated_at
before update on public.items
for each row execute function public.set_updated_at();

create index items_owner_idx on public.items(owner_id);
create index items_status_idx on public.items(status);

-- Visibility per group: an item can be published to N groups.
create table public.item_groups (
  item_id   uuid not null references public.items(id) on delete cascade,
  group_id  uuid not null references public.groups(id) on delete cascade,
  primary key (item_id, group_id)
);

create index item_groups_group_idx on public.item_groups(group_id);

-- Photos: cover_url on items is just the first one; this table allows more.
create table public.item_photos (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references public.items(id) on delete cascade,
  url        text not null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

create index item_photos_item_idx on public.item_photos(item_id);

-- Helper: is an item visible to me?
-- Either I own it, or it's published to a group I'm in.
create or replace function public.can_see_item(_item_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.items i
    where i.id = _item_id
      and (
        i.owner_id = auth.uid()
        or exists (
          select 1
          from public.item_groups ig
          join public.group_members gm on gm.group_id = ig.group_id
          where ig.item_id = i.id and gm.user_id = auth.uid()
        )
      )
  );
$$;

-- Helper: am I the owner of an item?
create or replace function public.owns_item(_item_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.items
    where id = _item_id and owner_id = auth.uid()
  );
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- claims — reservations on someone's item. HIDDEN FROM OWNER.
-- ────────────────────────────────────────────────────────────────────────────
create table public.claims (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references public.items(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  share       smallint not null default 100 check (share between 1 and 100),
  note        text,
  created_at  timestamptz not null default now(),
  unique (item_id, user_id)
);

create index claims_item_idx on public.claims(item_id);
create index claims_user_idx on public.claims(user_id);

-- ────────────────────────────────────────────────────────────────────────────
-- RLS
-- ────────────────────────────────────────────────────────────────────────────
alter table public.profiles      enable row level security;
alter table public.groups        enable row level security;
alter table public.group_members enable row level security;
alter table public.invites       enable row level security;
alter table public.items         enable row level security;
alter table public.item_groups   enable row level security;
alter table public.item_photos   enable row level security;
alter table public.claims        enable row level security;

-- ── profiles ────────────────────────────────────────────────────────────────
create policy "profiles: self can read self"
  on public.profiles for select
  using (id = auth.uid());

create policy "profiles: group-mates can read each other"
  on public.profiles for select
  using (public.shares_group_with(id));

create policy "profiles: self can update self"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- ── groups ─────────────────────────────────────────────────────────────────
create policy "groups: members can read"
  on public.groups for select
  using (public.is_group_member(id));

create policy "groups: anyone authenticated can create"
  on public.groups for insert
  with check (auth.uid() = created_by);

create policy "groups: admins can update"
  on public.groups for update
  using (public.is_group_admin(id))
  with check (public.is_group_admin(id));

create policy "groups: admins can delete"
  on public.groups for delete
  using (public.is_group_admin(id));

-- After a group is created, the creator must become an admin member.
-- Trigger handles this so the client doesn't have to insert two rows.
create or replace function public.bootstrap_group_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.group_members (group_id, user_id, role)
  values (new.id, new.created_by, 'admin')
  on conflict do nothing;
  return new;
end;
$$;

create trigger groups_bootstrap_admin
after insert on public.groups
for each row execute function public.bootstrap_group_admin();

-- ── group_members ───────────────────────────────────────────────────────────
create policy "group_members: members can read fellow members"
  on public.group_members for select
  using (public.is_group_member(group_id));

create policy "group_members: admins can add members"
  on public.group_members for insert
  with check (public.is_group_admin(group_id));

create policy "group_members: self or admin can remove"
  on public.group_members for delete
  using (user_id = auth.uid() or public.is_group_admin(group_id));

-- ── invites ─────────────────────────────────────────────────────────────────
-- The invite token itself is the secret — we let anyone with the token read it
-- via a SECURITY DEFINER RPC (not via direct table select). Direct table
-- select is restricted to group members.
create policy "invites: group members can read"
  on public.invites for select
  using (public.is_group_member(group_id));

create policy "invites: group members can create"
  on public.invites for insert
  with check (
    public.is_group_member(group_id)
    and created_by = auth.uid()
  );

create policy "invites: creator can revoke"
  on public.invites for delete
  using (created_by = auth.uid() or public.is_group_admin(group_id));

-- RPC to redeem an invite (callable by anyone authenticated, with the token).
create or replace function public.redeem_invite(_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _invite public.invites%rowtype;
begin
  select * into _invite from public.invites where token = _token;
  if not found then
    raise exception 'invite_not_found';
  end if;
  if _invite.used_at is not null then
    raise exception 'invite_already_used';
  end if;
  if _invite.expires_at < now() then
    raise exception 'invite_expired';
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (_invite.group_id, auth.uid(), 'member')
  on conflict do nothing;

  update public.invites
  set used_at = now(), used_by = auth.uid()
  where token = _token;

  return _invite.group_id;
end;
$$;

revoke all on function public.redeem_invite(text) from public;
grant execute on function public.redeem_invite(text) to authenticated;

-- ── items ──────────────────────────────────────────────────────────────────
create policy "items: owner can read"
  on public.items for select
  using (owner_id = auth.uid());

create policy "items: group-mates can read published items"
  on public.items for select
  using (
    exists (
      select 1
      from public.item_groups ig
      join public.group_members gm on gm.group_id = ig.group_id
      where ig.item_id = items.id and gm.user_id = auth.uid()
    )
  );

create policy "items: owner can insert"
  on public.items for insert
  with check (owner_id = auth.uid());

create policy "items: owner can update"
  on public.items for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "items: owner can delete"
  on public.items for delete
  using (owner_id = auth.uid());

-- ── item_groups ─────────────────────────────────────────────────────────────
create policy "item_groups: viewable if item or group is viewable"
  on public.item_groups for select
  using (
    public.owns_item(item_id)
    or public.is_group_member(group_id)
  );

create policy "item_groups: owner can publish to groups they belong to"
  on public.item_groups for insert
  with check (
    public.owns_item(item_id)
    and public.is_group_member(group_id)
  );

create policy "item_groups: owner can unpublish"
  on public.item_groups for delete
  using (public.owns_item(item_id));

-- ── item_photos ─────────────────────────────────────────────────────────────
create policy "item_photos: viewable if item is viewable"
  on public.item_photos for select
  using (public.can_see_item(item_id));

create policy "item_photos: owner manages"
  on public.item_photos for all
  using (public.owns_item(item_id))
  with check (public.owns_item(item_id));

-- ── claims (THE BIG ONE) ────────────────────────────────────────────────────
-- The owner of an item MUST NOT see claims on their own item.
-- Everyone else who can see the item, can see claims on it.
create policy "claims: visible to non-owners who can see the item"
  on public.claims for select
  using (
    not public.owns_item(item_id)
    and public.can_see_item(item_id)
  );

create policy "claims: can't claim your own item"
  on public.claims for insert
  with check (
    user_id = auth.uid()
    and not public.owns_item(item_id)
    and public.can_see_item(item_id)
  );

create policy "claims: only the claimer can release"
  on public.claims for delete
  using (user_id = auth.uid());

create policy "claims: only the claimer can edit their claim"
  on public.claims for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ────────────────────────────────────────────────────────────────────────────
-- Storage buckets
-- ────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 2 * 1024 * 1024, array['image/png','image/jpeg','image/webp']),
  ('items',   'items',   true, 8 * 1024 * 1024, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

-- Storage RLS: any authenticated user can upload to their own folder under the bucket.
-- Folder convention: <user_id>/<filename>
create policy "storage: avatars — authenticated read"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "storage: avatars — owner write"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "storage: avatars — owner update/delete"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "storage: items — authenticated read"
  on storage.objects for select
  using (bucket_id = 'items');

create policy "storage: items — owner write"
  on storage.objects for insert
  with check (
    bucket_id = 'items'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "storage: items — owner update/delete"
  on storage.objects for update
  using (
    bucket_id = 'items'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ────────────────────────────────────────────────────────────────────────────
-- TODO (next migrations):
--   * item_comments (hidden from owner like claims)
--   * notifications
--   * santa_events / santa_participants / santa_exclusions
--     santa_assignments (giver-only RLS) / santa_messages
--   * audit log for claims edits
-- ────────────────────────────────────────────────────────────────────────────
