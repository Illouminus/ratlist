# Event Social Discovery — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let event guests see who else is at the event, open each other's wishlists, and copy an item they like into their own list — while fixing the critical bug where co-participants can't see who already claimed a gift.

**Architecture:** Three layers, shipped as **two PRs**. PR 1 (foundation + critical fix) moves the two token columns out of `profiles` into an owner-only `profile_secrets` table, then adds a `shares_event_with(a,b)` SECURITY DEFINER helper and a `profiles` SELECT policy so event co-participants can read each other's (now token-free) profile rows — which makes the existing claims-embed in `useEvent` resolve for non-friend co-participants (bug F). PR 2 (discovery) adds a `get_coparticipant_list` RPC + a guest-facing participant list + a per-member list screen with a "copy to my list" action. The token move comes **first** so the new cross-user profile read can never leak `share_token` / `add_me_token`.

**Tech Stack:** Supabase Postgres + RLS (SECURITY DEFINER helpers), `vitest` integration tests against local Supabase, React 19 + TypeScript (strict), react-router 7, custom i18n.

**Out of scope (explicit):**
- **"+ add friend" button** on a co-participant's profile + a direct friend-request RPC — deferred to a follow-up session (the foundation below unblocks it, but it's its own feature).
- **Re-uploading the cover photo on copy** — v1 references the source `cover_url` string (covers live in a public Storage bucket, so the URL keeps working; if the source is deleted the copy degrades to a broken image, acceptable for v1).
- **Realtime refresh of claims inside an open event tab** — even after PR 1, a guest's already-open tab needs a manual refresh to see a new claim. Note it as a follow-up; do not build it here.
- **Claiming from a co-participant's general list** — by design the only action on another guest's list is *copy*. Claiming stays scoped to the event's honoree list and the friend list (existing behavior, untouched).

**Why two PRs / process:** Follow the project's review-merge workflow — each PR is a clean squash PR, reviewed by a separate sonnet subagent, local gate (tsc + unit + integration + prod build) green before merge, CI green before merge. DB PRs ride the auto-migration deploy workflow. PR 1 is independently shippable (it fixes a critical prod bug on its own).

---

## File Structure

**PR 1 — Foundation + bug F**
- Create: `supabase/migrations/20260530120000_profile_secrets_and_event_coparticipant_visibility.sql` — the whole foundation (table, RLS, backfill, trigger, 6 RPC rewrites, column drops, `shares_event_with`, profiles policy).
- Create: `supabase/tests/integration/profile-secrets-rls.test.ts` — token table self-read-only + no cross-user token leak.
- Create: `supabase/tests/integration/event-coparticipant-profiles.test.ts` — co-participant profile read + bug-F claim visibility + honoree-blind + outsider-denied.
- Modify: `app/src/items/useShareToken.ts` — read `share_token` from `profile_secrets`, not `profiles`.
- Modify: `app/src/components/AddFriendModal.tsx` — source `add_me_token` from `profile_secrets` (self-read) instead of the `useProfile` row.
- Modify: `app/src/types/database.ts` — regenerated (profiles loses 2 columns, gains `profile_secrets`).
- Modify: test mocks/fixtures that set `share_token` / `add_me_token` on a `profiles` row (surfaced by tsc after regen).

**PR 2 — Discovery**
- Create: `supabase/migrations/20260530130000_get_coparticipant_list.sql` — the discovery read RPC.
- Create: `supabase/tests/integration/get-coparticipant-list.test.ts` — co-participant sees member's shared items; private excluded; non-coparticipant denied.
- Create: `app/src/events/useCoparticipantList.ts` — hook wrapping the RPC (free-fetcher + setState-in-`.then` pattern).
- Create: `app/src/screens/events/EventMemberListScreen.tsx` — `/events/:eventId/member/:userId`, renders a member's shared list + copy buttons.
- Create: `app/src/screens/events/MemberItemTile.tsx` — read-only item tile with a "copy to my list" button (no claim).
- Modify: `app/src/screens/events/EventDetailScreen.tsx` — render a guest-facing participant list (active co-participants, excluding self), each linking to the member screen.
- Modify: `app/src/items/useMyItems.ts` — add `copyItem(source)` that maps a source item to `createItem`.
- Modify: `app/src/Router.tsx` — lazy route for `EventMemberListScreen`.
- Modify: `app/src/i18n/ru.ts` + `app/src/i18n/en.ts` — new keys (`events.guests.*`, `item.copy`, `item.copiedToast`, `member.*`).
- Modify: `app/src/types/database.ts` — regenerated (adds `get_coparticipant_list`).
- Create: `app/src/items/__tests__/copyItem.test.ts` (or extend an existing useMyItems test) — copy maps fields correctly.

---

# PHASE 1 — Foundation + Bug F (PR 1)

## Task 1: Integration test — `profile_secrets` is owner-read-only (RED first)

**Files:**
- Test: `supabase/tests/integration/profile-secrets-rls.test.ts`

