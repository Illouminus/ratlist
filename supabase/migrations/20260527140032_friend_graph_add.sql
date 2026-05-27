-- Symmetric friend edge. Canonical ordering (user_a < user_b) gives
-- exactly one row per pair, prevents (a,b)+(b,a) duplicates.
create table public.friendships (
  user_a     uuid not null references public.profiles(id) on delete cascade,
  user_b     uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create index friendships_user_b_idx on public.friendships(user_b);

-- Pending friend invite (option A — email magic-link). Single-use via
-- accepted_at. No expiry.
create table public.friend_invites (
  token       text primary key,
  from_user   uuid not null references public.profiles(id) on delete cascade,
  to_email    text not null,
  message     text,
  created_at  timestamptz not null default now(),
  accepted_at timestamptz,
  unique (from_user, to_email)
);
create index friend_invites_from_user_idx on public.friend_invites(from_user);

-- Per-user public "add me" link (option C). Rotatable.
alter table public.profiles
  add column add_me_token text unique;

-- 3-state visibility on items, default 'friends'.
alter table public.items
  add column visibility text not null default 'friends'
  check (visibility in ('private', 'friends', 'public'));

-- Freeform category, null = "Uncategorised".
alter table public.items
  add column category text;
create index items_owner_category_idx
  on public.items (owner_id, category)
  where category is not null;

-- RLS on friendships:
--   - SELECT: only the two members of the edge can see it.
--   - INSERT/UPDATE/DELETE: only via SECURITY DEFINER RPCs in Task 2.
alter table public.friendships enable row level security;
create policy friendships_select_self
  on public.friendships for select
  using (user_a = auth.uid() or user_b = auth.uid());
-- No INSERT/UPDATE/DELETE policies → blocked for non-service-role.

-- RLS on friend_invites:
--   - SELECT: only sender (from_user). Recipient never reads directly.
--     Acceptance happens via SECURITY DEFINER RPC.
--   - INSERT/UPDATE/DELETE: only via SECURITY DEFINER RPC.
alter table public.friend_invites enable row level security;
create policy friend_invites_select_sender
  on public.friend_invites for select
  using (from_user = auth.uid());

-- Extend integration-test truncate to cover the new tables so tests
-- get a clean slate between cases.
create or replace function public.truncate_test_state()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  truncate table
    public.santa_assignments,
    public.santa_exclusions,
    public.santa_participants,
    public.santa_events,
    public.event_participants,
    public.event_items,
    public.events,
    public.claims,
    public.item_photos,
    public.item_groups,
    public.items,
    public.invites,
    public.group_members,
    public.groups,
    public.reports,
    public.friend_invites,
    public.friendships
    restart identity
    cascade;
end;
$$;
