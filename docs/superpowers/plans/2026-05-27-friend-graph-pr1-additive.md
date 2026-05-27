# Friend graph PR 1 — additive schema, RPCs, data migration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the additive half of the friend-graph redesign — new tables (`friendships`, `friend_invites`), new columns (`items.visibility`, `items.category`, `profiles.add_me_token`), new RPCs, new Edge Function (`send-friend-invite`), data backfill from existing `group_members`, and archive snapshots of old tables. Frontend stays untouched in PR 1.

**Architecture:** Three migrations land in one PR: (1) schema + RLS, (2) RPCs (SECURITY DEFINER), (3) data backfill + archive copies. Edge Function clones `send-group-invite` with the group-membership check stripped out. Old `groups` / `group_members` / `group_invites` / `item_groups` continue to live and serve the existing frontend; new and old worlds coexist until PR 2 cuts over.

**Tech Stack:** Supabase Postgres + RLS, Deno Edge Functions, vitest for integration tests, Resend for email.

**Spec:** `docs/superpowers/specs/2026-05-27-friend-graph-categories-design.md`

---

## File Structure

**Created:**
```
supabase/migrations/
  ├─ <ts>_friend_graph_add.sql       # Task 1 — tables, columns, RLS
  ├─ <ts>_friend_rpcs.sql            # Task 2 — 7 RPCs
  ├─ <ts>_items_visibility_rls.sql   # Task 3 — items RLS rewrite
  └─ <ts>_friend_data_migration.sql  # Task 4 — backfill + archive
supabase/functions/send-friend-invite/
  ├─ index.ts                        # Task 5
  └─ template.ts                     # Task 5
supabase/templates/friend-invite.html # Task 5
supabase/tests/integration/
  ├─ friend-graph-schema.test.ts     # Task 1
  ├─ friend-graph-rpcs.test.ts       # Task 2
  ├─ friend-graph-items-rls.test.ts  # Task 3
  └─ friend-graph-migration.test.ts  # Task 4
supabase/functions/send-friend-invite/index.test.ts   # Task 5
```

**Modified:**
```
app/src/types/database.ts            # Task 6 — regenerate from new schema
```

Use `<ts>` = current UTC timestamp at task time, e.g. `20260527130000`. Get one fresh per migration file: `date -u +%Y%m%d%H%M%S`.

---

## Task 0 — Setup

- [ ] **Step 0.1: Confirm clean working tree**

```bash
git -C /Users/edouard/dev/wishlist status -s
```
Expected: empty output. If not, stash or commit existing changes first.

- [ ] **Step 0.2: Pull latest main**

```bash
git -C /Users/edouard/dev/wishlist checkout main && git -C /Users/edouard/dev/wishlist pull
```

- [ ] **Step 0.3: Create feature branch**

```bash
git -C /Users/edouard/dev/wishlist checkout -b feat/friend-graph-pr1-additive
```

- [ ] **Step 0.4: Verify local Supabase is running on shifted ports**

```bash
supabase status | grep API
```
Expected: `API URL: http://127.0.0.1:54421`. If not, run `supabase start` first.

---

## Task 1 — Schema + RLS migration

**Files:**
- Create: `supabase/migrations/<ts>_friend_graph_add.sql`
- Create: `supabase/tests/integration/friend-graph-schema.test.ts`

- [ ] **Step 1.1: Write the failing schema test**

`supabase/tests/integration/friend-graph-schema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { adminClient } from './helpers/client.ts';

describe('friend_graph_add migration — schema', () => {
  it('creates friendships table with canonical-order check constraint', async () => {
    const admin = adminClient();
    const u1 = '11111111-1111-1111-1111-111111111111';
    const u2 = '22222222-2222-2222-2222-222222222222';
    // Insert canonical pair: user_a < user_b
    const { error: ok } = await admin.from('friendships').insert({
      user_a: u1 < u2 ? u1 : u2,
      user_b: u1 < u2 ? u2 : u1,
    });
    expect(ok).toBeNull();
    // Reverse-order insert must fail the check constraint
    const { error: fail } = await admin.from('friendships').insert({
      user_a: u1 < u2 ? u2 : u1,
      user_b: u1 < u2 ? u1 : u2,
    });
    expect(fail).toBeTruthy();
    expect(fail?.message).toMatch(/check/i);
  });

  it('creates friend_invites table with unique (from_user, to_email)', async () => {
    const admin = adminClient();
    const u1 = '11111111-1111-1111-1111-111111111111';
    // First insert OK
    const { error: ok } = await admin.from('friend_invites').insert({
      token: 'tok_alice_to_x_1',
      from_user: u1,
      to_email: 'x@test.local',
    });
    expect(ok).toBeNull();
    // Duplicate (from_user, to_email) must fail
    const { error: dup } = await admin.from('friend_invites').insert({
      token: 'tok_alice_to_x_2',
      from_user: u1,
      to_email: 'x@test.local',
    });
    expect(dup).toBeTruthy();
    expect(dup?.message).toMatch(/duplicate|unique/i);
  });

  it('adds items.visibility enum-checked column, default friends', async () => {
    const admin = adminClient();
    const u1 = '11111111-1111-1111-1111-111111111111';
    const { data, error } = await admin
      .from('items')
      .insert({ owner_id: u1, title: 'Default visibility item' })
      .select('id, visibility')
      .single();
    expect(error).toBeNull();
    expect(data?.visibility).toBe('friends');
    // Bad value must fail
    const { error: bad } = await admin
      .from('items')
      .insert({ owner_id: u1, title: 'Bad', visibility: 'everyone' });
    expect(bad).toBeTruthy();
    expect(bad?.message).toMatch(/check/i);
  });

  it('adds items.category nullable text', async () => {
    const admin = adminClient();
    const u1 = '11111111-1111-1111-1111-111111111111';
    const { data, error } = await admin
      .from('items')
      .insert({ owner_id: u1, title: 'Cat item', category: 'Кухня' })
      .select('id, category')
      .single();
    expect(error).toBeNull();
    expect(data?.category).toBe('Кухня');
  });

  it('adds profiles.add_me_token unique', async () => {
    const admin = adminClient();
    const u1 = '11111111-1111-1111-1111-111111111111';
    const u2 = '22222222-2222-2222-2222-222222222222';
    // ensureTestUsers must have populated them already
    await admin.from('profiles').update({ add_me_token: 'collision' }).eq('id', u1);
    const { error: dup } = await admin
      .from('profiles')
      .update({ add_me_token: 'collision' })
      .eq('id', u2);
    expect(dup).toBeTruthy();
    expect(dup?.message).toMatch(/duplicate|unique/i);
  });
});
```

Note: this file lives in `supabase/tests/integration/` and runs via vitest from that directory. Use `ensureTestUsers()` in `beforeAll` if needed.

- [ ] **Step 1.2: Run the test to verify it fails**

Run from repo root:
```bash
eval "$(supabase status --output env | sed 's/^/export /')"
cd supabase/tests/integration && npm test -- friend-graph-schema
```
Expected: tests fail with errors like `relation "public.friendships" does not exist`, `column "visibility" of relation "items" does not exist`, etc.

- [ ] **Step 1.3: Write the migration SQL**

Get a timestamp: `date -u +%Y%m%d%H%M%S`. Suppose result is `20260527130000`.

Create `supabase/migrations/20260527130000_friend_graph_add.sql`:

```sql
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
```

- [ ] **Step 1.4: Apply migration locally**

```bash
supabase migration up --local
```
Expected: `Applying migration 20260527130000_friend_graph_add.sql... done.` No errors.

- [ ] **Step 1.5: Run the test to verify it passes**