**Context for the engineer:** The integration harness lives in `supabase/tests/integration/`. Get a client for a user with `clientFor(userId)`; a service-role client (bypasses RLS) with `adminClient()`. Fixed test UUIDs are `TEST_USERS.{alice,bob,carol,dave}` from `./helpers/seed.ts`. `seedFresh()` truncates + seeds 4 users (+ a shared group + 1 alice item); `ensureTestUsers()` seeds only the 4 users. Run with: `eval "$(supabase status --output env | sed 's/^/export /')"; cd supabase/tests/integration && npm test -- profile-secrets-rls`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { adminClient, clientFor } from './helpers/client.ts';
import { ensureTestUsers, truncateBetweenTests, TEST_USERS } from './helpers/seed.ts';

/**
 * profile_secrets holds share_token + add_me_token, moved out of `profiles`
 * so the cross-user profile SELECT policies (friends, event co-participants)
 * can never leak a token. Invariant: a user reads ONLY their own secrets row.
 */
describe('profile_secrets: owner-read-only', () => {
  beforeEach(async () => {
    await truncateBetweenTests();
    await ensureTestUsers();
  });

  it('a user reads their own secrets row', async () => {
    const alice = await clientFor(TEST_USERS.alice);
    const { data, error } = await alice
      .from('profile_secrets')
      .select('user_id, share_token, add_me_token')
      .eq('user_id', TEST_USERS.alice)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.user_id).toBe(TEST_USERS.alice);
    expect(typeof data?.add_me_token).toBe('string'); // auto-minted by default
  });

  it("a user CANNOT read another user's secrets row", async () => {
    const alice = await clientFor(TEST_USERS.alice);
    const { data, error } = await alice
      .from('profile_secrets')
      .select('user_id, add_me_token')
      .eq('user_id', TEST_USERS.bob)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeNull(); // RLS hides it entirely
  });

  it('every seeded profile has a secrets row (handle_new_user + backfill)', async () => {
    const admin = adminClient();
    const { data, error } = await admin
      .from('profile_secrets')
      .select('user_id')
      .in('user_id', [TEST_USERS.alice, TEST_USERS.bob, TEST_USERS.carol, TEST_USERS.dave]);
    expect(error).toBeNull();
    expect(data).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run it — expect RED**

Run: `eval "$(supabase status --output env | sed 's/^/export /')"; cd supabase/tests/integration && npm test -- profile-secrets-rls`
Expected: FAIL — relation `profile_secrets` does not exist (table not created yet).

## Task 2: Integration test — co-participant profiles + bug F (RED first)

**Files:**
- Test: `supabase/tests/integration/event-coparticipant-profiles.test.ts`

**Context:** `seedFresh()` returns a `SeedContext` with `{alice,bob,carol,dave,groupId,itemAliceOwns}`. **Important:** `seedFresh` puts all 4 users in a shared group, and the group-mate profile policy would mask whether the *event* path works. To isolate the event path, seed users with `ensureTestUsers()` (no group, no friendship) and build the event by hand with `adminClient()`. Events: `events(honoree_id, title, share_token auto)`; participants: `event_participants(event_id, user_id, status, joined_at)`; curated items: `event_items(event_id, item_id)`; an item: `items(owner_id, title, occasion, visibility, status)`. Claims: `claims(item_id, user_id, share)`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { adminClient, clientFor } from './helpers/client.ts';
import { ensureTestUsers, truncateBetweenTests, TEST_USERS } from './helpers/seed.ts';

/**
 * Bug F + foundation: event co-participants must be able to read each other's
 * profile rows (so the claims-embed in useEvent resolves and they see who took
 * what), WITHOUT being friends or group-mates. The honoree stays blind to
 * claims on their own items. Outsiders see nothing.
 *
 * Topology: alice = honoree. bob + carol = active participants (NOT friends,
 * NOT group-mates). dave = outsider. alice owns one item, curated into the event.
 */
describe('event co-participants: profile + claim visibility', () => {
  let eventId: string;
  let itemId: string;

  beforeEach(async () => {
    await truncateBetweenTests();
    await ensureTestUsers();
    const admin = adminClient();

    const { data: ev } = await admin
      .from('events')
      .insert({ honoree_id: TEST_USERS.alice, title: "alice's day" })
      .select('id')
      .single();
    eventId = ev!.id;

    await admin.from('event_participants').insert([
      { event_id: eventId, user_id: TEST_USERS.bob, status: 'active', joined_at: new Date().toISOString() },
      { event_id: eventId, user_id: TEST_USERS.carol, status: 'active', joined_at: new Date().toISOString() },
    ]);

    const { data: it } = await admin
      .from('items')
      .insert({ owner_id: TEST_USERS.alice, title: 'a kettle', occasion: 'birthday', visibility: 'shared', status: 'active' })
      .select('id')
      .single();
    itemId = it!.id;
    await admin.from('event_items').insert({ event_id: eventId, item_id: itemId });
  });

  it('a participant reads a co-participant profile (not friends)', async () => {
    const bob = await clientFor(TEST_USERS.bob);
    const { data, error } = await bob
      .from('profiles')
      .select('id, display_name, avatar_url')
      .eq('id', TEST_USERS.carol)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(TEST_USERS.carol);
  });

  it('a participant reads the honoree profile, and vice versa', async () => {
    const bob = await clientFor(TEST_USERS.bob);
    const { data: honoree } = await bob.from('profiles').select('id').eq('id', TEST_USERS.alice).maybeSingle();
    expect(honoree?.id).toBe(TEST_USERS.alice);

    const alice = await clientFor(TEST_USERS.alice);
    const { data: guest } = await alice.from('profiles').select('id').eq('id', TEST_USERS.bob).maybeSingle();
    expect(guest?.id).toBe(TEST_USERS.bob);
  });

  it("bug F: a co-participant sees another co-participant's claim WITH the claimer name", async () => {
    // carol claims alice's curated item.
    const carol = await clientFor(TEST_USERS.carol);
    const { error: claimErr } = await carol.from('claims').insert({ item_id: itemId, user_id: TEST_USERS.carol, share: 100 });
    expect(claimErr).toBeNull();

    // bob (a co-participant, not carol's friend) reads the claim embedded with the profile.
    const bob = await clientFor(TEST_USERS.bob);
    const { data, error } = await bob
      .from('claims')
      .select('user_id, user:profiles(id, display_name)')
      .eq('item_id', itemId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]?.user_id).toBe(TEST_USERS.carol);
    expect((data?.[0] as { user?: { id?: string } }).user?.id).toBe(TEST_USERS.carol); // embed resolves (was null pre-fix)
  });

  it('the honoree stays blind to claims on their own curated item', async () => {
    const carol = await clientFor(TEST_USERS.carol);
    await carol.from('claims').insert({ item_id: itemId, user_id: TEST_USERS.carol, share: 100 });

    const alice = await clientFor(TEST_USERS.alice);
    const { data, error } = await alice.from('claims').select('user_id').eq('item_id', itemId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('an outsider cannot read a participant profile via the event path', async () => {
    const dave = await clientFor(TEST_USERS.dave);
    const { data } = await dave.from('profiles').select('id').eq('id', TEST_USERS.bob).maybeSingle();
    expect(data).toBeNull();
  });
});
```

- [ ] **Step 2: Run it — expect RED**

Run: `npm test -- event-coparticipant-profiles` (with the env eval prefix as above)
Expected: FAIL — co-participant profile reads return null and the claim embed is null (no `shares_event_with` policy yet).

## Task 3: The foundation migration (GREEN)

**Files:**
- Create: `supabase/migrations/20260530120000_profile_secrets_and_event_coparticipant_visibility.sql`

- [ ] **Step 1: Pre-flight — confirm nothing else references the columns**

Run: `grep -rn "share_token\|add_me_token" supabase/migrations/ app/src | grep -v "events.*share_token\|event\.share_token\|database.ts"`
Expected: only the call sites already inventoried (the 6 RPCs, `useShareToken.ts`, `AddFriendModal.tsx`, test mocks). If a NEW reference appears (e.g. an `export_my_data` field), add it to the rewrite list before proceeding. (Verified at plan time: `export_my_data` does NOT reference the token columns.)

- [ ] **Step 2: Write the migration**

```sql
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
--      (critical bug F) and powers the new guest-facing participant UI.
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
```

- [ ] **Step 3: Apply the migration**

Run: `supabase migration up --local`
Expected: applies clean. If it errors on the column drop with a dependency, a function/policy still references the column — grep again and rewrite it.

- [ ] **Step 4: Run BOTH Task 1 + Task 2 tests — expect GREEN**

Run: `eval "$(supabase status --output env | sed 's/^/export /')"; cd supabase/tests/integration && npm test -- profile-secrets-rls event-coparticipant-profiles`
Expected: all PASS.

## Task 4: Regenerate database types

**Files:**
- Modify: `app/src/types/database.ts`

- [ ] **Step 1: Regenerate**

Run: `supabase gen types typescript --local --schema public 2>/dev/null > app/src/types/database.ts`

- [ ] **Step 2: Confirm the shape changed**

Run: `grep -n "profile_secrets\|share_token\|add_me_token" app/src/types/database.ts`
Expected: a `profile_secrets` table block appears; `share_token` / `add_me_token` are GONE from the `profiles` block (they remain only in the `events` block for `events.share_token`, which is unrelated).

## Task 5: Frontend — point token reads at `profile_secrets`

**Files:**
- Modify: `app/src/items/useShareToken.ts:53-60`
- Modify: `app/src/components/AddFriendModal.tsx` (add-me token source)

**Context:** After Task 4, tsc will flag every stale read of `profiles.share_token` / `profiles.add_me_token`. `useShareToken` selects `share_token` directly; `AddFriendModal` reads `profile.add_me_token` off the `useProfile` row (`useProfile` does `select('*')`, so it no longer carries the token). The RLS self-read policy means both can read their own `profile_secrets` row.

- [ ] **Step 1: Run tsc to see the breakage**

Run: `cd app && npx tsc -p tsconfig.app.json --noEmit`
Expected: errors at `useShareToken.ts` (select `share_token`) and `AddFriendModal.tsx` (`profile.add_me_token`), plus any test mocks.

- [ ] **Step 2: Fix `useShareToken` to read from `profile_secrets`**

In `app/src/items/useShareToken.ts`, change the `loadToken` query (currently `.from('profiles').select('share_token').eq('id', userId)`):

```typescript
async function loadToken(userId: string): Promise<FetchState> {
  const { data, error } = await supabase
    .from('profile_secrets')
    .select('share_token')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return { kind: 'failed', userId, error: error.message };
  return { kind: 'loaded', userId, token: data?.share_token ?? null };
}
```

(The `enable()` / `disable()` paths call the `set_share_token` RPC — unchanged. `notifyShareTokenChanged()` — unchanged.)

- [ ] **Step 3: Fix `AddFriendModal` to source `add_me_token` from `profile_secrets`**

In `app/src/components/AddFriendModal.tsx`, stop reading `profile?.add_me_token`. Add a self-fetch of the token + a refetch after rotate. Replace the `addMeUrl` derivation:

```typescript
// near the other useState hooks:
const [addMeToken, setAddMeToken] = useState<string | null>(null);

// effect: load the caller's add-me token from profile_secrets (self-read RLS).
useEffect(() => {
  if (!open) return;
  let cancelled = false;
  void supabase
    .from('profile_secrets')
    .select('add_me_token')
    .maybeSingle()
    .then(({ data }) => {
      if (!cancelled) setAddMeToken(data?.add_me_token ?? null);
    });
  return () => {
    cancelled = true;
  };
}, [open]);

const addMeUrl = addMeToken ? `${window.location.origin}/add-me/${addMeToken}` : '';
```

Then in `rotateLink()`, replace `await refreshProfile();` with a re-read of the token:

```typescript
async function rotateLink(): Promise<void> {
  const { data: newToken, error } = await supabase.rpc('rotate_add_me_token');
  if (error) {
    toast.show(errorMessage(t, error));
    return;
  }
  setAddMeToken(typeof newToken === 'string' ? newToken : null);
  toast.show(t('addFriend.linkRotated'));
}
```

If `refreshProfile` / the `useProfile` `query.profile` is now unused in this file, remove the now-dead references (let tsc/lint guide you). The email-invite path (`create_friend_invite` / `send-friend-invite`) is untouched.

- [ ] **Step 4: Fix any test mocks tsc flagged**

Search and update fixtures that set the tokens on a profiles row:
Run: `grep -rn "add_me_token\|share_token" app/src --include=*.test.tsx --include=*.test.ts`
For each (e.g. `AddFriendModal.test.tsx`), either mock the `profile_secrets` select to return the token or drop the now-invalid profile-row field. Keep assertions exact.

- [ ] **Step 5: tsc clean**

Run: `cd app && npx tsc -p tsconfig.app.json --noEmit`
Expected: no errors.

## Task 6: Local gate + commit (PR 1)

- [ ] **Step 1: Full local gate**

Run (frontend): `cd app && npm test && npm run lint && npm run build`
Run (integration): `eval "$(supabase status --output env | sed 's/^/export /')"; cd supabase/tests/integration && npm test`
Expected: all green. Pay attention that the existing `befriend-via-share`, `get-public-list-visibility`, and any add-me/share tests still pass against the moved columns.

- [ ] **Step 2: Commit**

```bash
git checkout -b feat/profile-secrets-coparticipant-visibility
git add supabase/migrations/20260530120000_profile_secrets_and_event_coparticipant_visibility.sql \
        supabase/tests/integration/profile-secrets-rls.test.ts \
        supabase/tests/integration/event-coparticipant-profiles.test.ts \
        app/src/items/useShareToken.ts \
        app/src/components/AddFriendModal.tsx \
        app/src/types/database.ts
# plus any updated test mocks
git commit -m "$(cat <<'EOF'
feat(privacy): profile_secrets table + event co-participant profile visibility

Move share_token + add_me_token into an owner-read-only profile_secrets
table, then let event co-participants read each other's profile rows via a
shares_event_with() helper. Fixes bug F: co-participants now see who claimed
a gift (the claims-embed resolves for non-friends); honoree stays blind.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

(PR body MUST include a 2-account manual smoke checklist: acc2 + acc3 both active in an event; acc3 claims; acc2 sees "{name} берёт ✓" after refresh; honoree sees no claims; share-link + add-me link still work.)

---

# PHASE 2 — Discovery: browse co-participant lists + copy (PR 2)

## Task 7: Integration test — `get_coparticipant_list` (RED first)

**Files:**
- Test: `supabase/tests/integration/get-coparticipant-list.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { adminClient, clientFor } from './helpers/client.ts';
import { ensureTestUsers, truncateBetweenTests, TEST_USERS } from './helpers/seed.ts';

/**
 * get_coparticipant_list(member_id): a co-participant of a shared event can
 * read another member's SHARED items (for "grab an idea"). Private items are
 * excluded; a non-co-participant gets zero rows.
 *
 * Topology: alice = honoree. bob + carol = active participants. dave = outsider.
 * carol owns: 1 shared item + 1 private item.
 */
describe('get_coparticipant_list', () => {
  beforeEach(async () => {
    await truncateBetweenTests();
    await ensureTestUsers();
    const admin = adminClient();
    const { data: ev } = await admin.from('events')
      .insert({ honoree_id: TEST_USERS.alice, title: 'party' }).select('id').single();
    await admin.from('event_participants').insert([
      { event_id: ev!.id, user_id: TEST_USERS.bob, status: 'active', joined_at: new Date().toISOString() },
      { event_id: ev!.id, user_id: TEST_USERS.carol, status: 'active', joined_at: new Date().toISOString() },
    ]);
    await admin.from('items').insert([
      { owner_id: TEST_USERS.carol, title: 'carol shared', occasion: 'other', visibility: 'shared', status: 'active' },
      { owner_id: TEST_USERS.carol, title: 'carol secret', occasion: 'other', visibility: 'private', status: 'active' },
    ]);
  });

  it("a co-participant sees the member's shared items only", async () => {
    const bob = await clientFor(TEST_USERS.bob);
    const { data, error } = await bob.rpc('get_coparticipant_list', { _member_id: TEST_USERS.carol });
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect((data as Array<{ title: string }>)[0]?.title).toBe('carol shared');
  });

  it('a non-co-participant (outsider) gets zero rows', async () => {
    const dave = await clientFor(TEST_USERS.dave);
    const { data, error } = await dave.rpc('get_coparticipant_list', { _member_id: TEST_USERS.carol });
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect RED**

Run: `npm test -- get-coparticipant-list` (with env eval prefix)
Expected: FAIL — function `get_coparticipant_list` does not exist.

## Task 8: The discovery RPC migration (GREEN)

**Files:**
- Create: `supabase/migrations/20260530130000_get_coparticipant_list.sql`
- Modify: `app/src/types/database.ts` (regen)

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================================
-- get_coparticipant_list — event-discovery read
-- ============================================================================
-- A co-participant of a shared event can read another member's SHARED items so
-- they can "grab an idea" into their own list. SECURITY DEFINER + gated on
-- shares_event_with so it does NOT widen the items SELECT policy and exposes NO
-- claims — copy is the only action on a co-participant's general list.
-- Mirrors get_friend_list, but keyed on co-participation instead of friendship.
-- ============================================================================
create or replace function public.get_coparticipant_list(
  _member_id uuid,
  _category  text default null
)
returns setof public.items
language sql stable security definer
set search_path = public
as $$
  select i.*
  from public.items i
  where i.owner_id = _member_id
    and i.status = 'active'
    and i.visibility = 'shared'
    and public.shares_event_with(_member_id, auth.uid())
    and (_category is null or lower(i.category) = lower(_category));
$$;
grant execute on function public.get_coparticipant_list(uuid, text) to authenticated;
```

- [ ] **Step 2: Apply + regen types + run test GREEN**

Run: `supabase migration up --local && supabase gen types typescript --local --schema public 2>/dev/null > app/src/types/database.ts`
Run: `eval "$(supabase status --output env | sed 's/^/export /')"; cd supabase/tests/integration && npm test -- get-coparticipant-list`
Expected: PASS.

## Task 9: `useCoparticipantList` hook

**Files:**
- Create: `app/src/events/useCoparticipantList.ts`

**Context:** Follow the project's hook pattern (a pure free async fetcher returns the next `FetchState`; `useEffect` calls it and `setState` happens inside `.then(...)`, never synchronously in the effect body — `react-hooks/set-state-in-effect` is enforced). Model on `useFriendList`. The RPC returns `setof public.items`, i.e. an array of `Item` rows.

- [ ] **Step 1: Write the hook**

```typescript
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Item } from '../lib/db';
import { useAuth } from '../auth/useAuth';

type Query =
  | { status: 'loading'; items: null; error: null }
  | { status: 'anonymous'; items: null; error: null }
  | { status: 'error'; items: null; error: string }
  | { status: 'ready'; items: Item[]; error: null };

async function load(memberId: string): Promise<Query> {
  const { data, error } = await supabase.rpc('get_coparticipant_list', { _member_id: memberId });
  if (error) return { status: 'error', items: null, error: error.message };
  return { status: 'ready', items: (data ?? []) as Item[], error: null };
}

export function useCoparticipantList(memberId: string | null) {
  const { status: authStatus } = useAuth();
  const [query, setQuery] = useState<Query>({ status: 'loading', items: null, error: null });

  useEffect(() => {
    if (authStatus !== 'authenticated') {
      setQuery({ status: 'anonymous', items: null, error: null });
      return;
    }
    if (!memberId) return;
    let active = true;
    setQuery({ status: 'loading', items: null, error: null });
    void load(memberId).then((next) => {
      if (active) setQuery(next);
    });
    return () => {
      active = false;
    };
  }, [authStatus, memberId]);

  return { query };
}
```

(Confirm the exact `useAuth` return shape and `Item` import path against `useFriendList.ts`; match them.)

- [ ] **Step 2: tsc clean**

Run: `cd app && npx tsc -p tsconfig.app.json --noEmit`
Expected: no errors.

## Task 10: `copyItem` action on `useMyItems`

**Files:**
- Modify: `app/src/items/useMyItems.ts` (add `copyItem`)
- Test: `app/src/items/__tests__/copyItem.test.ts`

**Context:** `createItem(input: CreateItemInput)` already inserts a new owned item. `copyItem` maps a source `Item` (read from another user's list) into a `CreateItemInput` and delegates. Required fields: `title`, `occasion`. Copy `maker/url/price_text/note/priority/cover_url/category`; force `visibility: 'shared'` and `group_ids: []`. The source `cover_url` is referenced as-is (v1).

- [ ] **Step 1: Write the failing unit test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { buildCopyInput } from '../useMyItems';
import type { Item } from '../../lib/db';

describe('buildCopyInput', () => {
  it('maps a source item to a create input, forcing shared visibility + no groups', () => {
    const source = {
      id: 'x', owner_id: 'someone', title: 'Nice Kettle', maker: 'Hario',
      url: 'https://shop/kettle', price_text: '€40', occasion: 'birthday',
      note: 'the 1L one', priority: 1, cover_url: 'https://cdn/abc.jpg',
      category: 'kitchen', visibility: 'shared', status: 'active',
      created_at: '', updated_at: '',
    } as Item;

    const input = buildCopyInput(source);

    expect(input).toEqual({
      title: 'Nice Kettle',
      maker: 'Hario',
      url: 'https://shop/kettle',
      price_text: '€40',
      occasion: 'birthday',
      note: 'the 1L one',
      priority: 1,
      cover_url: 'https://cdn/abc.jpg',
      category: 'kitchen',
      visibility: 'shared',
      group_ids: [],
    });
  });

  it('truncates an over-long title to 200 chars', () => {
    const source = { title: 'a'.repeat(250), occasion: 'other' } as Item;
    expect(buildCopyInput(source).title.length).toBe(200);
  });
});
```

- [ ] **Step 2: Run — expect RED**

Run: `cd app && npm test -- copyItem`
Expected: FAIL — `buildCopyInput` is not exported.

- [ ] **Step 3: Implement `buildCopyInput` + `copyItem`**

In `app/src/items/useMyItems.ts`, export a pure mapper and add a `copyItem` to the hook's returned API:

```typescript
const MAX_COPY_TITLE = 200;

export function buildCopyInput(source: Item): CreateItemInput {
  return {
    title: source.title.slice(0, MAX_COPY_TITLE),
    maker: source.maker ?? null,
    url: source.url ?? null,
    price_text: source.price_text ?? null,
    occasion: source.occasion as CreateItemInput['occasion'],
    note: source.note ?? null,
    priority: source.priority as CreateItemInput['priority'],
    cover_url: source.cover_url ?? null,
    category: source.category ?? null,
    visibility: 'shared',
    group_ids: [],
  };
}
```

Then inside the hook, add (next to `createItem`):

```typescript
async function copyItem(source: Item) {
  return createItem(buildCopyInput(source));
}
```

…and include `copyItem` in the object the hook returns.

- [ ] **Step 4: Run — expect GREEN**

Run: `cd app && npm test -- copyItem`
Expected: PASS.

## Task 11: `MemberItemTile` (read-only + copy button)

**Files:**
- Create: `app/src/screens/events/MemberItemTile.tsx`

**Context:** Read-only tile for a member's item with one action: "copy to my list". Reuse `ItemPhoto`, `formatPrice` (`lib/formatPrice`), `PriorityDots`, and the note 2-line clamp like `TileCuratedItem`. No claim control. The button calls `onCopy` and the parent shows a toast.

- [ ] **Step 1: Write the component**

```typescript
import type { Item } from '../../lib/db';
import { ItemPhoto } from '../../components/ItemPhoto';
import { PriorityDots } from '../../components/PriorityDots';
import { formatPrice } from '../../lib/formatPrice';
import { useI18n } from '../../i18n/useI18n';

interface MemberItemTileProps {
  item: Item;
  onCopy: () => void;
}

export function MemberItemTile({ item, onCopy }: MemberItemTileProps) {
  const { t } = useI18n();
  return (
    <article className="curated-tile">
      <ItemPhoto item={item} />
      <div className="curated-tile-meta">
        <PriorityDots priority={item.priority} />
        <h3 className="curated-tile-title">{item.title}</h3>
        {(item.maker || item.price_text) && (
          <p className="mono-meta">
            {item.maker}
            {item.maker && item.price_text ? ' · ' : ''}
            {item.price_text ? formatPrice(item.price_text) : ''}
          </p>
        )}
        {item.note && <p className="curated-tile-note">{item.note}</p>}
        <button type="button" className="btn btn-ghost" onClick={onCopy}>
          {t('item.copy')}
        </button>
      </div>
    </article>
  );
}
```

(Match the actual props of `ItemPhoto` / `PriorityDots` and the existing class names in `TileCuratedItem.tsx`; reuse them rather than inventing new CSS.)

- [ ] **Step 2: tsc clean** — `cd app && npx tsc -p tsconfig.app.json --noEmit`

## Task 12: `EventMemberListScreen` + route

**Files:**
- Create: `app/src/screens/events/EventMemberListScreen.tsx`
- Modify: `app/src/Router.tsx` (lazy route `/events/:eventId/member/:userId`)

**Context:** Screen fetches the member's shared items via `useCoparticipantList` and the member's profile (name/avatar) via a direct `profiles` select (allowed by the co-participant policy). Copy uses `useMyItems().copyItem` + a toast. Use `PaperLayout`; lazy-load like other authed routes (`Router.lazyNamed()`).

- [ ] **Step 1: Write the screen**

```typescript
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { PaperLayout } from '../../components/PaperLayout';
import { useCoparticipantList } from '../../events/useCoparticipantList';
import { useMyItems } from '../../items/useMyItems';
import { MemberItemTile } from './MemberItemTile';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../components/Toast';
import { useI18n } from '../../i18n/useI18n';
import { errorMessage } from '../../lib/errors';

export function EventMemberListScreen() {
  const { eventId, userId } = useParams<{ eventId: string; userId: string }>();
  const { t } = useI18n();
  const toast = useToast();
  const { query } = useCoparticipantList(userId ?? null);
  const { copyItem } = useMyItems();
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void supabase.from('profiles').select('display_name').eq('id', userId).maybeSingle()
      .then(({ data }) => { if (active) setName(data?.display_name ?? null); });
    return () => { active = false; };
  }, [userId]);

  async function onCopy(item: Parameters<typeof copyItem>[0]) {
    const { error } = await copyItem(item);
    toast.show(error ? errorMessage(t, error) : t('item.copiedToast'));
  }

  return (
    <PaperLayout>
      <Link to={`/events/${eventId}`} className="mono-meta">← {t('member.backToEvent')}</Link>
      <h1 className="display-s">{t('member.heading', { name: name ?? '' })}</h1>
      {query.status === 'ready' && query.items.length === 0 && (
        <p className="ink-2">{t('member.empty')}</p>
      )}
      {query.status === 'ready' && query.items.length > 0 && (
        <ul className="curated-tiles-grid">
          {query.items.map((item) => (
            <li key={item.id}>
              <MemberItemTile item={item} onCopy={() => void onCopy(item)} />
            </li>
          ))}
        </ul>
      )}
      {query.status === 'error' && <p className="ink-2">{t('errors.generic')}</p>}
    </PaperLayout>
  );
}
```

(Confirm exact import paths: `useToast`/`Toast`, `errorMessage`, the `errors.generic` key — match what other screens use.)

- [ ] **Step 2: Add the lazy route**

In `app/src/Router.tsx`, alongside the other `/events/:eventId` routes, add (using the existing `lazyNamed` + `appRoute` helpers):

```tsx
{appRoute('/events/:eventId/member/:userId', lazyNamed(() => import('./screens/events/EventMemberListScreen'), 'EventMemberListScreen'))}
```

(Match the precise signature of `lazyNamed`/`appRoute` already used for `EventDetailScreen`.)

- [ ] **Step 3: tsc clean** — `cd app && npx tsc -p tsconfig.app.json --noEmit`

## Task 13: Guest-facing participant list in `EventDetailScreen`

**Files:**
- Modify: `app/src/screens/events/EventDetailScreen.tsx`

**Context:** Today `ParticipantsSection` is mounted only when `isHonoree` (a collapsible `<details>` showing status). Add a guest-facing list: when the viewer is NOT the honoree, render the OTHER active co-participants (exclude self), each a link to `/events/:eventId/member/:userId`. `useEventParticipants(eventId)` already returns participants with profile fields (now resolvable for guests via the co-participant policy); filter to `status === 'active'` and `user_id !== myUserId`.

- [ ] **Step 1: Add a guest participant component**

Near `ParticipantsSection` / `ParticipantList`, add:

```tsx
function GuestParticipants({ eventId, myUserId }: { eventId: string; myUserId: string | null }) {
  const { t } = useI18n();
  const { query } = useEventParticipants(eventId);
  if (query.status !== 'ready') return null;
  const others = query.participants.filter((p) => p.status === 'active' && p.user_id !== myUserId);
  if (others.length === 0) return null;
  return (
    <section className="event-guests">
      <h2 className="display-xs">{t('events.guests.title')}</h2>
      <ul className="event-guests-list">
        {others.map((p) => (
          <li key={p.user_id}>
            <Link to={`/events/${eventId}/member/${p.user_id}`} className="event-guest-row">
              <span>{p.display_name}</span>
              <span className="mono-meta">{t('events.guests.browse')} →</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 2: Mount it for guests**

In the `ready` branch of `EventDetailScreen`, where `{isHonoree && <ParticipantsSection .../>}` is rendered, add the guest counterpart:

```tsx
{!isHonoree && <GuestParticipants eventId={eventId} myUserId={user?.id ?? null} />}
```

(Place it after the event header / share line and before/after `ItemsSection` to taste — keep the editorial layout; reuse existing section spacing classes.)

- [ ] **Step 3: tsc clean** — `cd app && npx tsc -p tsconfig.app.json --noEmit`

## Task 14: i18n keys

**Files:**
- Modify: `app/src/i18n/ru.ts` (source of truth)
- Modify: `app/src/i18n/en.ts` (must conform to the same shape)

- [ ] **Step 1: Add RU keys**

Under the appropriate namespaces in `ru.ts`:

```typescript
item: {
  // …existing…
  copy: 'хочу себе',
  copiedToast: 'добавили тебе в список',
},
events: {
  // …existing…
  guests: {
    title: 'кто ещё дарит',
    browse: 'посмотреть список',
  },
},
member: {
  heading: 'список {name}',
  backToEvent: 'к событию',
  empty: 'тут пока пусто',
},
```

- [ ] **Step 2: Mirror in EN** (`en.ts`):

```typescript
item: { /* … */ copy: 'I want this too', copiedToast: 'added to your list' },
events: { /* … */ guests: { title: 'who else is gifting', browse: 'see their list' } },
member: { heading: '{name}’s list', backToEvent: 'back to event', empty: 'nothing here yet' },
```

- [ ] **Step 3: tsc clean** (the `Translation` shape is structurally checked) — `cd app && npx tsc -p tsconfig.app.json --noEmit`

## Task 15: Local gate + commit (PR 2)

- [ ] **Step 1: Full local gate**

Run (frontend): `cd app && npm test && npm run lint && npm run build`
Run (integration): `eval "$(supabase status --output env | sed 's/^/export /')"; cd supabase/tests/integration && npm test`
Expected: all green.

- [ ] **Step 2: Manual smoke (UI — can't be unit-tested)**

Start `npm run dev`; with two accounts both active in one event: open the event as guest acc2 → see "кто ещё дарит" with acc3 → tap → see acc3's shared list → tap "хочу себе" on an item → toast → confirm it appears in acc2's own MyList. Confirm a private item of acc3 does NOT show. If you can't run two accounts, say so in the PR body.

- [ ] **Step 3: Commit**

```bash
git checkout -b feat/event-discovery-copy
git add supabase/migrations/20260530130000_get_coparticipant_list.sql \
        supabase/tests/integration/get-coparticipant-list.test.ts \
        app/src/events/useCoparticipantList.ts \
        app/src/screens/events/EventMemberListScreen.tsx \
        app/src/screens/events/MemberItemTile.tsx \
        app/src/screens/events/EventDetailScreen.tsx \
        app/src/items/useMyItems.ts \
        app/src/items/__tests__/copyItem.test.ts \
        app/src/Router.tsx \
        app/src/i18n/ru.ts app/src/i18n/en.ts \
        app/src/types/database.ts
git commit -m "$(cat <<'EOF'
feat(events): browse co-participant wishlists + copy an item to your own list

Guests in an event see who else is gifting, open each other's shared lists
(get_coparticipant_list, gated on shares_event_with), and copy an item they
like into their own list. Copy-only — no claim on another guest's general list.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review (run before handing off)

**1. Spec coverage**
- "Co-participants see who claimed" (bug F) → Task 2 + Task 3 (profiles policy + shares_event_with). ✓
- "Move tokens to profile_secrets first" → Task 3 ordering. ✓
- "See other guests" → Task 13 (GuestParticipants). ✓
- "Open their wishlist" → Task 8 (RPC) + Task 9 (hook) + Task 12 (screen). ✓
- "Copy to my list" → Task 10 (copyItem) + Task 11 (tile) + Task 12 (wire). ✓
- "Single-honoree model unchanged" → no event-schema change; honoree path untouched. ✓
- "Copy only, no claim on guest lists" → `get_coparticipant_list` returns no claims; `MemberItemTile` has no claim control; `can_see_item`/claims policy untouched. ✓
- Privacy invariant (honoree blind) → Task 2 asserts honoree sees zero claims; not regressed. ✓

**2. Placeholder scan** — no TBD/TODO; every code step has concrete code. Frontend steps say "match the actual prop/import" where the exact local signature must be confirmed against a named existing file — that's a reconciliation instruction, not a placeholder.

**3. Type consistency** — `shares_event_with(uuid,uuid)`, `get_coparticipant_list(uuid,text)`, `buildCopyInput(Item): CreateItemInput`, `copyItem(Item)`, `useCoparticipantList(string|null)` are used identically across tasks. `profile_secrets(user_id, share_token, add_me_token)` column names match between migration, RLS, RPCs, and frontend reads.

**Risk notes for the executor**
- The Task 3 migration is atomic and privacy-critical — apply locally and run Tasks 1+2 green BEFORE writing any frontend.
- Before the column DROPs, re-run the grep in Task 3 Step 1; if anything new references the tokens, rewrite it first or the DROP fails.
- Keep assertions exact (`toHaveLength`, `toEqual`, `toBeNull`) per project testing discipline.