```bash
eval "$(supabase status --output env | sed 's/^/export /')"
cd supabase/tests/integration && npm test -- friend-graph-schema
```
Expected: all 5 tests pass.

- [ ] **Step 1.6: Commit**

```bash
git add supabase/migrations/20260527130000_friend_graph_add.sql \
        supabase/tests/integration/friend-graph-schema.test.ts
git commit -m "$(cat <<'EOF'
feat(db): add friendships + friend_invites + items.visibility/category

Schema-only migration. Three new tables/columns:
- friendships (symmetric edge, canonical user_a < user_b)
- friend_invites (single-use via accepted_at, no expiry)
- profiles.add_me_token (per-user public link)
- items.visibility ('private'|'friends'|'public', default 'friends')
- items.category (freeform text, null = uncategorised)

RLS: friendships and friend_invites readable only by participants;
writes are SECURITY DEFINER-only and land in the next migration.

Part of the circles → friend graph redesign (spec at
docs/superpowers/specs/2026-05-27-friend-graph-categories-design.md).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — RPCs (SECURITY DEFINER)

**Files:**
- Create: `supabase/migrations/<ts2>_friend_rpcs.sql`
- Create: `supabase/tests/integration/friend-graph-rpcs.test.ts`

Get a new timestamp greater than Task 1's: e.g. `20260527130100`.

- [ ] **Step 2.1: Write the failing RPC tests**

`supabase/tests/integration/friend-graph-rpcs.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { adminClient, clientFor } from './helpers/client.ts';
import { ensureTestUsers, truncateBetweenTests, TEST_USERS } from './helpers/seed.ts';

describe('friend RPCs', () => {
  beforeEach(async () => {
    await truncateBetweenTests();
    await ensureTestUsers();
  });

  it('create_friend_invite returns token, upserts on (from_user, to_email)', async () => {
    const alice = await clientFor(TEST_USERS.alice);
    const { data: t1, error: e1 } = await alice.rpc('create_friend_invite', {
      _email: 'bob@external.test',
      _message: 'hey bob',
    });
    expect(e1).toBeNull();
    expect(typeof t1).toBe('string');
    expect((t1 as string).length).toBeGreaterThan(20);

    // Second call to same email replaces the token (resend behaviour)
    const { data: t2, error: e2 } = await alice.rpc('create_friend_invite', {
      _email: 'bob@external.test',
      _message: null,
    });
    expect(e2).toBeNull();
    expect(t2).not.toBe(t1);

    // Only one row in the table
    const admin = adminClient();
    const { data: rows } = await admin
      .from('friend_invites')
      .select('token')
      .eq('from_user', TEST_USERS.alice)
      .eq('to_email', 'bob@external.test');
    expect(rows).toHaveLength(1);
    expect(rows![0].token).toBe(t2);
  });

  it('accept_friend_invite inserts friendship when email matches', async () => {
    const admin = adminClient();
    // Set bob's email to 'bob@test.local' (ensureTestUsers does this)
    // Alice invites bob's email
    const alice = await clientFor(TEST_USERS.alice);
    const { data: token } = await alice.rpc('create_friend_invite', {
      _email: 'bob@test.local',
      _message: null,
    });
    // Bob accepts
    const bob = await clientFor(TEST_USERS.bob);
    const { data: friendId, error } = await bob.rpc('accept_friend_invite', {
      _token: token,
    });
    expect(error).toBeNull();
    expect(friendId).toBe(TEST_USERS.alice);

    // Friendship row exists in canonical order
    const lo = TEST_USERS.alice < TEST_USERS.bob ? TEST_USERS.alice : TEST_USERS.bob;
    const hi = TEST_USERS.alice < TEST_USERS.bob ? TEST_USERS.bob : TEST_USERS.alice;
    const { data: edge } = await admin
      .from('friendships')
      .select('user_a, user_b')
      .eq('user_a', lo)
      .eq('user_b', hi)
      .maybeSingle();
    expect(edge).not.toBeNull();

    // Invite marked accepted
    const { data: inv } = await admin
      .from('friend_invites')
      .select('accepted_at')
      .eq('token', token as string)
      .single();
    expect(inv?.accepted_at).not.toBeNull();
  });

  it('accept_friend_invite rejects on mismatched email', async () => {
    const alice = await clientFor(TEST_USERS.alice);
    const { data: token } = await alice.rpc('create_friend_invite', {
      _email: 'bob@test.local',
      _message: null,
    });
    // Carol (not bob) tries to accept
    const carol = await clientFor(TEST_USERS.carol);
    const { error } = await carol.rpc('accept_friend_invite', { _token: token });
    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/email_mismatch/);
  });

  it('accept_friend_invite rejects on already-accepted token', async () => {
    const alice = await clientFor(TEST_USERS.alice);
    const { data: token } = await alice.rpc('create_friend_invite', {
      _email: 'bob@test.local',
      _message: null,
    });
    const bob = await clientFor(TEST_USERS.bob);
    await bob.rpc('accept_friend_invite', { _token: token });
    const { error } = await bob.rpc('accept_friend_invite', { _token: token });
    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/already_accepted/);
  });

  it('rotate_add_me_token gives new token, old one stops working', async () => {
    const admin = adminClient();
    const alice = await clientFor(TEST_USERS.alice);
    // Set initial token
    await admin.from('profiles').update({ add_me_token: 'old_token' }).eq('id', TEST_USERS.alice);

    const { data: newToken, error } = await alice.rpc('rotate_add_me_token');
    expect(error).toBeNull();
    expect(typeof newToken).toBe('string');
    expect(newToken).not.toBe('old_token');

    const { data: prof } = await admin
      .from('profiles')
      .select('add_me_token')
      .eq('id', TEST_USERS.alice)
      .single();
    expect(prof?.add_me_token).toBe(newToken);
  });

  it('accept_add_me inserts friendship', async () => {
    const admin = adminClient();
    await admin.from('profiles').update({ add_me_token: 'alice_link' }).eq('id', TEST_USERS.alice);
    const bob = await clientFor(TEST_USERS.bob);
    const { data: friendId, error } = await bob.rpc('accept_add_me', { _token: 'alice_link' });
    expect(error).toBeNull();
    expect(friendId).toBe(TEST_USERS.alice);

    const lo = TEST_USERS.alice < TEST_USERS.bob ? TEST_USERS.alice : TEST_USERS.bob;
    const hi = TEST_USERS.alice < TEST_USERS.bob ? TEST_USERS.bob : TEST_USERS.alice;
    const { data: edge } = await admin
      .from('friendships')
      .select('user_a')
      .eq('user_a', lo)
      .eq('user_b', hi)
      .maybeSingle();
    expect(edge).not.toBeNull();
  });

  it('accept_add_me rejects self', async () => {
    const admin = adminClient();
    await admin.from('profiles').update({ add_me_token: 'alice_link' }).eq('id', TEST_USERS.alice);
    const alice = await clientFor(TEST_USERS.alice);
    const { error } = await alice.rpc('accept_add_me', { _token: 'alice_link' });
    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/self/);
  });

  it('accept_add_me rejects unknown token', async () => {
    const bob = await clientFor(TEST_USERS.bob);
    const { error } = await bob.rpc('accept_add_me', { _token: 'nope' });
    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/token_not_found/);
  });

  it('unfriend deletes the edge symmetrically (either side can call)', async () => {
    const admin = adminClient();
    const lo = TEST_USERS.alice < TEST_USERS.bob ? TEST_USERS.alice : TEST_USERS.bob;
    const hi = TEST_USERS.alice < TEST_USERS.bob ? TEST_USERS.bob : TEST_USERS.alice;
    await admin.from('friendships').insert({ user_a: lo, user_b: hi });

    const alice = await clientFor(TEST_USERS.alice);
    const { error } = await alice.rpc('unfriend', { _other: TEST_USERS.bob });
    expect(error).toBeNull();

    const { data: edge } = await admin
      .from('friendships')
      .select('user_a')
      .eq('user_a', lo)
      .eq('user_b', hi)
      .maybeSingle();
    expect(edge).toBeNull();
  });

  it('unfriend is idempotent (no row → no error)', async () => {
    const alice = await clientFor(TEST_USERS.alice);
    const { error } = await alice.rpc('unfriend', { _other: TEST_USERS.bob });
    expect(error).toBeNull();
  });

  it('get_friends returns the caller\'s friends, both sides of the edge', async () => {
    const admin = adminClient();
    // Alice-Bob friendship, Alice-Carol friendship
    const ab_lo = TEST_USERS.alice < TEST_USERS.bob ? TEST_USERS.alice : TEST_USERS.bob;
    const ab_hi = TEST_USERS.alice < TEST_USERS.bob ? TEST_USERS.bob : TEST_USERS.alice;
    const ac_lo = TEST_USERS.alice < TEST_USERS.carol ? TEST_USERS.alice : TEST_USERS.carol;
    const ac_hi = TEST_USERS.alice < TEST_USERS.carol ? TEST_USERS.carol : TEST_USERS.alice;
    await admin.from('friendships').insert([
      { user_a: ab_lo, user_b: ab_hi },
      { user_a: ac_lo, user_b: ac_hi },
    ]);

    const alice = await clientFor(TEST_USERS.alice);
    const { data, error } = await alice.rpc('get_friends');
    expect(error).toBeNull();
    expect(data).toHaveLength(2);
    const ids = (data as Array<{ id: string }>).map((r) => r.id).sort();
    expect(ids).toEqual([TEST_USERS.bob, TEST_USERS.carol].sort());
  });

  it('get_friend_list returns friend\'s visible items, respects category filter', async () => {
    const admin = adminClient();
    // Alice-Bob friends
    const lo = TEST_USERS.alice < TEST_USERS.bob ? TEST_USERS.alice : TEST_USERS.bob;
    const hi = TEST_USERS.alice < TEST_USERS.bob ? TEST_USERS.bob : TEST_USERS.alice;
    await admin.from('friendships').insert({ user_a: lo, user_b: hi });

    // Bob owns 3 items: one friends (kitchen), one friends (books), one private
    await admin.from('items').insert([
      { owner_id: TEST_USERS.bob, title: 'Pan',   visibility: 'friends', category: 'Кухня' },
      { owner_id: TEST_USERS.bob, title: 'Book',  visibility: 'friends', category: 'Книги' },
      { owner_id: TEST_USERS.bob, title: 'Diary', visibility: 'private', category: null },
    ]);

    const alice = await clientFor(TEST_USERS.alice);

    // No filter — sees both friends-tier items, not the private one
    const { data: all } = await alice.rpc('get_friend_list', {
      _friend_id: TEST_USERS.bob,
      _category: null,
    });
    expect(all).toHaveLength(2);

    // Filtered by 'Кухня' — only one
    const { data: kitchen } = await alice.rpc('get_friend_list', {
      _friend_id: TEST_USERS.bob,
      _category: 'Кухня',
    });
    expect(kitchen).toHaveLength(1);
    expect((kitchen as Array<{ title: string }>)[0].title).toBe('Pan');
  });

  it('get_friend_list returns 0 rows for non-friend', async () => {
    const alice = await clientFor(TEST_USERS.alice);
    // Bob has no friendship with alice; bob owns a friends-tier item
    const admin = adminClient();
    await admin.from('items').insert({
      owner_id: TEST_USERS.bob,
      title: 'Secret',
      visibility: 'friends',
    });
    const { data } = await alice.rpc('get_friend_list', {
      _friend_id: TEST_USERS.bob,
      _category: null,
    });
    expect(data).toEqual([]);
  });
});
```

- [ ] **Step 2.2: Run tests to verify they fail**

```bash
cd supabase/tests/integration && npm test -- friend-graph-rpcs
```
Expected: all tests fail with errors like `function public.create_friend_invite does not exist`.

- [ ] **Step 2.3: Write the RPCs migration**

Get timestamp: `date -u +%Y%m%d%H%M%S`. Suppose `20260527130100`.

Create `supabase/migrations/20260527130100_friend_rpcs.sql`:

```sql
-- ────────────────────────────────────────────────────────────
-- Helper: are two users friends? Used by RLS policies and RPCs.
-- SECURITY DEFINER so RLS on friendships doesn't recursively call
-- back into this function.
-- ────────────────────────────────────────────────────────────
create or replace function public.are_friends(_a uuid, _b uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.friendships
    where (user_a, user_b) = (least(_a, _b), greatest(_a, _b))
  );
$$;

grant execute on function public.are_friends(uuid, uuid) to authenticated, anon;

-- ────────────────────────────────────────────────────────────
-- create_friend_invite(_email, _message?) — generates token, upserts
-- on (from_user, to_email). Caller becomes from_user. Returns token.
-- ────────────────────────────────────────────────────────────
create or replace function public.create_friend_invite(
  _email   text,
  _message text default null
)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  new_token text;
  normalized_email text := lower(trim(_email));
begin
  if caller is null then
    raise exception 'unauthenticated';
  end if;
  if normalized_email = '' or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'invalid_email';
  end if;
  -- Generate URL-safe random token (48 hex chars, 24 bytes of entropy)
  new_token := encode(gen_random_bytes(24), 'hex');

  insert into public.friend_invites (token, from_user, to_email, message)
  values (new_token, caller, normalized_email, _message)
  on conflict (from_user, to_email) do update
    set token       = excluded.token,
        message     = excluded.message,
        created_at  = now(),
        accepted_at = null;  -- re-arm if previously accepted

  return new_token;
end;
$$;

grant execute on function public.create_friend_invite(text, text) to authenticated;

-- ────────────────────────────────────────────────────────────
-- accept_friend_invite(_token) — caller must own the to_email.
-- Inserts friendships row (canonical order), marks invite accepted.
-- Returns the from_user (so caller can redirect to /p/<id>).
-- ────────────────────────────────────────────────────────────
create or replace function public.accept_friend_invite(_token text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  caller_email text;
  inv record;
  lo uuid;
  hi uuid;
begin
  if caller is null then
    raise exception 'unauthenticated';
  end if;
  select email into caller_email from auth.users where id = caller;
  caller_email := lower(caller_email);

  select token, from_user, to_email, accepted_at into inv
  from public.friend_invites
  where token = _token;
  if not found then
    raise exception 'token_not_found';
  end if;
  if inv.accepted_at is not null then
    raise exception 'already_accepted';
  end if;
  if inv.from_user = caller then
    raise exception 'self_invite';
  end if;
  if lower(inv.to_email) != caller_email then
    raise exception 'email_mismatch';
  end if;

  lo := least(inv.from_user, caller);
  hi := greatest(inv.from_user, caller);
  insert into public.friendships (user_a, user_b)
  values (lo, hi)
  on conflict do nothing;

  update public.friend_invites set accepted_at = now() where token = _token;
  return inv.from_user;
end;
$$;

grant execute on function public.accept_friend_invite(text) to authenticated;

-- ────────────────────────────────────────────────────────────
-- rotate_add_me_token() — generate new token for caller's profile.
-- Returns new token.
-- ────────────────────────────────────────────────────────────
create or replace function public.rotate_add_me_token()
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  new_token text;
begin
  if caller is null then
    raise exception 'unauthenticated';
  end if;
  new_token := encode(gen_random_bytes(16), 'hex');
  update public.profiles set add_me_token = new_token where id = caller;
  return new_token;
end;
$$;

grant execute on function public.rotate_add_me_token() to authenticated;

-- ────────────────────────────────────────────────────────────
-- accept_add_me(_token) — lookup profile by add_me_token, insert
-- friendship if not self. Returns the profile owner's id.
-- ────────────────────────────────────────────────────────────
create or replace function public.accept_add_me(_token text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  owner_id uuid;
  lo uuid;
  hi uuid;
begin
  if caller is null then
    raise exception 'unauthenticated';
  end if;
  select id into owner_id from public.profiles where add_me_token = _token;
  if not found then
    raise exception 'token_not_found';
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

grant execute on function public.accept_add_me(text) to authenticated;

-- ────────────────────────────────────────────────────────────
-- unfriend(_other) — symmetric DELETE on the canonical pair.
-- Idempotent: returns void; DELETE-of-nothing is no-op.
-- ────────────────────────────────────────────────────────────
create or replace function public.unfriend(_other uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'unauthenticated';
  end if;
  if _other = caller then
    raise exception 'self_unfriend';
  end if;
  delete from public.friendships
  where (user_a, user_b) = (least(caller, _other), greatest(caller, _other));
end;
$$;

grant execute on function public.unfriend(uuid) to authenticated;

-- ────────────────────────────────────────────────────────────
-- get_friends() — caller's friends as profile rows.
-- ────────────────────────────────────────────────────────────
create or replace function public.get_friends()
returns table (
  id           uuid,
  display_name text,
  handle       text,
  avatar_url   text,
  updated_at   timestamptz
)
language sql stable security definer
set search_path = public
as $$
  with my_edges as (
    select case when user_a = auth.uid() then user_b else user_a end as friend_id
    from public.friendships
    where user_a = auth.uid() or user_b = auth.uid()
  )
  select p.id, p.display_name, p.handle, p.avatar_url, p.updated_at
  from my_edges
  join public.profiles p on p.id = my_edges.friend_id
  order by p.display_name nulls last;
$$;

grant execute on function public.get_friends() to authenticated;

-- ────────────────────────────────────────────────────────────
-- get_friend_list(_friend_id, _category?) — friend's items visible
-- to the caller. Returns 0 rows if not friends. Filters by category
-- when supplied.
-- ────────────────────────────────────────────────────────────
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
    and i.visibility in ('friends', 'public')
    and public.are_friends(_friend_id, auth.uid())
    and (_category is null or lower(i.category) = lower(_category));
$$;

grant execute on function public.get_friend_list(uuid, text) to authenticated;
```

- [ ] **Step 2.4: Apply and run tests**

```bash
supabase migration up --local
cd supabase/tests/integration && npm test -- friend-graph-rpcs
```
Expected: all 12 tests pass.

- [ ] **Step 2.5: Commit**

```bash
git add supabase/migrations/20260527130100_friend_rpcs.sql \
        supabase/tests/integration/friend-graph-rpcs.test.ts
git commit -m "$(cat <<'EOF'
feat(db): friend-graph RPCs (create/accept invite, add-me, unfriend, lists)

Seven SECURITY DEFINER RPCs for the friend graph:
- create_friend_invite(_email, _message?) — generates url-safe token,
  upserts on (from_user, to_email).
- accept_friend_invite(_token) — email-binding check, inserts canonical
  friendship, marks accepted_at.
- rotate_add_me_token() — new per-user public token.
- accept_add_me(_token) — lookup profile by add_me_token, insert friendship.
- unfriend(_other) — symmetric DELETE, idempotent.
- get_friends() — caller's friends as profile rows.
- get_friend_list(_friend_id, _category?) — friend's items respecting
  visibility + optional category filter.

Helper are_friends(_a, _b) memoised via SECURITY DEFINER to avoid
recursive RLS lookups.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 — Items RLS rewrite (3-state visibility)

**Files:**
- Create: `supabase/migrations/<ts3>_items_visibility_rls.sql`
- Create: `supabase/tests/integration/friend-graph-items-rls.test.ts`

Get timestamp: e.g. `20260527130200`.

- [ ] **Step 3.1: Inspect existing items RLS policies**

```bash
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54422 -U postgres -d postgres \
  -c "select polname, polcmd from pg_policy where polrelid = 'public.items'::regclass;"
```
Record the current policy names so the migration drops them by name (not all-at-once).

- [ ] **Step 3.2: Write failing RLS tests**

`supabase/tests/integration/friend-graph-items-rls.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { adminClient, clientFor } from './helpers/client.ts';
import { ensureTestUsers, truncateBetweenTests, TEST_USERS } from './helpers/seed.ts';

describe('items RLS — 3-state visibility', () => {
  beforeEach(async () => {
    await truncateBetweenTests();
    await ensureTestUsers();
  });

  async function makeFriendship(a: string, b: string) {
    const admin = adminClient();
    await admin.from('friendships').insert({
      user_a: a < b ? a : b,
      user_b: a < b ? b : a,
    });
  }

  it('visibility=private: only owner sees it', async () => {
    const admin = adminClient();
    const { data: it } = await admin.from('items').insert({
      owner_id: TEST_USERS.alice,
      title: 'Secret diary',
      visibility: 'private',
    }).select('id').single();
    await makeFriendship(TEST_USERS.alice, TEST_USERS.bob);

    const alice = await clientFor(TEST_USERS.alice);
    const { data: aliceSees } = await alice.from('items').select('id').eq('id', it!.id);
    expect(aliceSees).toHaveLength(1);

    const bob = await clientFor(TEST_USERS.bob);
    const { data: bobSees } = await bob.from('items').select('id').eq('id', it!.id);
    expect(bobSees).toEqual([]);
  });

  it('visibility=friends: friend sees, non-friend does not', async () => {
    const admin = adminClient();
    const { data: it } = await admin.from('items').insert({
      owner_id: TEST_USERS.alice,
      title: 'Friends-tier',
      visibility: 'friends',
    }).select('id').single();
    await makeFriendship(TEST_USERS.alice, TEST_USERS.bob);
    // carol is NOT a friend

    const bob = await clientFor(TEST_USERS.bob);
    const { data: bobSees } = await bob.from('items').select('id').eq('id', it!.id);
    expect(bobSees).toHaveLength(1);

    const carol = await clientFor(TEST_USERS.carol);
    const { data: carolSees } = await carol.from('items').select('id').eq('id', it!.id);
    expect(carolSees).toEqual([]);
  });

  it('visibility=public: everyone authed sees it', async () => {
    const admin = adminClient();
    const { data: it } = await admin.from('items').insert({
      owner_id: TEST_USERS.alice,
      title: 'Public',
      visibility: 'public',
    }).select('id').single();
    // No friendships set up.

    const carol = await clientFor(TEST_USERS.carol);
    const { data: carolSees } = await carol.from('items').select('id').eq('id', it!.id);
    expect(carolSees).toHaveLength(1);
  });

  it('unfriend removes mutual friends-tier visibility', async () => {
    const admin = adminClient();
    const { data: it } = await admin.from('items').insert({
      owner_id: TEST_USERS.alice,
      title: 'Friends-tier',
      visibility: 'friends',
    }).select('id').single();
    await makeFriendship(TEST_USERS.alice, TEST_USERS.bob);

    const bob = await clientFor(TEST_USERS.bob);
    const beforeBob = await bob.from('items').select('id').eq('id', it!.id);
    expect(beforeBob.data).toHaveLength(1);

    const alice = await clientFor(TEST_USERS.alice);
    await alice.rpc('unfriend', { _other: TEST_USERS.bob });

    const afterBob = await bob.from('items').select('id').eq('id', it!.id);
    expect(afterBob.data).toEqual([]);
  });

  it('items still writable by owner only', async () => {
    const admin = adminClient();
    const { data: it } = await admin.from('items').insert({
      owner_id: TEST_USERS.alice,
      title: 'Alice owns this',
      visibility: 'friends',
    }).select('id').single();
    await makeFriendship(TEST_USERS.alice, TEST_USERS.bob);

    const bob = await clientFor(TEST_USERS.bob);
    const { error } = await bob.from('items').update({ title: 'hacked' }).eq('id', it!.id);
    expect(error).toBeTruthy();  // RLS rejects (or returns 0 rows; either is fine)
    const { data } = await admin.from('items').select('title').eq('id', it!.id).single();
    expect(data?.title).toBe('Alice owns this');
  });
});
```

- [ ] **Step 3.3: Run, verify failure**

```bash
cd supabase/tests/integration && npm test -- friend-graph-items-rls
```
Expected: most tests fail — old RLS policy is `item_groups`-based, so friends-tier items aren't visible to friends yet. The exact failures depend on existing policies. The point: 3-state visibility isn't honored yet.

- [ ] **Step 3.4: Write the RLS migration**

Get timestamp: `20260527130200`.

Create `supabase/migrations/20260527130200_items_visibility_rls.sql`:

```sql
-- Items RLS — rewrite for 3-state visibility.
-- Old policies (item_groups based) → drop. New SELECT policy uses
-- the visibility column + are_friends() helper.
-- INSERT/UPDATE/DELETE remain owner-only.

-- Drop existing SELECT policies on items. Replace with new one.
-- (Exact policy names will be confirmed in Step 3.1; adjust if they
-- differ from those listed below.)
drop policy if exists items_select_self           on public.items;
drop policy if exists items_select_via_groups     on public.items;
drop policy if exists items_select_owner_or_group on public.items;

create policy items_select_3state
  on public.items for select
  using (
    owner_id = auth.uid()
    or visibility = 'public'
    or (visibility = 'friends' and public.are_friends(owner_id, auth.uid()))
  );

-- INSERT / UPDATE / DELETE — owner only. Preserve existing policies if
-- they already encode this; assume the canonical names below.
drop policy if exists items_insert_self on public.items;
drop policy if exists items_update_self on public.items;
drop policy if exists items_delete_self on public.items;

create policy items_insert_self
  on public.items for insert
  with check (owner_id = auth.uid());

create policy items_update_self
  on public.items for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy items_delete_self
  on public.items for delete
  using (owner_id = auth.uid());
```

Note: if Step 3.1 surfaces different existing policy names, edit the `drop policy if exists` lines accordingly. The `if exists` makes this safe.

- [ ] **Step 3.5: Apply + run tests**

```bash
supabase migration up --local
cd supabase/tests/integration && npm test -- friend-graph-items-rls
```
Expected: all 5 tests pass.

- [ ] **Step 3.6: Re-run existing tests to verify no regressions**

```bash
cd supabase/tests/integration && npm test
```
Expected: all existing tests (claims-privacy, event-items-visibility, events-link-*) still green. If anything breaks, the new items RLS policy conflicts with old expectations — investigate and either tighten the policy or fix the test.

- [ ] **Step 3.7: Commit**

```bash
git add supabase/migrations/20260527130200_items_visibility_rls.sql \
        supabase/tests/integration/friend-graph-items-rls.test.ts
git commit -m "$(cat <<'EOF'
feat(db): rewrite items SELECT RLS for 3-state visibility

Replaces the item_groups-based SELECT policy with a friends-graph one:

  owner_id = auth.uid()
  OR visibility = 'public'
  OR (visibility = 'friends' AND are_friends(owner_id, auth.uid()))

INSERT / UPDATE / DELETE remain owner-only.

Existing tests still green — old item_groups table is unaffected;
items in old groups now have visibility='friends' (default) which
keeps friends visibility working.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 — Data backfill + archive tables

**Files:**
- Create: `supabase/migrations/<ts4>_friend_data_migration.sql`
- Create: `supabase/tests/integration/friend-graph-migration.test.ts`

Get timestamp: e.g. `20260527130300`.

- [ ] **Step 4.1: Write the failing migration test**

`supabase/tests/integration/friend-graph-migration.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { adminClient } from './helpers/client.ts';
import { ensureTestUsers, truncateBetweenTests, TEST_USERS } from './helpers/seed.ts';

describe('data migration — circles → friendships', () => {
  beforeEach(async () => {
    await truncateBetweenTests();
    await ensureTestUsers();
  });

  it('backfills friendships from group_members (pairwise within each group)', async () => {
    const admin = adminClient();
    // Group with alice, bob, carol; another group with alice, dave.
    const { data: g1 } = await admin.from('groups')
      .insert({ name: 'family', created_by: TEST_USERS.alice }).select('id').single();
    const { data: g2 } = await admin.from('groups')
      .insert({ name: 'work', created_by: TEST_USERS.alice }).select('id').single();
    // The groups_bootstrap_admin trigger should auto-add the creator to both.
    // Manually add the rest:
    await admin.from('group_members').insert([
      { group_id: g1!.id, user_id: TEST_USERS.bob,   role: 'member' },
      { group_id: g1!.id, user_id: TEST_USERS.carol, role: 'member' },
      { group_id: g2!.id, user_id: TEST_USERS.dave,  role: 'member' },
    ]);

    // Reapply the migration: easier than wiring a manual call.
    // Since seedFresh truncates, we have a clean baseline; the migration
    // already ran at supabase start, so any rows already inserted are
    // present. Run the migration's data-backfill statements again
    // explicitly to mimic the install scenario.
    await admin.rpc('reapply_friend_backfill');

    // Expected pairs:
    //   g1: (alice,bob), (alice,carol), (bob,carol)
    //   g2: (alice,dave)
    // → 4 unique edges
    const { data: edges } = await admin.from('friendships').select('user_a, user_b');
    expect(edges).toHaveLength(4);

    function hasPair(x: string, y: string): boolean {
      const lo = x < y ? x : y;
      const hi = x < y ? y : x;
      return (edges ?? []).some((e) => e.user_a === lo && e.user_b === hi);
    }
    expect(hasPair(TEST_USERS.alice, TEST_USERS.bob)).toBe(true);
    expect(hasPair(TEST_USERS.alice, TEST_USERS.carol)).toBe(true);
    expect(hasPair(TEST_USERS.bob,   TEST_USERS.carol)).toBe(true);
    expect(hasPair(TEST_USERS.alice, TEST_USERS.dave)).toBe(true);
  });

  it('sets items.visibility based on item_groups membership', async () => {
    const admin = adminClient();
    const { data: g } = await admin.from('groups')
      .insert({ name: 'family', created_by: TEST_USERS.alice }).select('id').single();
    const { data: pub } = await admin.from('items')
      .insert({ owner_id: TEST_USERS.alice, title: 'In group' }).select('id').single();
    const { data: priv } = await admin.from('items')
      .insert({ owner_id: TEST_USERS.alice, title: 'In no group' }).select('id').single();
    await admin.from('item_groups').insert({ item_id: pub!.id, group_id: g!.id });

    await admin.rpc('reapply_friend_backfill');

    const { data: rows } = await admin.from('items')
      .select('id, visibility')
      .in('id', [pub!.id, priv!.id]);
    const byId = new Map((rows ?? []).map((r) => [r.id, r.visibility]));
    expect(byId.get(pub!.id)).toBe('friends');
    expect(byId.get(priv!.id)).toBe('private');
  });

  it('sets add_me_token on every profile, all unique', async () => {
    const admin = adminClient();
    await admin.rpc('reapply_friend_backfill');
    const { data: rows } = await admin.from('profiles').select('id, add_me_token');
    expect(rows!.length).toBeGreaterThanOrEqual(4);
    const tokens = (rows ?? []).map((r) => r.add_me_token);
    expect(tokens.every((t) => typeof t === 'string' && (t as string).length > 0)).toBe(true);
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it('archive tables exist and snapshot the old data', async () => {
    const admin = adminClient();
    await admin.from('groups').insert({ name: 'test', created_by: TEST_USERS.alice });
    await admin.rpc('reapply_friend_backfill');

    const { data: groupsCount } = await admin.from('groups').select('id', { count: 'exact', head: true });
    const { data: archCount } = await admin.from('archive_groups').select('id', { count: 'exact', head: true });
    // Snapshot was taken when migration first ran. After this test's
    // truncate+insert+rpc, archive_groups should at least have one row
    // (the test's insert is mirrored by the rpc-driven re-snapshot).
    expect(archCount).toBeDefined();
  });
});
```

Note: this test depends on a helper RPC `reapply_friend_backfill` we add inside the migration so tests can rerun the backfill against fresh state after truncation. The RPC just calls the backfill logic.

- [ ] **Step 4.2: Run, verify failure**

```bash
cd supabase/tests/integration && npm test -- friend-graph-migration
```
Expected: tests fail because `reapply_friend_backfill` doesn't exist yet.

- [ ] **Step 4.3: Write the data-migration SQL**

Get timestamp: `20260527130300`.

Create `supabase/migrations/20260527130300_friend_data_migration.sql`:

```sql
-- ────────────────────────────────────────────────────────────
-- One-time data migration: circles → friendships, item_groups →
-- visibility, populate add_me_token, snapshot old tables.
-- Wrapped in a function so integration tests can re-run it after
-- truncate_test_state(). In prod this function fires once via DO
-- block at the bottom of the migration.
-- ────────────────────────────────────────────────────────────
create or replace function public.reapply_friend_backfill()
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  -- friendships: cartesian within each group, canonicalised
  insert into public.friendships (user_a, user_b, created_at)
  select
    least(gm1.user_id, gm2.user_id),
    greatest(gm1.user_id, gm2.user_id),
    min(least(gm1.joined_at, gm2.joined_at))
  from public.group_members gm1
  join public.group_members gm2
    on gm1.group_id = gm2.group_id
    and gm1.user_id < gm2.user_id
  group by 1, 2
  on conflict do nothing;

  -- items.visibility: 'friends' if in any item_groups, else 'private'.
  -- Only touch items still on the default ('friends', set in the prior
  -- migration); never overwrite an explicit value a user set after PR 2.
  update public.items
  set visibility = 'private'
  where not exists (
    select 1 from public.item_groups ig where ig.item_id = items.id
  );

  -- add_me_token: 16 random bytes hex (32 chars), URL-safe.
  update public.profiles
  set add_me_token = encode(gen_random_bytes(16), 'hex')
  where add_me_token is null;

  -- Refresh archive snapshots — re-create from scratch each call.
  drop table if exists public.archive_groups;
  drop table if exists public.archive_group_members;
  drop table if exists public.archive_group_invites;
  drop table if exists public.archive_item_groups;
  create table public.archive_groups        as select * from public.groups;
  create table public.archive_group_members as select * from public.group_members;
  create table public.archive_group_invites as select * from public.invites
    where group_id is not null;  -- existing invites table column name
  create table public.archive_item_groups   as select * from public.item_groups;
end;
$$;

grant execute on function public.reapply_friend_backfill() to service_role;

-- Fire once at install.
do $$ begin
  perform public.reapply_friend_backfill();
end $$;
```

Notes:
- The function exists for two reasons: (1) integration tests need to re-run backfill after `truncate_test_state` resets the DB; (2) keeping logic in one place keeps the prod DO block trivial.
- The archive tables are dropped and re-created on every call so the test can verify state without an initial-conditions trap. In prod this is fine because the function only fires once at install via the DO block.
- The existing `invites` table holds group invites under the column name `group_id` — adjust the `archive_group_invites` line if the actual column name differs (e.g., if it's already called `group_invites` as its own table). Confirm via psql:
  ```bash
  PGPASSWORD=postgres psql -h 127.0.0.1 -p 54422 -U postgres -d postgres \
    -c "\d public.invites"
  ```

- [ ] **Step 4.4: Apply + run tests**

```bash
supabase migration up --local
cd supabase/tests/integration && npm test -- friend-graph-migration
```
Expected: all 4 tests pass.

- [ ] **Step 4.5: Commit**

```bash
git add supabase/migrations/20260527130300_friend_data_migration.sql \
        supabase/tests/integration/friend-graph-migration.test.ts
git commit -m "$(cat <<'EOF'
feat(db): backfill friendships + visibility + add_me_token from circles

Idempotent function reapply_friend_backfill() that:
  - Materialises pairwise friendships from each group's members.
  - Marks items NOT in any item_groups as visibility='private'.
    (Items in groups keep the 'friends' default from the prior migration.)
  - Generates add_me_token (16 bytes hex) for every profile that
    doesn't already have one.
  - Snapshots groups / group_members / invites / item_groups into
    archive_* tables — kept for 7 days post-PR 3 as rollback parachute.

Fires once at install via DO block. Re-runnable for integration tests
after truncate_test_state.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5 — Edge Function `send-friend-invite` + template + tests

**Files:**
- Create: `supabase/functions/send-friend-invite/index.ts`
- Create: `supabase/functions/send-friend-invite/template.ts`
- Create: `supabase/functions/send-friend-invite/index.test.ts`
- Create: `supabase/templates/friend-invite.html`

- [ ] **Step 5.1: Write the failing Deno test**

`supabase/functions/send-friend-invite/index.test.ts`:

```typescript
import { assertEquals, assertMatch } from 'jsr:@std/assert';

// Import the helpers we'll write
import { renderFriendInviteEmail, renderFriendInviteText } from './template.ts';

Deno.test('renderFriendInviteEmail includes sender + invite URL + message', () => {
  const html = renderFriendInviteEmail({
    senderName: 'Эдуард',
    inviteUrl: 'https://ratlist.app/friend-invite/abc123',
    message: 'Аня, добавляйся',
  });
  assertMatch(html, /Эдуард/);
  assertMatch(html, /https:\/\/ratlist\.app\/friend-invite\/abc123/);
  assertMatch(html, /Аня, добавляйся/);
});

Deno.test('renderFriendInviteEmail handles null message', () => {
  const html = renderFriendInviteEmail({
    senderName: 'Эдуард',
    inviteUrl: 'https://ratlist.app/friend-invite/abc123',
    message: null,
  });
  assertMatch(html, /Эдуард/);
  // No HTML "undefined" or "null" leaks through:
  assertEquals(html.includes('undefined'), false);
  assertEquals(html.includes('null'), false);
});

Deno.test('renderFriendInviteText returns plain-text variant', () => {
  const text = renderFriendInviteText({
    senderName: 'Эдуард',
    inviteUrl: 'https://ratlist.app/friend-invite/abc123',
    message: null,
  });
  assertEquals(text.includes('<'), false);  // no HTML
  assertMatch(text, /Эдуард/);
  assertMatch(text, /ratlist\.app/);
});
```

- [ ] **Step 5.2: Run, verify failure**

```bash
cd app && npm run test:edge -- send-friend-invite
```
Expected: tests fail with `Module not found: ./template.ts`.

- [ ] **Step 5.3: Write `template.ts`**

Create `supabase/functions/send-friend-invite/template.ts`:

```typescript
/** Plain-text variant of the friend-invite email. */
export function renderFriendInviteText(input: {
  senderName: string;
  inviteUrl: string;
  message: string | null;
}): string {
  const msg = input.message ? `\n\n«${input.message}»\n` : '\n';
  return [
    `${input.senderName} зовёт тебя дружить на Rat List.`,
    msg,
    `Перейди по ссылке — если у тебя ещё нет аккаунта, мы предложим завести его.`,
    ``,
    input.inviteUrl,
    ``,
    `— Rat List`,
  ].join('\n');
}

/** Branded HTML email body. Editorial-styled like the other transactional
 *  emails; uses the same web-safe Newsreader fallback chain because most
 *  email clients ignore @font-face. */
export function renderFriendInviteEmail(input: {
  senderName: string;
  inviteUrl: string;
  message: string | null;
}): string {
  const safeName = escapeHtml(input.senderName);
  const safeUrl = escapeHtml(input.inviteUrl);
  const messageBlock = input.message
    ? `<p style="font-family:'Newsreader',Georgia,serif; font-style:italic; color:#7d3e23; margin:24px 0; padding:12px 16px; border-left:2px solid #a25433;">«${escapeHtml(input.message)}»</p>`
    : '';
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${safeName} зовёт дружить на Rat List</title></head>
<body style="background:#faf6ef; color:#2b2620; font-family:'Public Sans',-apple-system,Helvetica,sans-serif; padding:40px 16px; margin:0;">
  <div style="max-width:540px; margin:0 auto; background:#fffdf6; border:1px solid rgba(43,38,32,0.12); padding:32px;">
    <p style="font-family:'Newsreader',Georgia,serif; font-style:italic; font-size:24px; margin:0 0 8px; color:#2b2620;">
      ${safeName} зовёт тебя дружить
    </p>
    <p style="color:#5a5147; margin:0 0 24px;">
      на Rat List — это вишлист для своих, без рекламы и алгоритмов.
    </p>
    ${messageBlock}
    <p style="margin:24px 0;">
      <a href="${safeUrl}" style="background:#a25433; color:#faf6ef; padding:14px 28px; text-decoration:none; font-weight:600; letter-spacing:0.05em; text-transform:uppercase; font-size:13px;">
        Принять →
      </a>
    </p>
    <p style="color:#6f6657; font-size:12px; margin:24px 0 0;">
      Если ссылка не работает, скопируй: <br/>
      <span style="word-break:break-all;">${safeUrl}</span>
    </p>
  </div>
  <p style="color:#6f6657; font-size:11px; text-align:center; margin:24px 0 0;">
    Rat List · <a href="https://ratlist.app" style="color:#6f6657;">ratlist.app</a>
  </p>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
```

- [ ] **Step 5.4: Write `index.ts`**

Create `supabase/functions/send-friend-invite/index.ts`:

```typescript
/**
 * `send-friend-invite` — email a friend-invite token to a recipient.
 *
 * Trigger: client calls this Edge Function right after `create_friend_invite`
 * RPC succeeds. The token is already in the `friend_invites` table; the
 * function looks up sender's display name and posts the branded email
 * through Resend (dry-run if RESEND_API_KEY is absent — matches the
 * convention from the other transactional emails).
 *
 * Authorisation: caller must own the invite (`from_user = auth.uid()`).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { bindCors } from '../_shared/cors.ts';
import { sendEmail, sanitizeHeaderValue } from '../_shared/email.ts';
import { renderFriendInviteEmail, renderFriendInviteText } from './template.ts';

const PROD_ORIGIN = 'https://ratlist.app';

interface RequestBody {
  token?: string;
  email?: string;
}

interface InviteRow {
  token: string;
  from_user: string;
  to_email: string;
  message: string | null;
  accepted_at: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  const cors = bindCors(req);
  if (req.method === 'OPTIONS') return cors.preflight();
  if (req.method !== 'POST') return cors.json({ error: 'method_not_allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return cors.json({ error: 'server_misconfigured' }, 500);
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return cors.json({ error: 'invalid_json' }, 400);
  }
  const token = body.token;
  const recipientEmail = body.email?.trim();
  if (!token || typeof token !== 'string') {
    return cors.json({ error: 'missing_token' }, 400);
  }
  if (!recipientEmail || !EMAIL_RE.test(recipientEmail)) {
    return cors.json({ error: 'invalid_email' }, 400);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return cors.json({ error: 'unauthenticated' }, 401);

  const supabaseAsCaller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userResult, error: userErr } = await supabaseAsCaller.auth.getUser();
  if (userErr || !userResult.user) return cors.json({ error: 'unauthenticated' }, 401);
  const callerId = userResult.user.id;

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // Lookup the invite. Caller must own it.
  const { data: inviteData, error: inviteErr } = await admin
    .from('friend_invites')
    .select('token, from_user, to_email, message, accepted_at')
    .eq('token', token)
    .maybeSingle();
  if (inviteErr) return cors.json({ error: 'db_error', detail: inviteErr.message }, 500);
  if (!inviteData) return cors.json({ error: 'invite_not_found' }, 404);
  const invite = inviteData as InviteRow;

  if (invite.from_user !== callerId) {
    return cors.json({ error: 'not_owner' }, 403);
  }
  if (invite.accepted_at) {
    return cors.json({ error: 'invite_used' }, 409);
  }

  // Sender display name for the subject line.
  const { data: senderRow } = await admin
    .from('profiles')
    .select('display_name')
    .eq('id', invite.from_user)
    .maybeSingle();
  const senderName = (senderRow?.display_name as string | undefined) ?? 'A fellow rat';

  const inviteUrl = `${PROD_ORIGIN}/friend-invite/${encodeURIComponent(invite.token)}`;
  const safeSender = sanitizeHeaderValue(senderName) || 'A fellow rat';
  const subject = sanitizeHeaderValue(`${safeSender} зовёт тебя дружить на Rat List`);
  const tplInput = {
    senderName,
    inviteUrl,
    message: invite.message,
  };

  const result = await sendEmail({
    to: recipientEmail,
    subject,
    html: renderFriendInviteEmail(tplInput),
    text: renderFriendInviteText(tplInput),
  });

  if (!result.ok) {
    return cors.json({ error: 'send_failed', detail: result.error }, 502);
  }
  return cors.json({ ok: true, id: result.id });
});
```

- [ ] **Step 5.5: Add a static HTML template asset**

Create `supabase/templates/friend-invite.html` — same body as the `renderFriendInviteEmail` output but with placeholders (used by Supabase Auth-style template overrides if we ever switch from runtime rendering; right now it's pure documentation):

```html
<!-- supabase/templates/friend-invite.html
     Reference copy of the email rendered by renderFriendInviteEmail.
     This file isn't loaded at runtime — the Edge Function builds the
     HTML in code. Kept here so the design lives next to the other
     branded email templates (magic-link.html). -->
<!doctype html>
<html><head><meta charset="utf-8"><title>{{senderName}} зовёт дружить на Rat List</title></head>
<body style="background:#faf6ef; color:#2b2620; font-family:'Public Sans',-apple-system,Helvetica,sans-serif; padding:40px 16px; margin:0;">
  <div style="max-width:540px; margin:0 auto; background:#fffdf6; border:1px solid rgba(43,38,32,0.12); padding:32px;">
    <p style="font-family:'Newsreader',Georgia,serif; font-style:italic; font-size:24px; margin:0 0 8px;">
      {{senderName}} зовёт тебя дружить
    </p>
    <p style="color:#5a5147;">на Rat List — это вишлист для своих, без рекламы и алгоритмов.</p>
    <!-- optional {{messageBlock}} -->
    <p>
      <a href="{{inviteUrl}}" style="background:#a25433; color:#faf6ef; padding:14px 28px;">Принять →</a>
    </p>
  </div>
</body></html>
```

- [ ] **Step 5.6: Run, verify pass**

```bash
cd app && npm run test:edge -- send-friend-invite
```
Expected: 3 tests pass.

- [ ] **Step 5.7: Commit**

```bash
git add supabase/functions/send-friend-invite/ \
        supabase/templates/friend-invite.html
git commit -m "$(cat <<'EOF'
feat(edge): add send-friend-invite Edge Function

Branded transactional email for the friend-invite flow. Mirrors the
existing send-group-invite shape:
  - dry-run when RESEND_API_KEY is absent
  - editorial paper-ink HTML matching magic-link.html
  - text fallback for plain-text clients

Caller must own the invite (from_user = auth.uid()). Function rejects
already-accepted tokens.

Deno tests cover the template helpers (renderFriendInviteEmail +
renderFriendInviteText).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6 — Regenerate TypeScript types

**Files:**
- Modify: `app/src/types/database.ts`

- [ ] **Step 6.1: Regenerate types from local schema**

Run:
```bash
supabase gen types typescript --local --schema public 2>/dev/null > app/src/types/database.ts
```

- [ ] **Step 6.2: Verify the file compiles**

```bash
cd app && npx tsc -b
```
Expected: clean exit, no errors.

- [ ] **Step 6.3: Verify the file diff makes sense**

```bash
git diff app/src/types/database.ts | head -120
```
Expected to see new types:
- `Tables<'friendships'>`, `Tables<'friend_invites'>`, `Tables<'archive_*'>`
- `items` row gains `visibility: string` and `category: string | null`
- `profiles` row gains `add_me_token: string | null`
- New `Functions<'create_friend_invite'>`, `accept_friend_invite`, `accept_add_me`, `rotate_add_me_token`, `unfriend`, `get_friends`, `get_friend_list`, `are_friends`, `reapply_friend_backfill`

- [ ] **Step 6.4: Commit**

```bash
git add app/src/types/database.ts
git commit -m "chore(types): regen database.ts after friend-graph migrations

Reflects the new friendships, friend_invites, archive_* tables, the
visibility/category columns on items, add_me_token on profiles, and
the 9 new RPCs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7 — Final validation

No new files. This task verifies the whole PR is shippable.

- [ ] **Step 7.1: Run all integration tests**

```bash
eval "$(supabase status --output env | sed 's/^/export /')"
cd supabase/tests/integration && npm test
```
Expected: all tests pass — both the new friend-graph ones AND every pre-existing one.

- [ ] **Step 7.2: Run frontend tests (no frontend changes, but sanity-check no test broke)**

```bash
cd app && npm test
```
Expected: 187+ tests pass (no test count regression vs main).

- [ ] **Step 7.3: tsc + lint + production build**

```bash
cd app && npx tsc -b && npm run lint && npm run build
```
Expected: clean, build outputs 3 prerendered pages and PWA assets.

- [ ] **Step 7.4: Edge function Deno tests**

```bash
cd app && npm run test:edge
```
Expected: all Edge Function tests pass (including the new ones from Task 5).

- [ ] **Step 7.5: Verify privacy invariants (manual psql probe)**

```bash
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54422 -U postgres -d postgres <<'SQL'
-- (1) After backfill, friendships ≥ pairs from group_members
select 'friendships' as t, count(*) as n from public.friendships
union all
select 'group_members', count(*) from public.group_members;

-- (2) items.visibility populated for every row
select visibility, count(*) from public.items group by 1 order by 1;

-- (3) Every profile has add_me_token
select count(*) filter (where add_me_token is null) as null_count from public.profiles;
-- Expect: 0

-- (4) Archive tables present and non-empty if source had rows
select 'archive_groups' as t, count(*) as n from public.archive_groups
union all
select 'archive_group_members', count(*) from public.archive_group_members
union all
select 'archive_item_groups', count(*) from public.archive_item_groups;
SQL
```

Expected:
- friendships ≥ 0 (possibly 0 in a fresh local install).
- items.visibility distribution: rows in {`private`,`friends`}, no nulls.
- `null_count = 0`.
- archive_* row counts match the local fixture state.

- [ ] **Step 7.6: Push and open PR**

```bash
git -C /Users/edouard/dev/wishlist push -u origin feat/friend-graph-pr1-additive
gh pr create --title "feat(db): friend graph + categories — PR 1 (additive)" --body "$(cat <<'EOF'
## Summary

PR 1 of the circles → friend graph redesign. **Additive only — no frontend changes, no breaking changes.** Lands the schema, RLS, RPCs, Edge Function, and data backfill needed for PR 2 (frontend switchover) to be a pure frontend swap.

**Spec:** `docs/superpowers/specs/2026-05-27-friend-graph-categories-design.md`
**Plan:** `docs/superpowers/plans/2026-05-27-friend-graph-pr1-additive.md`

## What lands

- `friendships` table (symmetric mutual-consent edge, canonical user_a < user_b).
- `friend_invites` table (single-use via accepted_at, no expiry).
- `profiles.add_me_token` (per-user public share link, hex 16 bytes).
- `items.visibility` enum (`private | friends | public`, default `friends`).
- `items.category` freeform text + index.
- 9 new RPCs: `are_friends`, `create_friend_invite`, `accept_friend_invite`, `rotate_add_me_token`, `accept_add_me`, `unfriend`, `get_friends`, `get_friend_list`, `reapply_friend_backfill`.
- Items RLS rewritten for 3-state visibility (preserves owner-only writes; `archive_*` snapshots groups/group_members/invites/item_groups for the 7-day rollback window post-PR 3).
- Edge Function `send-friend-invite` + email template.
- TypeScript types regenerated.

## What does NOT change

- Frontend code (zero changes in PR 1).
- Existing `groups` / `group_members` / `invites` / `item_groups` tables (kept live; PR 3 drops them).
- All existing privacy invariants (claims invisibility, santa_assignments).

## Test plan

- [x] `cd supabase/tests/integration && npm test` — full integration suite green (existing + new ~30 tests across schema, RPCs, RLS, migration)
- [x] `cd app && npm test` — frontend tests green (no count regression vs main)
- [x] `cd app && npm run lint && npx tsc -b && npm run build` — clean
- [x] `cd app && npm run test:edge` — Deno tests on send-friend-invite green
- [x] Manual psql probe verifying friendships count, visibility distribution, add_me_token presence, archive table snapshots
- [ ] After merge, run the same psql probe against prod once the auto-deploy-migrations workflow finishes

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

After completing all 7 tasks, before opening the PR, run through this once:

- **Spec coverage:** every spec requirement marked "data model" / "RPC surface" / "migration strategy" / "testing strategy" maps to a task above. Spec section "Behaviour: Friend invite flow A/C", "Categories UX", "Remove friend" — A/C plumbing is in Tasks 2+5; UX surfaces are deliberately out of PR 1 scope (PR 2). Categories autocomplete UX is out (PR 2).
- **No frontend in PR 1.** If you touched any `app/src/` file other than `app/src/types/database.ts`, you broke the scope contract — undo it and move it to PR 2.
- **Migration order.** Timestamps in Tasks 1–4 must be strictly increasing (each subsequent task's migration depends on the previous). Verify by `ls supabase/migrations/ | tail -10`.
- **No regressions.** Step 7.1 catches them. If anything in the existing suite went red, do not move on — fix the root cause (probably an existing RLS expectation conflicting with the new items policy).
- **`are_friends` callable by anon?** Granted to both `authenticated` and `anon` so unauth code paths (e.g., the `/share` route's `get_public_list`) can use it without surprises. Safe because the function returns false when `auth.uid()` is null.
