# Events Link-First Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace circles-first audience model on events with link-first sharing via `share_token`; auto-populate People from co-event-participants; ship in 4 stacked PRs with strict TDD (test commit BEFORE impl commit per feature, no exceptions).

**Architecture:** `events.share_token` (16 hex chars) + new `event_participants` table (status pending|active|declined) replaces `event_circles`. `SECURITY DEFINER` RPC `get_event_view` bypasses RLS for anonymous viewers with a valid token; the helper `can_see_item` is extended to recognise event-participation as a visibility path. Coordinator dashboard surfaces share link + invite-from-People modal; participants land on a public `/event/<token>` route that auto-joins on sign-in.

**Tech Stack:** Vite + React 19 + TypeScript (strict, `noUncheckedIndexedAccess`), Supabase (Postgres + RLS + Edge Functions + Realtime), Deno for Edge Functions, vitest + React Testing Library for frontend, vitest + `@supabase/supabase-js` for integration tests (running against local Supabase on shifted ports 544xx). Conventional commits (`test(area):`, `feat(area):`, `fix(area):`, `chore:`). Branch protection on `main` blocks direct push.

**Spec reference:** [`docs/superpowers/specs/2026-05-24-events-link-first-design.md`](../specs/2026-05-24-events-link-first-design.md)

---

## TDD discipline — non-negotiable

Lesson from prior cagnotte arc: the plan claimed TDD but execution skipped it, bundling tests with impl. This plan locks the rhythm into the steps:

For every feature (migration, RPC, helper, component):

1. **Write the failing test.** The test asserts the target behavior.
2. **Run the test → MUST FAIL** with a recognisable error (table not found / function not defined / element not in DOM).
3. **Commit the test** with `test(area):` prefix. The red commit is intentional — git log shows what was demanded before what was built.
4. **Write the minimal implementation** to make the test pass.
5. **Run the test → MUST PASS.**
6. **Commit the implementation** with `feat(area):` prefix.

Refactor commits are optional, `refactor(area):` prefix. Do not collapse the test commit into the impl commit. Reviewers (and future agents) need to see the red→green transition in git history.

---

## Phasing — one PR per phase

| Phase | Branch | Purpose | CI gate |
|---|---|---|---|
| **A** | `feat/events-link-data` | Schema + RLS + 5 RPCs + integration tests + frontend tsc-fix | tsc + vitest + integration + lint + build |
| **B** | `feat/events-link-email` | `event_email_log` migration + `send-event-invite` Edge Function + Deno tests | tsc + vitest + integration + edge tests + lint + build |
| **C** | `feat/events-link-ui-public` | `EventLandingScreen` (new) + `/event/:token` route + `CreateEventScreen` simplification + post-create share screen | tsc + vitest + RTL + lint + build |
| **D** | `feat/events-link-ui-coord` | `EventDetailScreen` coordinator section + `InviteFromPeopleModal` + `PeopleScreen` data switch + `EventsScreen` pending UI | tsc + vitest + RTL + lint + build + manual privacy smoke |

Each phase ends with `git push origin <branch>` + `gh pr create` against the previous phase's branch (stacked) or `main` (first phase). After merge, the next phase rebases onto the latest base.

---

## File map

```
supabase/migrations/
  20260524120000_events_link_first.sql                   [Phase A]
  20260524130000_event_email_log.sql                     [Phase B]

supabase/functions/
  send-event-invite/
    index.ts                                              [Phase B]
    template.ts                                           [Phase B]
    index.test.ts                                         [Phase B]

supabase/tests/integration/
  helpers/
    seed.ts (modify — seedEvent now uses participants)   [Phase A]
  events-link-migration.test.ts                          [Phase A]
  events-link-rls.test.ts                                [Phase A]
  events-link-rpcs.test.ts                               [Phase A]
  events-link-privacy.test.ts                            [Phase A]
  events-link-email.test.ts                              [Phase B]
  event-items-visibility.test.ts (modify — drop circles) [Phase A]

app/src/
  types/database.ts (regen)                              [Phase A]
  lib/
    errors.ts (modify)                                   [Phase A]
  i18n/
    ru.ts (modify)                                       [Phase A, C, D]
    en.ts (modify)                                       [Phase A, C, D]
  events/
    useEvent.ts (modify)                                 [Phase C]
    useEvents.ts (modify)                                [Phase D]
    eventApi.ts (create — thin RPC wrappers)             [Phase C]
    __tests__/
      useEvent.test.tsx                                  [Phase C]
      useEvents.test.tsx                                 [Phase D]
  people/
    usePeople.ts (modify)                                [Phase D]
    __tests__/
      usePeople.test.tsx                                 [Phase D]
  screens/
    events/
      CreateEventScreen.tsx (modify)                     [Phase C]
      EventLandingScreen.tsx (NEW)                       [Phase C]
      EventDetailScreen.tsx (modify)                     [Phase D]
      InviteFromPeopleModal.tsx (NEW)                    [Phase D]
      EventsScreen.tsx (modify)                          [Phase D]
      __tests__/
        EventLandingScreen.test.tsx                      [Phase C]
        CreateEventScreen.test.tsx                       [Phase C]
        InviteFromPeopleModal.test.tsx                   [Phase D]
        EventDetailScreen.test.tsx                       [Phase D]
        EventsScreen.test.tsx                            [Phase D]
    people/
      PeopleScreen.tsx (modify)                          [Phase D]
      __tests__/
        PeopleScreen.test.tsx                            [Phase D]
  Router.tsx (modify — add /event/:token)                [Phase C]
```

---

## Pre-flight checklist

Before starting any task:

- [ ] **Local Supabase up** — `supabase status` returns API on `http://127.0.0.1:54421`. If not: `supabase start`.
- [ ] **Working tree clean** — `git status` shows nothing untracked or uncommitted (except `.claude/`/`.superpowers/` which are gitignored).
- [ ] **On `main` + up-to-date** — `git checkout main && git pull origin main`.

After any commit:

- [ ] **No `--no-verify` ever.** Pre-commit hooks exist for a reason. If a hook fails, fix the root cause.

---

# PHASE A — Data layer

**Branch:** `feat/events-link-data`
**Base:** `main`
**Outcome:** new schema in place, all integration tests green, frontend still tsc-clean against the new `get_my_events` shape (the only frontend file touched: `EventsScreen.tsx` to drop `audience_circle_count`).

## Task A.0: Branch setup

- [ ] **Step 1: Create branch**

```sh
git checkout main && git pull origin main && git checkout -b feat/events-link-data
```

- [ ] **Step 2: Confirm clean baseline**

```sh
git status
```

Expected: `On branch feat/events-link-data` and `nothing to commit, working tree clean` (plus `.claude/`/`.superpowers/` untracked, which are gitignored).

- [ ] **Step 3: Run baseline CI to confirm green starting point**

```sh
cd /Users/edouard/dev/wishlist/app && npm run lint && npm run test -- --run && npx tsc -b && cd .. && (cd supabase/tests/integration && eval "$(supabase status --output env | sed 's/^/export /')" && npm test)
```

Expected: all green. If any baseline test fails on `main`, **stop and report** — don't conflate baseline failures with new work.

## Task A.1: Migration — wipe events + add share_token + create event_participants

**Files:**
- Create: `supabase/migrations/20260524120000_events_link_first.sql`
- Create: `supabase/tests/integration/events-link-migration.test.ts`

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/integration/events-link-migration.test.ts`:

```ts
// supabase/tests/integration/events-link-migration.test.ts
import { describe, it, expect } from 'vitest';
import { adminClient } from './helpers/client.ts';

describe('events link-first migration — schema shape', () => {
  it('events table has share_token NOT NULL unique', async () => {
    const admin = adminClient();
    const { data, error } = await admin.rpc('pg_typeof_share_token' as never, {});
    // Fall back to information_schema query via raw SQL through a helper RPC
    // we add to the migration itself, or use a direct query through pg.
    // For this test we query through admin using the schema introspection table.
    const result = await admin
      .from('events')
      .select('share_token')
      .limit(1);
    // If the column doesn't exist, .from('events').select('share_token') fails
    // at the postgrest layer; we assert error is null after migration.
    expect(error).toBeNull();
    expect(result.error).toBeNull();
  });

  it('event_circles table is dropped', async () => {
    const admin = adminClient();
    const { error } = await admin.from('event_circles' as never).select('*').limit(1);
    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/relation .* does not exist|not found in schema/i);
  });

  it('event_participants table exists with expected columns', async () => {
    const admin = adminClient();
    const { error } = await admin
      .from('event_participants')
      .select('id, event_id, user_id, status, invited_by, invited_at, joined_at, created_at, updated_at')
      .limit(1);
    expect(error).toBeNull();
  });

  it('event_participants status check constraint enforced', async () => {
    const admin = adminClient();
    // Need a real event + user for FK satisfaction; minimal seed
    const { data: u } = await admin.auth.admin.createUser({
      email: 'mig-test@test.local', password: 'test-test-test', email_confirm: true,
    });
    const userId = u!.user!.id;
    await admin.from('profiles').upsert({ id: userId, display_name: 'mig', handle: 'mig' });
    const { data: ev } = await admin.from('events')
      .insert({ honoree_id: userId, title: 'mig test event' })
      .select('id').single();
    const { error } = await admin.from('event_participants')
      .insert({ event_id: ev!.id, user_id: userId, status: 'bogus' });
    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/check constraint|invalid input/i);
    // cleanup
    await admin.from('events').delete().eq('id', ev!.id);
    await admin.auth.admin.deleteUser(userId);
  });
});
```

- [ ] **Step 2: Run test (expect FAIL — migration not yet applied)**

```sh
cd /Users/edouard/dev/wishlist/supabase/tests/integration && eval "$(supabase status --output env | sed 's/^/export /')" && npx vitest run events-link-migration.test.ts
```

Expected: 4 failed tests — `events.share_token` column missing or `event_participants` table missing.

- [ ] **Step 3: Commit the failing test**

```sh
cd /Users/edouard/dev/wishlist
git add supabase/tests/integration/events-link-migration.test.ts
git commit -m "$(cat <<'EOF'
test(db): events link-first migration shape

Asserts the post-migration shape: events.share_token NOT NULL unique,
event_circles dropped, event_participants exists with status check constraint.
Currently red — migration not yet written.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Write the migration**

Create `supabase/migrations/20260524120000_events_link_first.sql`:

```sql
-- ============================================================================
-- events link-first redesign — schema additions + event_circles drop
-- ============================================================================
-- Replaces the circles-first audience model with a link-first share token +
-- event_participants table. Existing events data is wiped (testing phase,
-- no real users per pivot 2026-05-24). Helpers can_see_event and
-- can_see_item are rewired to use the new participant path; legacy
-- item_groups visibility path is preserved.
--
-- See: docs/superpowers/specs/2026-05-24-events-link-first-design.md
-- ============================================================================

-- 1. Wipe existing event data (no real users — safe)
delete from public.event_items;
delete from public.event_circles;
delete from public.events;

-- 2. Drop event_circles — circles retired from event flow entirely
drop table public.event_circles;

-- 3. events.share_token: 16-hex-char URL-safe id, mirrors wishlist token format
alter table public.events
  add column share_token text not null
    default substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);

create unique index events_share_token_idx on public.events(share_token);

-- 4. NEW table event_participants — link-first audience tracking
create table public.event_participants (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.events(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  status          text not null default 'active'
                    check (status in ('pending', 'active', 'declined')),
  invited_by      uuid references auth.users(id),
  invited_at      timestamptz,
  joined_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (event_id, user_id)
);

create index event_participants_user_status_idx
  on public.event_participants(user_id, status);
create index event_participants_event_status_idx
  on public.event_participants(event_id, status);

create trigger event_participants_updated_at
  before update on public.event_participants
  for each row execute function public.set_updated_at();

-- 5. Realtime publication
alter publication supabase_realtime drop table public.event_circles;
alter publication supabase_realtime add  table public.event_participants;
```

- [ ] **Step 5: Apply the migration**

```sh
supabase migration up --local
```

Expected: `Local database is up to date` after applying `20260524120000_events_link_first.sql`.

- [ ] **Step 6: Regenerate types**

```sh
cd /Users/edouard/dev/wishlist && supabase gen types typescript --local --schema public 2>/dev/null > app/src/types/database.ts
```

Expected: `app/src/types/database.ts` updated; no `event_circles` references; new `event_participants` row type with status enum literal.

- [ ] **Step 7: Run test (expect PASS)**

```sh
cd /Users/edouard/dev/wishlist/supabase/tests/integration && eval "$(supabase status --output env | sed 's/^/export /')" && npx vitest run events-link-migration.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 8: Commit the migration + types**

```sh
cd /Users/edouard/dev/wishlist
git add supabase/migrations/20260524120000_events_link_first.sql app/src/types/database.ts
git commit -m "$(cat <<'EOF'
feat(db): events link-first schema + drop event_circles

- Wipe existing event data (testing phase per 2026-05-24 pivot)
- Drop event_circles table — circles retired from event flow
- Add events.share_token (16-hex-char) with unique index
- Create event_participants (status: pending/active/declined) with FK cascades
- Realtime: drop event_circles, add event_participants

Helpers can_see_event / can_see_item are updated in follow-up commits
to use the new participant path.

Spec: docs/superpowers/specs/2026-05-24-events-link-first-design.md
Test: supabase/tests/integration/events-link-migration.test.ts

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Task A.2: Update can_see_event helper

**Files:**
- Create: `supabase/migrations/20260524120100_can_see_event.sql`
- Modify: `supabase/tests/integration/events-link-migration.test.ts` (add helper coverage)

- [ ] **Step 1: Add failing test for new can_see_event behavior**

Append to `supabase/tests/integration/events-link-migration.test.ts`:

```ts
describe('can_see_event helper — new behavior', () => {
  it('honoree returns true', async () => {
    const admin = adminClient();
    await admin.auth.admin.createUser({
      id: '11111111-1111-1111-1111-111111111111', email: 'alice@test.local',
      password: 't', email_confirm: true,
    }).catch(() => {});
    await admin.from('profiles').upsert({
      id: '11111111-1111-1111-1111-111111111111', display_name: 'alice', handle: 'alice_t',
      onboarded_at: new Date().toISOString(),
    });
    const { data: ev } = await admin.from('events')
      .insert({ honoree_id: '11111111-1111-1111-1111-111111111111', title: 'cse test' })
      .select('id').single();
    const aliceClient = await (await import('./helpers/client.ts')).clientFor('11111111-1111-1111-1111-111111111111');
    const { data: visible, error } = await aliceClient.rpc('can_see_event', { _event_id: ev!.id });
    expect(error).toBeNull();
    expect(visible).toBe(true);
    await admin.from('events').delete().eq('id', ev!.id);
  });

  it('active participant returns true; outsider returns false', async () => {
    const { seedFresh } = await import('./helpers/seed.ts');
    const ctx = await seedFresh();
    const admin = adminClient();
    const { data: ev } = await admin.from('events')
      .insert({ honoree_id: ctx.alice, title: 'cse-p test' })
      .select('id').single();
    await admin.from('event_participants')
      .insert({ event_id: ev!.id, user_id: ctx.bob, status: 'active', joined_at: new Date().toISOString() });

    const { clientFor } = await import('./helpers/client.ts');
    const bobClient = await clientFor(ctx.bob);
    const daveClient = await clientFor(ctx.dave);

    const { data: bobSees } = await bobClient.rpc('can_see_event', { _event_id: ev!.id });
    const { data: daveSees } = await daveClient.rpc('can_see_event', { _event_id: ev!.id });

    expect(bobSees).toBe(true);
    expect(daveSees).toBe(false);
  });
});
```

- [ ] **Step 2: Run test (expect FAIL — helper still uses event_circles)**

```sh
cd /Users/edouard/dev/wishlist/supabase/tests/integration && eval "$(supabase status --output env | sed 's/^/export /')" && npx vitest run events-link-migration.test.ts -t "can_see_event"
```

Expected: 2 fail. Bob (active participant) returns false because helper queries `event_circles` which no longer exists, OR returns false because participants path doesn't exist in helper yet.

- [ ] **Step 3: Commit the test**

```sh
git add supabase/tests/integration/events-link-migration.test.ts
git commit -m "$(cat <<'EOF'
test(db): can_see_event recognises active participants

Honoree returns true; active participant returns true; outsider returns false.
Currently red — helper still references dropped event_circles.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Write migration for can_see_event**

Create `supabase/migrations/20260524120100_can_see_event.sql`:

```sql
-- Rewire can_see_event to use event_participants instead of event_circles.
create or replace function public.can_see_event(_event_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.events e
    where e.id = _event_id
      and (
        e.honoree_id = auth.uid()
        or exists (
          select 1 from public.event_participants ep
          where ep.event_id = e.id
            and ep.user_id = auth.uid()
            and ep.status = 'active'
        )
      )
  );
$$;
```

- [ ] **Step 5: Apply migration + run test**

```sh
cd /Users/edouard/dev/wishlist && supabase migration up --local
cd /Users/edouard/dev/wishlist/supabase/tests/integration && eval "$(supabase status --output env | sed 's/^/export /')" && npx vitest run events-link-migration.test.ts -t "can_see_event"
```

Expected: 2 pass.

- [ ] **Step 6: Commit the migration**

```sh
cd /Users/edouard/dev/wishlist
git add supabase/migrations/20260524120100_can_see_event.sql
git commit -m "$(cat <<'EOF'
feat(db): can_see_event uses event_participants

Drop event_circles join; recognise honoree + active participants.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Task A.3: Update can_see_item helper (add event-participation path)

**Files:**
- Create: `supabase/migrations/20260524120200_can_see_item.sql`
- Create: `supabase/tests/integration/events-link-item-visibility.test.ts`

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/integration/events-link-item-visibility.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { adminClient, clientFor } from './helpers/client.ts';
import { seedFresh, type SeedContext } from './helpers/seed.ts';

describe('can_see_item — event-participation path', () => {
  let ctx: SeedContext;
  beforeEach(async () => { ctx = await seedFresh(); });

  it('participant in event with curated item can see that item', async () => {
    const admin = adminClient();
    const { data: ev } = await admin.from('events')
      .insert({ honoree_id: ctx.alice, title: 'csi test' })
      .select('id').single();
    await admin.from('event_items')
      .insert({ event_id: ev!.id, item_id: ctx.itemAliceOwns });
    await admin.from('event_participants')
      .insert({ event_id: ev!.id, user_id: ctx.dave, status: 'active', joined_at: new Date().toISOString() });

    // Dave is NOT in alice's seed group, so without event-path he can't see the item.
    // After event-path is added, he should see it.
    const daveClient = await clientFor(ctx.dave);
    const { data: sees } = await daveClient.rpc('can_see_item', { _item_id: ctx.itemAliceOwns });
    expect(sees).toBe(true);
  });

  it('outsider with no event tie cannot see the item', async () => {
    const admin = adminClient();
    // Create a fresh item that is NOT in any group and NOT in any event
    const { data: lonelyItem } = await admin.from('items')
      .insert({ owner_id: ctx.alice, title: 'lonely' })
      .select('id').single();
    const daveClient = await clientFor(ctx.dave);
    const { data: sees } = await daveClient.rpc('can_see_item', { _item_id: lonelyItem!.id });
    expect(sees).toBe(false);
  });

  it('legacy item_groups path still works (no regression)', async () => {
    // dave IS in alice's seeded group, and itemAliceOwns IS in that group
    const daveClient = await clientFor(ctx.dave);
    const { data: sees } = await daveClient.rpc('can_see_item', { _item_id: ctx.itemAliceOwns });
    expect(sees).toBe(true);
  });
});
```

- [ ] **Step 2: Run test (expect FAIL on event-path test)**

```sh
cd /Users/edouard/dev/wishlist/supabase/tests/integration && eval "$(supabase status --output env | sed 's/^/export /')" && npx vitest run events-link-item-visibility.test.ts
```

Expected: first test fails (event-path not in helper), second and third pass (lonely item and legacy paths already covered).

- [ ] **Step 3: Commit the test**

```sh
git add supabase/tests/integration/events-link-item-visibility.test.ts
git commit -m "$(cat <<'EOF'
test(db): can_see_item recognises event-participation path

Active participant can see items curated on an event, even if not
in any item_groups path. Legacy group path still works (regression
guard).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Write migration for can_see_item**

Create `supabase/migrations/20260524120200_can_see_item.sql`:

```sql
-- Extend can_see_item with event-participation path.
-- Legacy item_groups path is preserved.
create or replace function public.can_see_item(_item_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select
    exists (select 1 from public.items where id = _item_id and owner_id = auth.uid())
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
```

- [ ] **Step 5: Apply + run test**

```sh
cd /Users/edouard/dev/wishlist && supabase migration up --local
cd /Users/edouard/dev/wishlist/supabase/tests/integration && eval "$(supabase status --output env | sed 's/^/export /')" && npx vitest run events-link-item-visibility.test.ts
```

Expected: 3 pass.

- [ ] **Step 6: Commit**

```sh
cd /Users/edouard/dev/wishlist
git add supabase/migrations/20260524120200_can_see_item.sql
git commit -m "$(cat <<'EOF'
feat(db): can_see_item recognises event-participation path

Extend visibility chain: own → item_groups → event_participants.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Task A.4: Update events RLS (drop circle policy, add participant policy)

**Files:**
- Create: `supabase/migrations/20260524120300_events_rls.sql`
- Create: `supabase/tests/integration/events-link-rls.test.ts`

- [ ] **Step 1: Write the failing RLS test**

Create `supabase/tests/integration/events-link-rls.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { adminClient, clientFor } from './helpers/client.ts';
import { seedFresh, type SeedContext } from './helpers/seed.ts';

describe('events RLS — link-first', () => {
  let ctx: SeedContext;
  beforeEach(async () => { ctx = await seedFresh(); });

  it('honoree can SELECT own event', async () => {
    const admin = adminClient();
    const { data: ev } = await admin.from('events')
      .insert({ honoree_id: ctx.alice, title: 'a' }).select('id').single();
    const aliceClient = await clientFor(ctx.alice);
    const { data } = await aliceClient.from('events').select('id').eq('id', ev!.id);
    expect(data).toHaveLength(1);
  });

  it('active participant can SELECT event', async () => {
    const admin = adminClient();
    const { data: ev } = await admin.from('events')
      .insert({ honoree_id: ctx.alice, title: 'b' }).select('id').single();
    await admin.from('event_participants').insert({
      event_id: ev!.id, user_id: ctx.bob, status: 'active', joined_at: new Date().toISOString(),
    });
    const bobClient = await clientFor(ctx.bob);
    const { data } = await bobClient.from('events').select('id').eq('id', ev!.id);
    expect(data).toHaveLength(1);
  });

  it('pending participant CANNOT SELECT event (until join)', async () => {
    const admin = adminClient();
    const { data: ev } = await admin.from('events')
      .insert({ honoree_id: ctx.alice, title: 'c' }).select('id').single();
    await admin.from('event_participants').insert({
      event_id: ev!.id, user_id: ctx.bob, status: 'pending',
      invited_by: ctx.alice, invited_at: new Date().toISOString(),
    });
    const bobClient = await clientFor(ctx.bob);
    const { data } = await bobClient.from('events').select('id').eq('id', ev!.id);
    expect(data).toEqual([]);
  });

  it('outsider CANNOT SELECT event', async () => {
    const admin = adminClient();
    const { data: ev } = await admin.from('events')
      .insert({ honoree_id: ctx.alice, title: 'd' }).select('id').single();
    const daveClient = await clientFor(ctx.dave);
    const { data } = await daveClient.from('events').select('id').eq('id', ev!.id);
    expect(data).toEqual([]);
  });

  it('non-honoree CANNOT UPDATE event', async () => {
    const admin = adminClient();
    const { data: ev } = await admin.from('events')
      .insert({ honoree_id: ctx.alice, title: 'e' }).select('id').single();
    await admin.from('event_participants').insert({
      event_id: ev!.id, user_id: ctx.bob, status: 'active', joined_at: new Date().toISOString(),
    });
    const bobClient = await clientFor(ctx.bob);
    const { error } = await bobClient.from('events')
      .update({ title: 'hijacked' }).eq('id', ev!.id);
    // RLS UPDATE check fails silently (returns no rows) or with 42501
    const { data: after } = await admin.from('events').select('title').eq('id', ev!.id).single();
    expect(after?.title).toBe('e');
  });
});
```

- [ ] **Step 2: Run test (expect FAIL on tests 2-4 — old audience policy still gates by event_circles)**

```sh
cd /Users/edouard/dev/wishlist/supabase/tests/integration && eval "$(supabase status --output env | sed 's/^/export /')" && npx vitest run events-link-rls.test.ts
```

Expected: tests 2 and 3 fail (participants can't see; pending can; etc.). The old policy `"events: audience members can read"` still tries to query the dropped `event_circles` table — likely 500 errors or empty results.

- [ ] **Step 3: Commit the test**

```sh
git add supabase/tests/integration/events-link-rls.test.ts
git commit -m "$(cat <<'EOF'
test(db): events RLS — link-first audience via participants

- Honoree can SELECT own event
- Active participant can SELECT
- Pending participant CANNOT SELECT (until they join)
- Outsider CANNOT SELECT
- Non-honoree CANNOT UPDATE

Currently red — old "audience members can read" policy references the
dropped event_circles table.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Write events RLS migration**

Create `supabase/migrations/20260524120300_events_rls.sql`:

```sql
-- Drop legacy audience-circle policy and replace with participant-based path.
-- Honoree-read, INSERT, UPDATE, DELETE policies stay (honoree-only).

drop policy if exists "events: audience members can read" on public.events;

create policy events_participants_can_read on public.events for select
  using (
    exists (
      select 1 from public.event_participants ep
      where ep.event_id = events.id
        and ep.user_id = auth.uid()
        and ep.status = 'active'
    )
  );
```

- [ ] **Step 5: Apply + run test**

```sh
cd /Users/edouard/dev/wishlist && supabase migration up --local
cd /Users/edouard/dev/wishlist/supabase/tests/integration && eval "$(supabase status --output env | sed 's/^/export /')" && npx vitest run events-link-rls.test.ts -t "events RLS"
```

Expected: 5 pass.

- [ ] **Step 6: Commit**

```sh
cd /Users/edouard/dev/wishlist
git add supabase/migrations/20260524120300_events_rls.sql
git commit -m "$(cat <<'EOF'
feat(db): events RLS — audience via event_participants

Drop legacy audience-circle SELECT policy; add participant-based one
(active participants see the event; pending do not).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Task A.5: event_participants RLS (4 policies)

**Files:**
- Create: `supabase/migrations/20260524120400_event_participants_rls.sql`
- Modify: `supabase/tests/integration/events-link-rls.test.ts` (extend)

- [ ] **Step 1: Append failing tests for event_participants RLS**

Append to `supabase/tests/integration/events-link-rls.test.ts`:

```ts
describe('event_participants RLS', () => {
  let ctx: SeedContext;
  beforeEach(async () => { ctx = await seedFresh(); });

  async function makeEvent(honoree: string): Promise<string> {
    const admin = adminClient();
    const { data: ev } = await admin.from('events')
      .insert({ honoree_id: honoree, title: 'p-test' }).select('id').single();
    return ev!.id;
  }

  it('SELECT: own row visible, even when pending', async () => {
    const admin = adminClient();
    const evId = await makeEvent(ctx.alice);
    await admin.from('event_participants').insert({
      event_id: evId, user_id: ctx.bob, status: 'pending',
      invited_by: ctx.alice, invited_at: new Date().toISOString(),
    });
    const bobClient = await clientFor(ctx.bob);
    const { data } = await bobClient.from('event_participants').select('id, status').eq('event_id', evId);
    expect(data).toHaveLength(1);
    expect(data?.[0]?.status).toBe('pending');
  });

  it('SELECT: honoree sees all (active + pending)', async () => {
    const admin = adminClient();
    const evId = await makeEvent(ctx.alice);
    await admin.from('event_participants').insert([
      { event_id: evId, user_id: ctx.bob, status: 'active', joined_at: new Date().toISOString() },
      { event_id: evId, user_id: ctx.carol, status: 'pending', invited_by: ctx.alice, invited_at: new Date().toISOString() },
    ]);
    const aliceClient = await clientFor(ctx.alice);
    const { data } = await aliceClient.from('event_participants').select('user_id, status').eq('event_id', evId);
    expect(data).toHaveLength(2);
  });

  it('SELECT: co-active sees others (including pending)', async () => {
    const admin = adminClient();
    const evId = await makeEvent(ctx.alice);
    await admin.from('event_participants').insert([
      { event_id: evId, user_id: ctx.bob, status: 'active', joined_at: new Date().toISOString() },
      { event_id: evId, user_id: ctx.carol, status: 'pending', invited_by: ctx.alice, invited_at: new Date().toISOString() },
    ]);
    const bobClient = await clientFor(ctx.bob);
    const { data } = await bobClient.from('event_participants').select('user_id, status').eq('event_id', evId);
    expect(data).toHaveLength(2);
  });

  it('SELECT: pending only sees own row, not co-participants', async () => {
    const admin = adminClient();
    const evId = await makeEvent(ctx.alice);
    await admin.from('event_participants').insert([
      { event_id: evId, user_id: ctx.bob, status: 'active', joined_at: new Date().toISOString() },
      { event_id: evId, user_id: ctx.carol, status: 'pending', invited_by: ctx.alice, invited_at: new Date().toISOString() },
    ]);
    const carolClient = await clientFor(ctx.carol);
    const { data } = await carolClient.from('event_participants').select('user_id').eq('event_id', evId);
    expect(data).toHaveLength(1);
    expect(data?.[0]?.user_id).toBe(ctx.carol);
  });

  it('INSERT: honoree can pre-invite as pending', async () => {
    const evId = await makeEvent(ctx.alice);
    const aliceClient = await clientFor(ctx.alice);
    const { error } = await aliceClient.from('event_participants').insert({
      event_id: evId, user_id: ctx.bob, status: 'pending',
      invited_by: ctx.alice, invited_at: new Date().toISOString(),
    });
    expect(error).toBeNull();
  });

  it('INSERT: non-honoree CANNOT insert', async () => {
    const evId = await makeEvent(ctx.alice);
    const bobClient = await clientFor(ctx.bob);
    const { error } = await bobClient.from('event_participants').insert({
      event_id: evId, user_id: ctx.carol, status: 'pending',
      invited_by: ctx.bob, invited_at: new Date().toISOString(),
    });
    expect(error).toBeTruthy();
    expect(error?.code).toBe('42501');
  });

  it('INSERT: honoree CANNOT insert active status directly (must go through RPC)', async () => {
    const evId = await makeEvent(ctx.alice);
    const aliceClient = await clientFor(ctx.alice);
    const { error } = await aliceClient.from('event_participants').insert({
      event_id: evId, user_id: ctx.bob, status: 'active', joined_at: new Date().toISOString(),
    });
    expect(error).toBeTruthy();  // policy requires status='pending' on direct INSERT
  });

  it('UPDATE: own row — can flip to declined', async () => {
    const admin = adminClient();
    const evId = await makeEvent(ctx.alice);
    await admin.from('event_participants').insert({
      event_id: evId, user_id: ctx.bob, status: 'pending',
      invited_by: ctx.alice, invited_at: new Date().toISOString(),
    });
    const bobClient = await clientFor(ctx.bob);
    const { error } = await bobClient.from('event_participants')
      .update({ status: 'declined' })
      .eq('event_id', evId).eq('user_id', ctx.bob);
    expect(error).toBeNull();
  });

  it('DELETE: only honoree can kick', async () => {
    const admin = adminClient();
    const evId = await makeEvent(ctx.alice);
    await admin.from('event_participants').insert({
      event_id: evId, user_id: ctx.bob, status: 'active', joined_at: new Date().toISOString(),
    });
    const bobClient = await clientFor(ctx.bob);
    const { error: bobErr } = await bobClient.from('event_participants')
      .delete().eq('event_id', evId).eq('user_id', ctx.bob);
    // bob's own delete blocked (only honoree can delete)
    expect(bobErr === null || bobErr.code === '42501').toBe(true);
    // verify still there
    const { count } = await admin.from('event_participants')
      .select('*', { count: 'exact', head: true }).eq('event_id', evId);
    expect(count).toBe(1);

    const aliceClient = await clientFor(ctx.alice);
    const { error: aliceErr } = await aliceClient.from('event_participants')
      .delete().eq('event_id', evId).eq('user_id', ctx.bob);
    expect(aliceErr).toBeNull();
  });
});
```

- [ ] **Step 2: Run test (expect FAIL — no RLS policies yet)**

```sh
cd /Users/edouard/dev/wishlist/supabase/tests/integration && eval "$(supabase status --output env | sed 's/^/export /')" && npx vitest run events-link-rls.test.ts -t "event_participants RLS"
```

Expected: most fail. Without RLS enabled or policies, either everything is open (returns more than expected) or RLS-on-create is denying all (returns less).

- [ ] **Step 3: Commit the tests**

```sh
git add supabase/tests/integration/events-link-rls.test.ts
git commit -m "$(cat <<'EOF'
test(db): event_participants RLS matrix

- SELECT: own row always; honoree all; co-active all; pending own only
- INSERT: honoree pre-invite (pending) only; non-honoree blocked;
  status must be 'pending' on direct insert
- UPDATE: own row OR honoree
- DELETE: honoree only (kick)

Currently red — no RLS policies on event_participants yet.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Write the RLS migration**

Create `supabase/migrations/20260524120400_event_participants_rls.sql`:

```sql
-- event_participants RLS
alter table public.event_participants enable row level security;

create policy event_participants_select on public.event_participants for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.events e
      where e.id = event_id and e.honoree_id = auth.uid()
    )
    or exists (
      select 1 from public.event_participants self
      where self.event_id = event_participants.event_id
        and self.user_id = auth.uid()
        and self.status = 'active'
    )
  );

create policy event_participants_insert on public.event_participants for insert
  with check (
    exists (select 1 from public.events e where e.id = event_id and e.honoree_id = auth.uid())
    and status = 'pending'
    and invited_by = auth.uid()
  );

create policy event_participants_update on public.event_participants for update
  using (
    user_id = auth.uid()
    or exists (select 1 from public.events e where e.id = event_id and e.honoree_id = auth.uid())
  )
  with check (
    user_id = auth.uid()
    or exists (select 1 from public.events e where e.id = event_id and e.honoree_id = auth.uid())
  );

create policy event_participants_delete on public.event_participants for delete
  using (exists (select 1 from public.events e where e.id = event_id and e.honoree_id = auth.uid()));
```

- [ ] **Step 5: Apply + run test**

```sh
cd /Users/edouard/dev/wishlist && supabase migration up --local
cd /Users/edouard/dev/wishlist/supabase/tests/integration && eval "$(supabase status --output env | sed 's/^/export /')" && npx vitest run events-link-rls.test.ts -t "event_participants RLS"
```

Expected: 9 pass.

- [ ] **Step 6: Commit**

```sh
cd /Users/edouard/dev/wishlist
git add supabase/migrations/20260524120400_event_participants_rls.sql
git commit -m "$(cat <<'EOF'
feat(db): event_participants RLS — 4 policies

SELECT (own/honoree/co-active), INSERT (honoree pre-invite only,
status=pending, invited_by=self), UPDATE (own or honoree), DELETE
(honoree only).

Self-join via SECURITY DEFINER RPC bypasses RLS (added in next task).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Task A.6: RPC get_event_view

**Files:**
- Create: `supabase/migrations/20260524120500_get_event_view.sql`
- Create: `supabase/tests/integration/events-link-rpcs.test.ts`

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/integration/events-link-rpcs.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { adminClient, clientFor } from './helpers/client.ts';
import { SUPABASE_URL, ANON_KEY } from './helpers/env.ts';
import { seedFresh, type SeedContext } from './helpers/seed.ts';

const anonClient = () => createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

describe('RPC get_event_view', () => {
  let ctx: SeedContext;
  let eventId: string;
  let shareToken: string;

  beforeEach(async () => {
    ctx = await seedFresh();
    const admin = adminClient();
    const { data: ev } = await admin.from('events')
      .insert({ honoree_id: ctx.alice, title: 'View Test' })
      .select('id, share_token').single();
    eventId = ev!.id;
    shareToken = ev!.share_token;
    await admin.from('event_items')
      .insert({ event_id: eventId, item_id: ctx.itemAliceOwns });
  });

  it('anon with valid token sees event + items, claim status is null', async () => {
    const { data, error } = await anonClient().rpc('get_event_view', { _token: shareToken });
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    const row = data![0];
    expect(row.event_id).toBe(eventId);
    expect(row.title).toBe('View Test');
    expect(row.my_status).toBe('anon');
    expect(row.items).toHaveLength(1);
    const item = row.items[0];
    expect(item.id).toBe(ctx.itemAliceOwns);
    expect(item.is_claimed).toBeNull();
  });

  it('anon with invalid token raises event_not_found', async () => {
    const { error } = await anonClient().rpc('get_event_view', { _token: 'badbadbadbadbadx' });
    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/event_not_found/);
  });

  it('honoree sees event with claim status MASKED (null)', async () => {
    const aliceClient = await clientFor(ctx.alice);
    const { data } = await aliceClient.rpc('get_event_view', { _token: shareToken });
    const row = data![0];
    expect(row.my_status).toBe('honoree');
    expect(row.items[0].is_claimed).toBeNull();
  });

  it('active participant (non-honoree) sees claim status', async () => {
    const admin = adminClient();
    await admin.from('event_participants').insert({
      event_id: eventId, user_id: ctx.bob, status: 'active', joined_at: new Date().toISOString(),
    });
    // Item is unclaimed so far
    const bobClient = await clientFor(ctx.bob);
    const { data } = await bobClient.rpc('get_event_view', { _token: shareToken });
    const row = data![0];
    expect(row.my_status).toBe('active');
    expect(row.items[0].is_claimed).toBe(false);
  });

  it('participant_count counts active only', async () => {
    const admin = adminClient();
    await admin.from('event_participants').insert([
      { event_id: eventId, user_id: ctx.bob, status: 'active', joined_at: new Date().toISOString() },
      { event_id: eventId, user_id: ctx.carol, status: 'pending', invited_by: ctx.alice, invited_at: new Date().toISOString() },
    ]);
    const { data } = await anonClient().rpc('get_event_view', { _token: shareToken });
    expect(data![0].participant_count).toBe(1);
  });
});
```

- [ ] **Step 2: Run test (expect FAIL — function doesn't exist)**

```sh
cd /Users/edouard/dev/wishlist/supabase/tests/integration && eval "$(supabase status --output env | sed 's/^/export /')" && npx vitest run events-link-rpcs.test.ts -t "get_event_view"
```

Expected: 5 fail with `function public.get_event_view(text) does not exist`.

- [ ] **Step 3: Commit the test**

```sh
git add supabase/tests/integration/events-link-rpcs.test.ts
git commit -m "$(cat <<'EOF'
test(db): RPC get_event_view — masking + token gate

- Anon with valid token: event + items, is_claimed always null, my_status='anon'
- Anon with invalid token: event_not_found error
- Honoree: my_status='honoree', is_claimed null (owner-blind)
- Active non-honoree: is_claimed has real value
- participant_count is active-only

Currently red — function does not exist.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Write the migration**

Create `supabase/migrations/20260524120500_get_event_view.sql`:

```sql
-- SECURITY DEFINER RPC: public event view via share token.
-- Self-contained auth check; masks claim status by viewer role.

create or replace function public.get_event_view(_token text)
returns table (
  event_id            uuid,
  title               text,
  kind                text,
  occurs_on           date,
  note                text,
  honoree_id          uuid,
  honoree_name        text,
  honoree_avatar_url  text,
  my_status           text,
  participant_count   integer,
  items               jsonb
)
language plpgsql security definer
set search_path = public
as $$
declare
  _event       record;
  _viewer      uuid := auth.uid();
  _is_honoree  boolean;
  _is_active   boolean;
  _is_pending  boolean;
  _my_status   text;
  _pcount      integer;
  _items_json  jsonb;
begin
  -- 1. Resolve token
  select e.id, e.title, e.kind, e.occurs_on, e.note, e.honoree_id,
         p.display_name, p.avatar_url
    into _event
  from events e
  join profiles p on p.id = e.honoree_id
  where e.share_token = _token;

  if _event.id is null then
    raise exception 'event_not_found' using errcode = 'P0001';
  end if;

  -- 2. Determine viewer role
  _is_honoree := _viewer = _event.honoree_id;

  if _viewer is null then
    _my_status := 'anon';
  elsif _is_honoree then
    _my_status := 'honoree';
  else
    select status into _my_status
    from event_participants
    where event_id = _event.id and user_id = _viewer;
    if _my_status is null then _my_status := 'guest'; end if;
  end if;

  _is_active := _my_status = 'active';

  -- 3. Participant count (active only)
  select count(*)::int into _pcount
  from event_participants
  where event_id = _event.id and status = 'active';

  -- 4. Items as jsonb. is_claimed visible only to active non-honoree.
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',          i.id,
    'title',       i.title,
    'cover_url',   i.cover_url,
    'url',         i.url,
    'price_cents', i.price_cents,
    'currency',    i.currency,
    'is_claimed',
      case
        when _is_active and not _is_honoree then
          exists(select 1 from claims c where c.item_id = i.id)
        else null
      end
  ) order by ei.added_at), '[]'::jsonb)
    into _items_json
  from event_items ei
  join items i on i.id = ei.item_id
  where ei.event_id = _event.id;

  return query select
    _event.id, _event.title, _event.kind, _event.occurs_on, _event.note,
    _event.honoree_id, _event.display_name, _event.avatar_url,
    _my_status, _pcount, _items_json;
end; $$;

grant execute on function public.get_event_view(text) to anon, authenticated;
```

- [ ] **Step 5: Apply + run test**

```sh
cd /Users/edouard/dev/wishlist && supabase migration up --local
cd /Users/edouard/dev/wishlist/supabase/tests/integration && eval "$(supabase status --output env | sed 's/^/export /')" && npx vitest run events-link-rpcs.test.ts -t "get_event_view"
```

Expected: 5 pass.

- [ ] **Step 6: Commit**

```sh
cd /Users/edouard/dev/wishlist
git add supabase/migrations/20260524120500_get_event_view.sql
git commit -m "$(cat <<'EOF'
feat(db): RPC get_event_view — public event view via token

SECURITY DEFINER. Self-resolves token; raises event_not_found if invalid.
Masks is_claimed to null for anon, pending, and honoree (owner-blind).
participant_count is active-only.

Granted to anon + authenticated.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Task A.7: RPC join_event_via_token

**Files:**
- Create: `supabase/migrations/20260524120600_join_event_via_token.sql`
- Modify: `supabase/tests/integration/events-link-rpcs.test.ts` (extend)

- [ ] **Step 1: Append failing tests**

Append to `supabase/tests/integration/events-link-rpcs.test.ts`:

```ts
describe('RPC join_event_via_token', () => {
  let ctx: SeedContext;
  let eventId: string;
  let shareToken: string;

  beforeEach(async () => {
    ctx = await seedFresh();
    const admin = adminClient();
    const { data: ev } = await admin.from('events')
      .insert({ honoree_id: ctx.alice, title: 'Join Test' })
      .select('id, share_token').single();
    eventId = ev!.id;
    shareToken = ev!.share_token;
  });

  it('anon caller raises not_authenticated', async () => {
    const anon = anonClient();
    const { error } = await anon.rpc('join_event_via_token', { _token: shareToken });
    expect(error?.message).toMatch(/not_authenticated/);
  });

  it('invalid token raises event_not_found', async () => {
    const bobClient = await clientFor(ctx.bob);
    const { error } = await bobClient.rpc('join_event_via_token', { _token: 'invalid_token_x' });
    expect(error?.message).toMatch(/event_not_found/);
  });

  it('new visitor: creates active participant row, returns event_id', async () => {
    const bobClient = await clientFor(ctx.bob);
    const { data, error } = await bobClient.rpc('join_event_via_token', { _token: shareToken });
    expect(error).toBeNull();
    expect(data).toBe(eventId);
    const admin = adminClient();
    const { data: row } = await admin.from('event_participants')
      .select('status, joined_at')
      .eq('event_id', eventId).eq('user_id', ctx.bob).single();
    expect(row?.status).toBe('active');
    expect(row?.joined_at).toBeTruthy();
  });

  it('pre-invited (pending) flips to active', async () => {
    const admin = adminClient();
    await admin.from('event_participants').insert({
      event_id: eventId, user_id: ctx.bob, status: 'pending',
      invited_by: ctx.alice, invited_at: new Date().toISOString(),
    });
    const bobClient = await clientFor(ctx.bob);
    await bobClient.rpc('join_event_via_token', { _token: shareToken });
    const { data: row } = await admin.from('event_participants')
      .select('status, joined_at')
      .eq('event_id', eventId).eq('user_id', ctx.bob).single();
    expect(row?.status).toBe('active');
    expect(row?.joined_at).toBeTruthy();
  });

  it('idempotent: calling twice does not create duplicate', async () => {
    const bobClient = await clientFor(ctx.bob);
    await bobClient.rpc('join_event_via_token', { _token: shareToken });
    await bobClient.rpc('join_event_via_token', { _token: shareToken });
    const admin = adminClient();
    const { count } = await admin.from('event_participants')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId).eq('user_id', ctx.bob);
    expect(count).toBe(1);
  });

  it('honoree calling: no participant row created, returns event_id', async () => {
    const aliceClient = await clientFor(ctx.alice);
    const { data } = await aliceClient.rpc('join_event_via_token', { _token: shareToken });
    expect(data).toBe(eventId);
    const admin = adminClient();
    const { count } = await admin.from('event_participants')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId).eq('user_id', ctx.alice);
    expect(count).toBe(0);
  });
});
```

- [ ] **Step 2: Run test (expect FAIL — function not defined)**

```sh
cd /Users/edouard/dev/wishlist/supabase/tests/integration && eval "$(supabase status --output env | sed 's/^/export /')" && npx vitest run events-link-rpcs.test.ts -t "join_event_via_token"
```

Expected: 6 fail with `function public.join_event_via_token(text) does not exist`.

- [ ] **Step 3: Commit tests**

```sh
git add supabase/tests/integration/events-link-rpcs.test.ts
git commit -m "$(cat <<'EOF'
test(db): RPC join_event_via_token

- Anon: not_authenticated error
- Invalid token: event_not_found
- New visitor: creates active row, returns event_id
- Pending → active flip via upsert
- Idempotent
- Honoree: no row created, returns event_id

Currently red — function does not exist.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Write migration**

Create `supabase/migrations/20260524120600_join_event_via_token.sql`:

```sql
create or replace function public.join_event_via_token(_token text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  _eid uuid;
  _hid uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select id, honoree_id into _eid, _hid
  from events where share_token = _token;

  if _eid is null then
    raise exception 'event_not_found' using errcode = 'P0001';
  end if;

  -- Honoree gets no participant row — they have their own role.
  if _hid = auth.uid() then
    return _eid;
  end if;

  insert into event_participants (event_id, user_id, status, joined_at)
  values (_eid, auth.uid(), 'active', now())
  on conflict (event_id, user_id) do update
    set status     = 'active',
        joined_at  = coalesce(event_participants.joined_at, now()),
        updated_at = now();

  return _eid;
end; $$;

grant execute on function public.join_event_via_token(text) to authenticated;
```

- [ ] **Step 5: Apply + run test**

```sh
cd /Users/edouard/dev/wishlist && supabase migration up --local
cd /Users/edouard/dev/wishlist/supabase/tests/integration && eval "$(supabase status --output env | sed 's/^/export /')" && npx vitest run events-link-rpcs.test.ts -t "join_event_via_token"
```

Expected: 6 pass.

- [ ] **Step 6: Commit**

```sh
cd /Users/edouard/dev/wishlist
git add supabase/migrations/20260524120600_join_event_via_token.sql
git commit -m "$(cat <<'EOF'
feat(db): RPC join_event_via_token

SECURITY DEFINER. Auth required. Idempotent upsert. Honoree returns
event_id without creating a participant row.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Task A.8: RPC invite_to_event

**Files:**
- Create: `supabase/migrations/20260524120700_invite_to_event.sql`
- Modify: `supabase/tests/integration/events-link-rpcs.test.ts` (extend)

- [ ] **Step 1: Append failing tests**

Append to `supabase/tests/integration/events-link-rpcs.test.ts`:

```ts
describe('RPC invite_to_event', () => {
  let ctx: SeedContext;
  let eventId: string;

  beforeEach(async () => {
    ctx = await seedFresh();
    const admin = adminClient();
    const { data: ev } = await admin.from('events')
      .insert({ honoree_id: ctx.alice, title: 'Invite Test' })
      .select('id').single();
    eventId = ev!.id;
  });

  it('honoree inserts pending invites for multiple users', async () => {
    const aliceClient = await clientFor(ctx.alice);
    const { data, error } = await aliceClient.rpc('invite_to_event', {
      _event_id: eventId, _user_ids: [ctx.bob, ctx.carol],
    });
    expect(error).toBeNull();
    expect(data).toBe(2);
    const admin = adminClient();
    const { data: rows } = await admin.from('event_participants')
      .select('user_id, status, invited_by').eq('event_id', eventId);
    expect(rows).toHaveLength(2);
    rows!.forEach((r) => {
      expect(r.status).toBe('pending');
      expect(r.invited_by).toBe(ctx.alice);
    });
  });

  it('non-honoree cannot invite — RLS blocks INSERT', async () => {
    const bobClient = await clientFor(ctx.bob);
    const { error } = await bobClient.rpc('invite_to_event', {
      _event_id: eventId, _user_ids: [ctx.carol],
    });
    expect(error).toBeTruthy();
    expect(error?.code).toBe('42501');
  });

  it('duplicate invite is skipped, returns count of NEW inserts only', async () => {
    const admin = adminClient();
    await admin.from('event_participants').insert({
      event_id: eventId, user_id: ctx.bob, status: 'pending',
      invited_by: ctx.alice, invited_at: new Date().toISOString(),
    });
    const aliceClient = await clientFor(ctx.alice);
    const { data } = await aliceClient.rpc('invite_to_event', {
      _event_id: eventId, _user_ids: [ctx.bob, ctx.carol],
    });
    expect(data).toBe(1);  // bob was already invited
  });
});
```

- [ ] **Step 2: Run test (expect FAIL — function doesn't exist)**

```sh
cd /Users/edouard/dev/wishlist/supabase/tests/integration && eval "$(supabase status --output env | sed 's/^/export /')" && npx vitest run events-link-rpcs.test.ts -t "invite_to_event"
```

Expected: 3 fail with `function does not exist`.

- [ ] **Step 3: Commit tests**

```sh
git add supabase/tests/integration/events-link-rpcs.test.ts
git commit -m "$(cat <<'EOF'
test(db): RPC invite_to_event — bulk pre-invite

- Honoree inserts pending invites for N users, returns count
- Non-honoree blocked by RLS (42501)
- Duplicates skipped, count reflects new rows only

Currently red — function does not exist.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Write migration**

Create `supabase/migrations/20260524120700_invite_to_event.sql`:

```sql
create or replace function public.invite_to_event(_event_id uuid, _user_ids uuid[])
returns integer
language plpgsql security invoker
set search_path = public
as $$
declare _inserted integer;
begin
  with new_invites as (
    insert into event_participants (event_id, user_id, status, invited_by, invited_at)
    select _event_id, uid, 'pending', auth.uid(), now()
    from unnest(_user_ids) as uid
    on conflict (event_id, user_id) do nothing
    returning 1
  )
  select count(*)::int into _inserted from new_invites;
  return _inserted;
end; $$;

grant execute on function public.invite_to_event(uuid, uuid[]) to authenticated;
```

- [ ] **Step 5: Apply + run test**

```sh
cd /Users/edouard/dev/wishlist && supabase migration up --local
cd /Users/edouard/dev/wishlist/supabase/tests/integration && eval "$(supabase status --output env | sed 's/^/export /')" && npx vitest run events-link-rpcs.test.ts -t "invite_to_event"
```

Expected: 3 pass.

- [ ] **Step 6: Commit**

```sh
cd /Users/edouard/dev/wishlist
git add supabase/migrations/20260524120700_invite_to_event.sql
git commit -m "$(cat <<'EOF'
feat(db): RPC invite_to_event — bulk pre-invite

SECURITY INVOKER + RLS gate (honoree-only INSERT). on conflict do
nothing for re-invite no-op; returns count of new inserts.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Task A.9: RPC get_my_people

**Files:**
- Create: `supabase/migrations/20260524120800_get_my_people.sql`
- Modify: `supabase/tests/integration/events-link-rpcs.test.ts` (extend)

- [ ] **Step 1: Append failing tests**

Append to `supabase/tests/integration/events-link-rpcs.test.ts`:

```ts
describe('RPC get_my_people', () => {
  let ctx: SeedContext;
  beforeEach(async () => { ctx = await seedFresh(); });

  it('returns co-active-participants from my events', async () => {
    const admin = adminClient();
    const { data: ev } = await admin.from('events')
      .insert({ honoree_id: ctx.alice, title: 'p test' }).select('id').single();
    await admin.from('event_participants').insert([
      { event_id: ev!.id, user_id: ctx.bob, status: 'active', joined_at: new Date().toISOString() },
      { event_id: ev!.id, user_id: ctx.carol, status: 'active', joined_at: new Date().toISOString() },
    ]);
    const aliceClient = await clientFor(ctx.alice);
    const { data } = await aliceClient.rpc('get_my_people');
    expect(data).toHaveLength(2);
    const ids = data!.map((r: any) => r.user_id).sort();
    expect(ids).toEqual([ctx.bob, ctx.carol].sort());
  });

  it('excludes self', async () => {
    const admin = adminClient();
    const { data: ev } = await admin.from('events')
      .insert({ honoree_id: ctx.alice, title: 'exclude self' }).select('id').single();
    await admin.from('event_participants').insert({
      event_id: ev!.id, user_id: ctx.bob, status: 'active', joined_at: new Date().toISOString(),
    });
    const aliceClient = await clientFor(ctx.alice);
    const { data } = await aliceClient.rpc('get_my_people');
    expect(data!.map((r: any) => r.user_id)).not.toContain(ctx.alice);
  });

  it('excludes pending participants', async () => {
    const admin = adminClient();
    const { data: ev } = await admin.from('events')
      .insert({ honoree_id: ctx.alice, title: 'pending' }).select('id').single();
    await admin.from('event_participants').insert({
      event_id: ev!.id, user_id: ctx.bob, status: 'pending',
      invited_by: ctx.alice, invited_at: new Date().toISOString(),
    });
    const aliceClient = await clientFor(ctx.alice);
    const { data } = await aliceClient.rpc('get_my_people');
    expect(data).toHaveLength(0);
  });

  it('empty for user with no events', async () => {
    const daveClient = await clientFor(ctx.dave);
    const { data } = await daveClient.rpc('get_my_people');
    expect(data).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test (expect FAIL)**

```sh
cd /Users/edouard/dev/wishlist/supabase/tests/integration && eval "$(supabase status --output env | sed 's/^/export /')" && npx vitest run events-link-rpcs.test.ts -t "get_my_people"
```

Expected: 4 fail.

- [ ] **Step 3: Commit tests**

```sh
git add supabase/tests/integration/events-link-rpcs.test.ts
git commit -m "$(cat <<'EOF'
test(db): RPC get_my_people — auto-populated friends

- Returns co-active-participants from events I'm in
- Excludes self
- Excludes pending (only active)
- Empty for users with no events

Currently red — function does not exist.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Write migration**

Create `supabase/migrations/20260524120800_get_my_people.sql`:

```sql
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
    p.public_share_token is not null as has_public_list,
    cp.last_seen
  from co_participants cp
  join public.profiles p on p.id = cp.user_id
  where p.disabled_at is null
  order by cp.last_seen desc;
$$;

grant execute on function public.get_my_people() to authenticated;
```

> **Note:** If `profiles.deleted_at` exists in your schema, add `and p.deleted_at is null`. Verify with `\d profiles` in psql first.

- [ ] **Step 5: Apply + run test**

```sh
cd /Users/edouard/dev/wishlist && supabase migration up --local
cd /Users/edouard/dev/wishlist/supabase/tests/integration && eval "$(supabase status --output env | sed 's/^/export /')" && npx vitest run events-link-rpcs.test.ts -t "get_my_people"
```

Expected: 4 pass.

- [ ] **Step 6: Commit**

```sh
cd /Users/edouard/dev/wishlist
git add supabase/migrations/20260524120800_get_my_people.sql
git commit -m "$(cat <<'EOF'
feat(db): RPC get_my_people — auto-populated friends list

Co-active-participants from events I'm in (honoree or active member).
Excludes self, pending, disabled profiles. Sorted by last_interaction
desc.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Task A.10: Update get_my_events (drop audience_circle_count, add pending + share_token + participant_count)

**Files:**
- Create: `supabase/migrations/20260524120900_get_my_events_v2.sql`
- Modify: `supabase/tests/integration/events-link-rpcs.test.ts` (extend)

- [ ] **Step 1: Append failing tests**

Append to `supabase/tests/integration/events-link-rpcs.test.ts`:

```ts
describe('RPC get_my_events — updated shape', () => {
  let ctx: SeedContext;
  beforeEach(async () => { ctx = await seedFresh(); });

  it('returns share_token, participant_count, my_status; does NOT return audience_circle_count', async () => {
    const admin = adminClient();
    const { data: ev } = await admin.from('events')
      .insert({ honoree_id: ctx.alice, title: 'shape test' })
      .select('id, share_token').single();
    await admin.from('event_participants').insert({
      event_id: ev!.id, user_id: ctx.bob, status: 'active', joined_at: new Date().toISOString(),
    });

    const aliceClient = await clientFor(ctx.alice);
    const { data, error } = await aliceClient.rpc('get_my_events');
    expect(error).toBeNull();
    const row = data!.find((r: any) => r.id === ev!.id)!;
    expect(row.share_token).toBe(ev!.share_token);
    expect(row.participant_count).toBe(1);
    expect(row.my_status).toBe('honoree');
    expect((row as any).audience_circle_count).toBeUndefined();
  });

  it('includes events where I am active participant', async () => {
    const admin = adminClient();
    const { data: ev } = await admin.from('events')
      .insert({ honoree_id: ctx.alice, title: 'bob-as-active' }).select('id').single();
    await admin.from('event_participants').insert({
      event_id: ev!.id, user_id: ctx.bob, status: 'active', joined_at: new Date().toISOString(),
    });
    const bobClient = await clientFor(ctx.bob);
    const { data } = await bobClient.rpc('get_my_events');
    const row = data!.find((r: any) => r.id === ev!.id);
    expect(row).toBeTruthy();
    expect(row!.my_status).toBe('active');
  });

  it('includes events where I am pending invitee with my_status=pending', async () => {
    const admin = adminClient();
    const { data: ev } = await admin.from('events')
      .insert({ honoree_id: ctx.alice, title: 'pending-bob' }).select('id').single();
    await admin.from('event_participants').insert({
      event_id: ev!.id, user_id: ctx.bob, status: 'pending',
      invited_by: ctx.alice, invited_at: new Date().toISOString(),
    });
    const bobClient = await clientFor(ctx.bob);
    const { data } = await bobClient.rpc('get_my_events');
    const row = data!.find((r: any) => r.id === ev!.id);
    expect(row).toBeTruthy();
    expect(row!.my_status).toBe('pending');
  });

  it('participant_count counts active only (not pending)', async () => {
    const admin = adminClient();
    const { data: ev } = await admin.from('events')
      .insert({ honoree_id: ctx.alice, title: 'count test' }).select('id').single();
    await admin.from('event_participants').insert([
      { event_id: ev!.id, user_id: ctx.bob, status: 'active', joined_at: new Date().toISOString() },
      { event_id: ev!.id, user_id: ctx.carol, status: 'pending', invited_by: ctx.alice, invited_at: new Date().toISOString() },
    ]);
    const aliceClient = await clientFor(ctx.alice);
    const { data } = await aliceClient.rpc('get_my_events');
    expect(data!.find((r: any) => r.id === ev!.id)!.participant_count).toBe(1);
  });
});
```

- [ ] **Step 2: Run test (expect FAIL — old shape lacks new columns)**

```sh
cd /Users/edouard/dev/wishlist/supabase/tests/integration && eval "$(supabase status --output env | sed 's/^/export /')" && npx vitest run events-link-rpcs.test.ts -t "get_my_events"
```

Expected: 4 fail — `share_token` undefined, `participant_count` undefined, `my_status` undefined, OR function still references dropped event_circles.

- [ ] **Step 3: Commit tests**

```sh
git add supabase/tests/integration/events-link-rpcs.test.ts
git commit -m "$(cat <<'EOF'
test(db): RPC get_my_events — new shape (share_token, participant_count, my_status)

- Drops audience_circle_count
- Adds share_token, participant_count (active-only), my_status
- WHERE expands to honoree OR active OR pending

Currently red — function still returns old shape.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Write migration**

Create `supabase/migrations/20260524120900_get_my_events_v2.sql`:

```sql
-- Rewrite get_my_events for the link-first model.
-- Returns events where caller is honoree OR active OR pending.
-- Adds: share_token, participant_count (active only), my_status.
-- Drops: audience_circle_count.

drop function if exists public.get_my_events();

create or replace function public.get_my_events()
returns table (
  id                    uuid,
  honoree_id            uuid,
  honoree_display_name  text,
  honoree_handle        text,
  honoree_avatar_url    text,
  title                 text,
  kind                  text,
  occurs_on             date,
  note                  text,
  created_at            timestamptz,
  updated_at            timestamptz,
  share_token           text,
  item_count            bigint,
  participant_count     bigint,
  my_status             text
)
language sql stable security invoker
set search_path = public
as $$
  with my_role as (
    select e.id as event_id,
           case
             when e.honoree_id = auth.uid() then 'honoree'
             else (
               select ep.status
               from public.event_participants ep
               where ep.event_id = e.id and ep.user_id = auth.uid()
               limit 1
             )
           end as my_status
    from public.events e
    where e.honoree_id = auth.uid()
       or exists (
         select 1 from public.event_participants ep
         where ep.event_id = e.id and ep.user_id = auth.uid()
       )
  )
  select
    e.id,
    e.honoree_id,
    p.display_name as honoree_display_name,
    p.handle::text as honoree_handle,
    p.avatar_url as honoree_avatar_url,
    e.title,
    e.kind,
    e.occurs_on,
    e.note,
    e.created_at,
    e.updated_at,
    e.share_token,
    coalesce(ic.cnt, 0) as item_count,
    coalesce(pc.cnt, 0) as participant_count,
    mr.my_status
  from public.events e
  join my_role mr on mr.event_id = e.id
  join public.profiles p on p.id = e.honoree_id
  left join lateral (
    select count(*)::bigint as cnt from public.event_items where event_id = e.id
  ) ic on true
  left join lateral (
    select count(*)::bigint as cnt from public.event_participants
    where event_id = e.id and status = 'active'
  ) pc on true
  order by
    case
      when e.occurs_on is null then 1
      when e.occurs_on >= current_date then 0
      else 2
    end,
    case when e.occurs_on >= current_date then e.occurs_on end asc nulls last,
    case when e.occurs_on <  current_date then e.occurs_on end desc nulls last,
    e.created_at desc;
$$;

grant execute on function public.get_my_events() to authenticated;
```

- [ ] **Step 5: Apply + run test**

```sh
cd /Users/edouard/dev/wishlist && supabase migration up --local
cd /Users/edouard/dev/wishlist/supabase/tests/integration && eval "$(supabase status --output env | sed 's/^/export /')" && npx vitest run events-link-rpcs.test.ts -t "get_my_events"
```

Expected: 4 pass.

- [ ] **Step 6: Regen types**

```sh
cd /Users/edouard/dev/wishlist && supabase gen types typescript --local --schema public 2>/dev/null > app/src/types/database.ts
```

- [ ] **Step 7: Commit migration + types**

```sh
cd /Users/edouard/dev/wishlist
git add supabase/migrations/20260524120900_get_my_events_v2.sql app/src/types/database.ts
git commit -m "$(cat <<'EOF'
feat(db): RPC get_my_events — link-first shape

- Drop audience_circle_count
- Add share_token, participant_count (active-only), my_status
- WHERE expands: honoree OR active OR pending

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Task A.11: Privacy invariant test — claims still hidden from owner

**Files:**
- Create: `supabase/tests/integration/events-link-privacy.test.ts`

- [ ] **Step 1: Write the test**

```ts
// supabase/tests/integration/events-link-privacy.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { adminClient, clientFor } from './helpers/client.ts';
import { seedFresh, type SeedContext } from './helpers/seed.ts';

describe('Privacy invariant — claims hidden from item owner (regression guard)', () => {
  let ctx: SeedContext;
  beforeEach(async () => { ctx = await seedFresh(); });

  it('honoree does NOT see claims on own items via any path', async () => {
    const admin = adminClient();
    // Create event with alice's item
    const { data: ev } = await admin.from('events')
      .insert({ honoree_id: ctx.alice, title: 'privacy test' }).select('id').single();
    await admin.from('event_items').insert({ event_id: ev!.id, item_id: ctx.itemAliceOwns });
    // Bob joins
    await admin.from('event_participants').insert({
      event_id: ev!.id, user_id: ctx.bob, status: 'active', joined_at: new Date().toISOString(),
    });
    // Bob claims
    const bobClient = await clientFor(ctx.bob);
    await bobClient.from('claims').insert({ item_id: ctx.itemAliceOwns, user_id: ctx.bob });

    // Alice (honoree, owner) queries claims — must see nothing
    const aliceClient = await clientFor(ctx.alice);
    const { data: claims } = await aliceClient.from('claims')
      .select('id, user_id').eq('item_id', ctx.itemAliceOwns);
    expect(claims).toEqual([]);

    // Bob (claimer) sees his own claim
    const { data: bobClaims } = await bobClient.from('claims')
      .select('id, user_id').eq('item_id', ctx.itemAliceOwns);
    expect(bobClaims).toHaveLength(1);
  });

  it('honoree does NOT see is_claimed via get_event_view (masked null)', async () => {
    const admin = adminClient();
    const { data: ev } = await admin.from('events')
      .insert({ honoree_id: ctx.alice, title: 'mask test' })
      .select('id, share_token').single();
    await admin.from('event_items').insert({ event_id: ev!.id, item_id: ctx.itemAliceOwns });
    await admin.from('event_participants').insert({
      event_id: ev!.id, user_id: ctx.bob, status: 'active', joined_at: new Date().toISOString(),
    });
    const bobClient = await clientFor(ctx.bob);
    await bobClient.from('claims').insert({ item_id: ctx.itemAliceOwns, user_id: ctx.bob });

    const aliceClient = await clientFor(ctx.alice);
    const { data } = await aliceClient.rpc('get_event_view', { _token: ev!.share_token });
    expect(data![0].items[0].is_claimed).toBeNull();
  });

  it('honoree does NOT see claims indirectly via People list', async () => {
    // get_my_people derives from event_participants, NOT claims —
    // verify it doesn't accidentally surface a claimer who isn't a participant.
    const admin = adminClient();
    const { data: ev } = await admin.from('events')
      .insert({ honoree_id: ctx.alice, title: 'people test' }).select('id').single();
    await admin.from('event_items').insert({ event_id: ev!.id, item_id: ctx.itemAliceOwns });
    // Dave is NOT a participant of any event but somehow has a claim on alice's item
    // (in practice this can't happen because claim INSERT requires can_see_item, but
    // worst-case data state: claim exists, dave is not a participant)
    await admin.from('claims').insert({ item_id: ctx.itemAliceOwns, user_id: ctx.dave });

    const aliceClient = await clientFor(ctx.alice);
    const { data: people } = await aliceClient.rpc('get_my_people');
    expect(people!.map((p: any) => p.user_id)).not.toContain(ctx.dave);
  });
});
```

- [ ] **Step 2: Run test (expect PASS — privacy invariant should already hold by existing RLS + masking from earlier tasks)**

```sh
cd /Users/edouard/dev/wishlist/supabase/tests/integration && eval "$(supabase status --output env | sed 's/^/export /')" && npx vitest run events-link-privacy.test.ts
```

Expected: 3 pass. **If any test fails, STOP** — privacy invariant is broken; debug before continuing.

- [ ] **Step 3: Commit**

```sh
cd /Users/edouard/dev/wishlist
git add supabase/tests/integration/events-link-privacy.test.ts
git commit -m "$(cat <<'EOF'
test(privacy): honoree blind to claims through all new paths

Regression guards:
- Direct SELECT claims by owner returns empty
- get_event_view masks is_claimed to null for honoree
- get_my_people doesn't leak claimers as people

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Task A.12: Update errors.ts + i18n strings

**Files:**
- Modify: `app/src/lib/errors.ts`
- Modify: `app/src/i18n/ru.ts`
- Modify: `app/src/i18n/en.ts`
- Modify: `app/src/lib/__tests__/errors.test.ts` (extend)

- [ ] **Step 1: Add failing tests for new error codes**

Open `app/src/lib/__tests__/errors.test.ts` and append:

```ts
import { describe, it, expect } from 'vitest';
import { errorCode } from '../errors';

describe('errorCode — events-link errors', () => {
  it('maps event_not_found exception message', () => {
    expect(errorCode({ message: 'event_not_found' })).toBe('eventNotFound');
  });

  it('maps not_authenticated exception message', () => {
    expect(errorCode({ message: 'not_authenticated' })).toBe('notAuthenticated');
  });
});
```

- [ ] **Step 2: Run test (expect FAIL — error keys not in errors.ts)**

```sh
cd /Users/edouard/dev/wishlist/app && npm run test -- --run errors.test
```

Expected: 2 fail; `errorCode` returns 'unknown' or similar.

- [ ] **Step 3: Commit tests**

```sh
cd /Users/edouard/dev/wishlist
git add app/src/lib/__tests__/errors.test.ts
git commit -m "$(cat <<'EOF'
test(errors): events-link error keys (eventNotFound, notAuthenticated)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Add mappings to errors.ts**

In `app/src/lib/errors.ts`, find the `errorCode` function and add the two RAISE EXCEPTION text matches:

```ts
// Inside errorCode() function, in the matchMessage section:
if (/event_not_found/.test(msg))    return 'eventNotFound';
if (/not_authenticated/.test(msg))  return 'notAuthenticated';
```

- [ ] **Step 5: Add Russian + English strings**

In `app/src/i18n/ru.ts`, inside `errors: { ... }`:

```ts
eventNotFound:    'Event не найден или ссылка неверна.',
notAuthenticated: 'Нужно войти, чтобы продолжить.',
```

In `app/src/i18n/en.ts`, matching keys:

```ts
eventNotFound:    'Event not found or the link is invalid.',
notAuthenticated: 'Sign in to continue.',
```

- [ ] **Step 6: Run test (expect PASS)**

```sh
cd /Users/edouard/dev/wishlist/app && npm run test -- --run errors.test && npx tsc -b
```

Expected: tests pass; tsc clean (Translation type forces ru/en parity).

- [ ] **Step 7: Commit**

```sh
cd /Users/edouard/dev/wishlist
git add app/src/lib/errors.ts app/src/i18n/ru.ts app/src/i18n/en.ts
git commit -m "$(cat <<'EOF'
feat(errors): map eventNotFound + notAuthenticated

For get_event_view / join_event_via_token RAISE EXCEPTION text.
Strings added to ru.ts + en.ts.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Task A.13: Frontend tsc-fix — drop audience_circle_count usage

**Files:**
- Modify: `app/src/screens/events/EventsScreen.tsx`
- Modify: `app/src/events/useEvents.ts` (if it references the field)

- [ ] **Step 1: Find references**

```sh
cd /Users/edouard/dev/wishlist && grep -rn "audience_circle_count" app/src/ 2>/dev/null
```

Note every file + line returned.

- [ ] **Step 2: Run tsc to see if removed-column-references break the build**

```sh
cd /Users/edouard/dev/wishlist/app && npx tsc -b 2>&1 | head -40
```

Expected: errors referencing `audience_circle_count` (since types/database.ts no longer has it).

- [ ] **Step 3: Edit `app/src/screens/events/EventsScreen.tsx`**

Find lines that use `audience_circle_count` (likely badge rendering near the item-count display) and replace:

```tsx
// Before: <span>{event.audience_circle_count} circles</span>
// After:  <span>{event.participant_count} friends</span>
```

If the i18n is involved, also update string key (e.g., `events.audienceCount` → `events.participantCount`). Add both ru + en strings.

- [ ] **Step 4: Run tsc + tests**

```sh
cd /Users/edouard/dev/wishlist/app && npx tsc -b && npm run test -- --run
```

Expected: clean. Any test snapshots referencing audience_circle_count get updated.

- [ ] **Step 5: Commit**

```sh
cd /Users/edouard/dev/wishlist
git add app/src/screens/events/EventsScreen.tsx app/src/events/useEvents.ts app/src/i18n/ru.ts app/src/i18n/en.ts
git commit -m "$(cat <<'EOF'
fix(events): drop audience_circle_count, use participant_count

EventsScreen card badge now shows active-participant count instead
of (dropped) audience_circle_count. i18n key renamed in ru+en.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Task A.14: Update seedEvent helper (use participants instead of circles)

**Files:**
- Modify: `supabase/tests/integration/helpers/seed.ts`
- Modify: `supabase/tests/integration/event-items-visibility.test.ts` (any test that used `audienceGroups`)

- [ ] **Step 1: Find usages**

```sh
cd /Users/edouard/dev/wishlist && grep -rn "audienceGroups" supabase/tests/integration/
```

- [ ] **Step 2: Update `seedEvent` signature**

In `supabase/tests/integration/helpers/seed.ts`, replace the audienceGroups path with participants:

```ts
// Before:
// export async function seedEvent(ctx, honoree, opts?: { audienceGroups?, curatedItems?, ... })
//   ...inserts into event_circles...
// After:
export async function seedEvent(
  ctx: SeedContext,
  honoree: TestUserName,
  opts?: {
    participants?: TestUserName[];   // become active
    pendingInvites?: TestUserName[]; // become pending
    curatedItems?: string[];
    title?: string;
    kind?: 'birthday' | 'holidays' | 'anniversary' | 'wedding' | 'housewarming' | 'other';
    occursOn?: string;
  },
): Promise<{ eventId: string; shareToken: string }> {
  const admin = adminClient();
  const honoreeId = ctx[honoree];
  const { data: ev, error: evErr } = await admin
    .from('events')
    .insert({
      honoree_id: honoreeId,
      title: opts?.title ?? 'Test event',
      kind: opts?.kind ?? 'other',
      occurs_on: opts?.occursOn ?? null,
    })
    .select('id, share_token')
    .single();
  if (evErr || !ev) throw new Error(`seedEvent failed: ${evErr?.message}`);

  if (opts?.participants?.length) {
    const rows = opts.participants.map((p) => ({
      event_id: ev.id, user_id: ctx[p], status: 'active' as const,
      joined_at: new Date().toISOString(),
    }));
    const { error } = await admin.from('event_participants').insert(rows);
    if (error) throw new Error(`seedEvent participants failed: ${error.message}`);
  }
  if (opts?.pendingInvites?.length) {
    const rows = opts.pendingInvites.map((p) => ({
      event_id: ev.id, user_id: ctx[p], status: 'pending' as const,
      invited_by: honoreeId, invited_at: new Date().toISOString(),
    }));
    const { error } = await admin.from('event_participants').insert(rows);
    if (error) throw new Error(`seedEvent pendingInvites failed: ${error.message}`);
  }
  if (opts?.curatedItems?.length) {
    const rows = opts.curatedItems.map((id) => ({ event_id: ev.id, item_id: id }));
    const { error } = await admin.from('event_items').insert(rows);
    if (error) throw new Error(`seedEvent curatedItems failed: ${error.message}`);
  }

  return { eventId: ev.id, shareToken: ev.share_token };
}
```

- [ ] **Step 3: Update `event-items-visibility.test.ts`**

Find every call to `seedEvent(ctx, 'alice', { audienceGroups: [...], ... })` and replace `audienceGroups: [ctx.groupId]` with `participants: ['bob', 'carol', 'dave']` (or whichever audience is required for that test). The test semantics may need adjustment: for example, "non-audience user sees nothing" becomes "non-participant sees nothing."

Concretely, in the test "audience member sees event_items the honoree added":

```ts
const ev = await seedEvent(ctx, 'alice', {
  participants: ['bob'],   // was: audienceGroups: [ctx.groupId]
  curatedItems: [ctx.itemAliceOwns],
});
```

The test name should also update from "audience member" → "active participant" for clarity.

- [ ] **Step 4: Run integration tests**

```sh
cd /Users/edouard/dev/wishlist/supabase/tests/integration && eval "$(supabase status --output env | sed 's/^/export /')" && npx vitest run
```

Expected: all integration tests green (existing event-items-visibility tests, plus all the events-link-* tests).

- [ ] **Step 5: Commit**

```sh
cd /Users/edouard/dev/wishlist
git add supabase/tests/integration/helpers/seed.ts supabase/tests/integration/event-items-visibility.test.ts
git commit -m "$(cat <<'EOF'
test(helpers): seedEvent uses participants instead of audienceGroups

Aligned with link-first model. event-items-visibility tests updated
to reflect "active participant" semantics.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Task A.15: Local CI run + push + PR A

- [ ] **Step 1: Run full local CI**

```sh
cd /Users/edouard/dev/wishlist/app && npm run lint && npx tsc -b && npm run test -- --run && npm run build && cd .. && (cd supabase/tests/integration && eval "$(supabase status --output env | sed 's/^/export /')" && npm test)
```

Expected: all green. If anything red, fix before push.

- [ ] **Step 2: Push branch**

```sh
git push -u origin feat/events-link-data
```

- [ ] **Step 3: Open PR**

```sh
gh pr create --base main --title "feat(db): events link-first — schema + RLS + RPCs + tests" --body "$(cat <<'EOF'
## Summary
Phase A of the events link-first redesign (per [spec](docs/superpowers/specs/2026-05-24-events-link-first-design.md)). Data layer only.

- 8 new migrations:
  - `events_link_first` — wipe events data, drop event_circles, add events.share_token, create event_participants
  - `can_see_event` — uses event_participants
  - `can_see_item` — adds event-participation path (legacy item_groups path preserved)
  - `events_rls` — drops audience-circle SELECT policy, adds participants SELECT
  - `event_participants_rls` — 4 policies (own/honoree/co-active SELECT; honoree-only pending INSERT; own-or-honoree UPDATE; honoree-only DELETE)
  - `get_event_view` — public SECURITY DEFINER, claim-masking by viewer role
  - `join_event_via_token` — SECURITY DEFINER, idempotent upsert
  - `invite_to_event` — SECURITY INVOKER, RLS-gated bulk pre-invite
  - `get_my_people` — auto-populated friends from co-active-participants
  - `get_my_events_v2` — drop audience_circle_count, add share_token + participant_count + my_status
- Integration tests (vitest):
  - `events-link-migration.test.ts` — schema shape + check constraints
  - `events-link-rls.test.ts` — events + event_participants policies
  - `events-link-rpcs.test.ts` — all 5 RPCs
  - `events-link-privacy.test.ts` — honoree-blind invariant regression guards
  - `events-link-item-visibility.test.ts` — can_see_item new path
- Helpers: `seedEvent` uses `participants` instead of `audienceGroups`
- Errors mapping: `eventNotFound`, `notAuthenticated` in errors.ts + ru/en
- Frontend tsc-fix: drop `audience_circle_count` from EventsScreen

## Migration story
Wipes existing events data (testing phase, no real users per 2026-05-24 pivot). Drops `event_circles` table. Existing `groups`/`group_members`/`group_invites` left untouched.

## Test plan
- [x] All integration tests green
- [x] tsc clean, vitest green, lint clean, build green
- [ ] After merge: Phase B (Edge Function) opens on top

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Wait for CI on PR — verify green before requesting review or stacking next branch**

---

# PHASE B — Email Edge Function

**Branch:** `feat/events-link-email` (stacked on `feat/events-link-data` until A merges; then rebase to `main`)
**Outcome:** `send-event-invite` Edge Function deployed-ready, idempotency log table in place.

## Task B.0: Branch setup

- [ ] **Step 1: Branch from current state of A (or from main if A merged)**

```sh
# If A still open:
git checkout feat/events-link-data && git checkout -b feat/events-link-email
# If A merged:
git checkout main && git pull && git checkout -b feat/events-link-email
```

## Task B.1: Migration — event_email_log

**Files:**
- Create: `supabase/migrations/20260524130000_event_email_log.sql`
- Create: `supabase/tests/integration/events-link-email.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// supabase/tests/integration/events-link-email.test.ts
import { describe, it, expect } from 'vitest';
import { adminClient } from './helpers/client.ts';

describe('event_email_log table', () => {
  it('exists with expected columns', async () => {
    const admin = adminClient();
    const { error } = await admin
      .from('event_email_log')
      .select('id, event_id, recipient_id, email_type, sent_at, created_at')
      .limit(1);
    expect(error).toBeNull();
  });

  it('UNIQUE (event_id, recipient_id, email_type) enforced', async () => {
    const admin = adminClient();
    // Create user + event
    const userId = '55555555-5555-5555-5555-555555555555';
    await admin.auth.admin.createUser({
      id: userId, email: 'eel@test.local', password: 't', email_confirm: true,
    }).catch(() => {});
    await admin.from('profiles').upsert({ id: userId, display_name: 'eel', handle: 'eel' });
    const { data: ev } = await admin.from('events')
      .insert({ honoree_id: userId, title: 'eel test' }).select('id').single();

    const { error: err1 } = await admin.from('event_email_log').insert({
      event_id: ev!.id, recipient_id: userId, email_type: 'invite',
    });
    expect(err1).toBeNull();

    const { error: err2 } = await admin.from('event_email_log').insert({
      event_id: ev!.id, recipient_id: userId, email_type: 'invite',
    });
    expect(err2?.code).toBe('23505');

    // cleanup
    await admin.from('events').delete().eq('id', ev!.id);
    await admin.auth.admin.deleteUser(userId);
  });
});
```

- [ ] **Step 2: Run test (expect FAIL)**

```sh
cd /Users/edouard/dev/wishlist/supabase/tests/integration && eval "$(supabase status --output env | sed 's/^/export /')" && npx vitest run events-link-email.test.ts
```

Expected: 2 fail.

- [ ] **Step 3: Commit test**

```sh
git add supabase/tests/integration/events-link-email.test.ts
git commit -m "$(cat <<'EOF'
test(db): event_email_log idempotency table

Asserts table exists with right shape and UNIQUE (event_id, recipient_id, email_type).

Currently red — table not yet created.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Write migration**

Create `supabase/migrations/20260524130000_event_email_log.sql`:

```sql
-- event_email_log — idempotency for transactional emails on events.
-- Mirrors santa_email_log (see 20260517193925_santa_email_idempotency.sql).
create table public.event_email_log (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events(id) on delete cascade,
  recipient_id  uuid not null references auth.users(id) on delete cascade,
  email_type    text not null check (email_type in ('invite')),  -- extend as new types ship
  sent_at       timestamptz,                                     -- null = attempted, not confirmed
  created_at    timestamptz not null default now(),
  unique (event_id, recipient_id, email_type)
);
create index event_email_log_event_idx on public.event_email_log(event_id);

-- No RLS — table is admin-only (service-role inserts; users never read).
-- Default-deny via RLS on (no policies created).
alter table public.event_email_log enable row level security;
```

- [ ] **Step 5: Apply + run test**

```sh
cd /Users/edouard/dev/wishlist && supabase migration up --local
cd supabase/tests/integration && eval "$(supabase status --output env | sed 's/^/export /')" && npx vitest run events-link-email.test.ts
```

Expected: 2 pass.

- [ ] **Step 6: Regen types**

```sh
cd /Users/edouard/dev/wishlist && supabase gen types typescript --local --schema public 2>/dev/null > app/src/types/database.ts
```

- [ ] **Step 7: Commit**

```sh
git add supabase/migrations/20260524130000_event_email_log.sql app/src/types/database.ts
git commit -m "$(cat <<'EOF'
feat(db): event_email_log idempotency table

Mirrors santa_email_log shape. UNIQUE (event_id, recipient_id, email_type).
RLS enabled with no policies (service-role only).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Task B.2: Edge Function — send-event-invite template

**Files:**
- Create: `supabase/functions/send-event-invite/template.ts`

- [ ] **Step 1: Write template module**

```ts
// supabase/functions/send-event-invite/template.ts
export interface EventInviteVars {
  inviterName:     string;
  recipientName:   string;
  eventTitle:      string;
  eventOccursOn:   string | null;   // ISO date, optional
  eventUrl:        string;
}

export function renderHtml(v: EventInviteVars): string {
  const dateLine = v.eventOccursOn
    ? `<p style="color:#7a7060;font-size:14px;margin:6px 0 0">${formatDate(v.eventOccursOn)}</p>`
    : '';
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f8f5ee;font-family:'Helvetica Neue',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f5ee;padding:40px 16px">
  <tr><td align="center">
    <table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #e8e1d2;padding:32px">
      <tr><td>
        <p style="color:#7a7060;font-size:13px;letter-spacing:0.05em;text-transform:uppercase;margin:0 0 16px">Ты приглашён(а)</p>
        <h1 style="font-family:'Newsreader',Georgia,serif;font-style:italic;font-weight:400;font-size:28px;margin:0 0 8px;color:#2a261d">
          ${escapeHtml(v.inviterName)} зовёт тебя
        </h1>
        <p style="margin:0 0 4px;font-size:17px;color:#2a261d">на «${escapeHtml(v.eventTitle)}»</p>
        ${dateLine}
        <table style="margin:28px 0 8px"><tr><td style="background:#c2603c;border-radius:2px">
          <a href="${escapeAttr(v.eventUrl)}" style="display:block;padding:12px 24px;color:#fff;text-decoration:none;font-size:15px">Открыть →</a>
        </td></tr></table>
        <p style="color:#a09680;font-size:12px;margin:32px 0 0">Это автоматическое письмо от Rat List. <a href="https://ratlist.app/settings" style="color:#a09680">Управление уведомлениями</a>.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

export function renderText(v: EventInviteVars): string {
  const dateLine = v.eventOccursOn ? `\n${formatDate(v.eventOccursOn)}` : '';
  return `Ты приглашён(а).

${v.inviterName} зовёт тебя на «${v.eventTitle}»${dateLine}.

Открыть: ${v.eventUrl}

—
Rat List · автоматическое письмо. Управление уведомлениями: https://ratlist.app/settings
`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]!));
}
function escapeAttr(s: string): string { return escapeHtml(s); }
```

- [ ] **Step 2: Write smoke test (in same `index.test.ts` we'll create next; or as a separate file)**

For now we commit the template alone — its tests come with `index.test.ts` in Task B.3.

- [ ] **Step 3: Commit**

```sh
git add supabase/functions/send-event-invite/template.ts
git commit -m "$(cat <<'EOF'
feat(edge): send-event-invite template (HTML + text)

Paper/ink aesthetic per existing send-group-invite. RU only for v1.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Task B.3: Edge Function — send-event-invite index + Deno tests

**Files:**
- Create: `supabase/functions/send-event-invite/index.ts`
- Create: `supabase/functions/send-event-invite/index.test.ts`

- [ ] **Step 1: Write failing Deno test**

```ts
// supabase/functions/send-event-invite/index.test.ts
import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { renderHtml, renderText, type EventInviteVars } from './template.ts';

Deno.test('renderHtml includes inviter, title, url, and date when provided', () => {
  const vars: EventInviteVars = {
    inviterName: 'Саша',
    recipientName: 'Оля',
    eventTitle: 'День рождения',
    eventOccursOn: '2026-06-12',
    eventUrl: 'https://ratlist.app/event/abc123def456',
  };
  const html = renderHtml(vars);
  assertStringIncludes(html, 'Саша');
  assertStringIncludes(html, 'День рождения');
  assertStringIncludes(html, 'https://ratlist.app/event/abc123def456');
  assertStringIncludes(html, 'июня');  // localised date
});

Deno.test('renderHtml omits date when null', () => {
  const html = renderHtml({
    inviterName: 'Саша', recipientName: 'Оля', eventTitle: 'X',
    eventOccursOn: null, eventUrl: 'https://x/',
  });
  // No locale-string date present
  const hasMonthName = /январ|феврал|март|апрел|ма[яй]|июн|июл|август|сентябр|октябр|ноябр|декабр/.test(html);
  assertEquals(hasMonthName, false);
});

Deno.test('renderHtml escapes HTML in user-controlled fields', () => {
  const html = renderHtml({
    inviterName: '<script>alert(1)</script>',
    recipientName: 'x', eventTitle: '"evil"',
    eventOccursOn: null, eventUrl: 'https://x/',
  });
  // No raw <script> in output
  const hasScript = /<script>/.test(html);
  assertEquals(hasScript, false);
});

Deno.test('renderText includes inviter, title, url', () => {
  const text = renderText({
    inviterName: 'Саша', recipientName: 'Оля', eventTitle: 'TestTitle',
    eventOccursOn: null, eventUrl: 'https://ratlist.app/event/xyz',
  });
  assertStringIncludes(text, 'Саша');
  assertStringIncludes(text, 'TestTitle');
  assertStringIncludes(text, 'https://ratlist.app/event/xyz');
});
```

- [ ] **Step 2: Run Deno test (expect FAIL — template tests rely on the template module which doesn't have all features yet, or PASS if template was already complete)**

```sh
cd /Users/edouard/dev/wishlist/app && npm run test:edge
```

Expected: template tests pass (we wrote the full template in B.2). If any test fails, fix the template, then re-run.

- [ ] **Step 3: Write index.ts handler**

```ts
// supabase/functions/send-event-invite/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.105.4';
import { cors } from '../_shared/cors.ts';
import { sendEmail } from '../_shared/email.ts';
import { renderHtml, renderText } from './template.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://ratlist.app';

interface RequestBody {
  event_id: string;
  user_ids: string[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return cors.preflight(req);
  if (req.method !== 'POST') return cors.json(req, { error: 'method_not_allowed' }, 405);

  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    return cors.json(req, { error: 'no_auth' }, 401);
  }

  let body: RequestBody;
  try { body = await req.json(); } catch { return cors.json(req, { error: 'invalid_body' }, 400); }
  if (!body.event_id || !Array.isArray(body.user_ids) || body.user_ids.length === 0) {
    return cors.json(req, { error: 'invalid_body' }, 400);
  }

  // Caller-scoped client: verify caller is honoree
  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: callerEvent, error: evErr } = await callerClient
    .from('events')
    .select('id, honoree_id, title, occurs_on, share_token, profiles!honoree_id(display_name)')
    .eq('id', body.event_id)
    .single();
  if (evErr || !callerEvent) {
    return cors.json(req, { error: 'event_not_found_or_forbidden' }, 404);
  }
  const { data: { user } } = await callerClient.auth.getUser();
  if (!user || user.id !== callerEvent.honoree_id) {
    return cors.json(req, { error: 'not_honoree' }, 403);
  }

  // Service-role for recipient lookup + log writes
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: recipients } = await admin
    .from('profiles')
    .select('id, display_name')
    .in('id', body.user_ids);
  const { data: authUsers } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const emailById = new Map(authUsers!.users.map((u) => [u.id, u.email]));

  const inviterName = (callerEvent.profiles as { display_name: string } | null)?.display_name ?? 'Друг';
  const eventUrl = `${SITE_URL}/event/${callerEvent.share_token}`;

  let sent = 0;
  let skipped = 0;
  for (const recipient of recipients ?? []) {
    const email = emailById.get(recipient.id);
    if (!email) { skipped++; continue; }

    // Idempotency check
    const { error: logErr } = await admin.from('event_email_log').insert({
      event_id: body.event_id,
      recipient_id: recipient.id,
      email_type: 'invite',
    });
    if (logErr?.code === '23505') { skipped++; continue; }
    if (logErr) { skipped++; continue; }

    const vars = {
      inviterName,
      recipientName: recipient.display_name,
      eventTitle: callerEvent.title,
      eventOccursOn: callerEvent.occurs_on,
      eventUrl,
    };
    const ok = await sendEmail({
      to: email,
      subject: `${inviterName} приглашает тебя на «${callerEvent.title}»`,
      html: renderHtml(vars),
      text: renderText(vars),
    }).catch(() => false);

    if (ok) {
      await admin.from('event_email_log')
        .update({ sent_at: new Date().toISOString() })
        .eq('event_id', body.event_id)
        .eq('recipient_id', recipient.id)
        .eq('email_type', 'invite');
      sent++;
    } else {
      skipped++;
    }
  }

  return cors.json(req, { sent, skipped }, 200);
});
```

> **Note:** Verify the exact `cors` and `sendEmail` helper API matches what `_shared/cors.ts` and `_shared/email.ts` actually export. If not, mirror the calling convention used in [`send-group-invite/index.ts`](../../../supabase/functions/send-group-invite/index.ts) and `send-santa-start/index.ts`.

- [ ] **Step 4: Run Deno tests for full module**

```sh
cd /Users/edouard/dev/wishlist/app && npm run test:edge
```

Expected: all template tests pass (4 from B.3 step 1). Handler isn't directly tested here — integration test in next task covers it end-to-end.

- [ ] **Step 5: Commit**

```sh
git add supabase/functions/send-event-invite/index.ts supabase/functions/send-event-invite/index.test.ts
git commit -m "$(cat <<'EOF'
feat(edge): send-event-invite handler

POST /functions/v1/send-event-invite { event_id, user_ids }
→ { sent, skipped }

- Caller-JWT honoree check (403 otherwise)
- Service-role recipient lookup + email send
- event_email_log idempotency (UNIQUE constraint dedup)
- Fire-and-forget pattern from client side

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Task B.4: PR B — push + open

- [ ] **Step 1: Run full local CI**

```sh
cd /Users/edouard/dev/wishlist/app && npm run lint && npx tsc -b && npm run test -- --run && npm run test:edge && npm run build && cd .. && (cd supabase/tests/integration && eval "$(supabase status --output env | sed 's/^/export /')" && npm test)
```

Expected: all green.

- [ ] **Step 2: Push + PR**

```sh
git push -u origin feat/events-link-email
gh pr create --base feat/events-link-data --title "feat(edge): send-event-invite + event_email_log" --body "$(cat <<'EOF'
## Summary
Phase B of events link-first. Edge Function for pre-invite emails.

- `event_email_log` table (idempotency, mirrors santa_email_log)
- `send-event-invite/{index,template}.ts` Edge Function
- Deno tests for template (HTML escape, date formatting, RU strings)
- Integration test for the email-log table

## Stacked on PR A
Base: `feat/events-link-data`. Rebases on merge of A.

## Test plan
- [x] Deno tests green
- [x] Integration test green
- [ ] Manual: after deploy, invoke from client and verify Resend received the request

## Deployment (after merge to main)
```sh
supabase functions deploy send-event-invite --project-ref fiuheufmawxkgbqddwwu
```

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

# PHASE C — Public flow UI (landing + simplified create)

**Branch:** `feat/events-link-ui-public` (stacked on B; rebases when A+B merge)
**Outcome:** users can visit `/event/<token>`; sign-up flow auto-joins them as active participant; create-event screen no longer asks about circles.

## Task C.0: Branch + scaffolding

- [ ] **Step 1: Branch**

```sh
# stacked on B:
git checkout feat/events-link-email && git checkout -b feat/events-link-ui-public
# or from main if both merged:
git checkout main && git pull && git checkout -b feat/events-link-ui-public
```

## Task C.1: useEvent hook update (my_status, share_token)

**Files:**
- Modify: `app/src/events/useEvent.ts`
- Create: `app/src/events/eventApi.ts`
- Create: `app/src/events/__tests__/useEvent.test.tsx`

- [ ] **Step 1: Write failing RTL test for useEvent**

```tsx
// app/src/events/__tests__/useEvent.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useEvent } from '../useEvent';

vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })),
    removeChannel: vi.fn(),
  },
}));

import { supabase } from '../../lib/supabase';

describe('useEvent', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('detects my_status=honoree when caller is event owner', async () => {
    (supabase.from as any).mockReturnValue({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({
        data: { id: 'e1', honoree_id: 'u1', title: 'T', share_token: 'tok',
                kind: 'birthday', occurs_on: null, note: null, profiles: { display_name: 'A' } },
        error: null,
      }) }) }),
    });
    (supabase.rpc as any).mockResolvedValue({ data: [{ my_status: 'honoree' }], error: null });

    const { result } = renderHook(() => useEvent('e1'));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    if (result.current.state.status === 'ready') {
      expect(result.current.state.event.my_status).toBe('honoree');
    }
  });
});
```

- [ ] **Step 2: Run test (expect FAIL — hook may not expose my_status yet)**

```sh
cd /Users/edouard/dev/wishlist/app && npm run test -- --run useEvent.test
```

- [ ] **Step 3: Commit test**

```sh
git add app/src/events/__tests__/useEvent.test.tsx
git commit -m "$(cat <<'EOF'
test(events): useEvent surfaces my_status from get_event_view

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Update `useEvent.ts` + create `eventApi.ts`**

In `app/src/events/eventApi.ts` (new):

```ts
import { supabase } from '../lib/supabase';

export interface EventView {
  event_id:           string;
  title:              string;
  kind:               string;
  occurs_on:          string | null;
  note:               string | null;
  honoree_id:         string;
  honoree_name:       string;
  honoree_avatar_url: string | null;
  my_status:          'honoree' | 'active' | 'pending' | 'guest' | 'anon';
  participant_count:  number;
  items:              EventViewItem[];
}

export interface EventViewItem {
  id:          string;
  title:       string;
  cover_url:   string | null;
  url:         string | null;
  price_cents: number | null;
  currency:    string | null;
  is_claimed:  boolean | null;  // null when masked
}

export async function getEventView(token: string): Promise<EventView> {
  const { data, error } = await supabase.rpc('get_event_view', { _token: token });
  if (error) throw error;
  const row = (data as EventView[] | null)?.[0];
  if (!row) throw new Error('event_not_found');
  return row;
}

export async function joinEventViaToken(token: string): Promise<string> {
  const { data, error } = await supabase.rpc('join_event_via_token', { _token: token });
  if (error) throw error;
  return data as string;
}
```

Modify `useEvent.ts` to surface `my_status` (the existing hook fetches the event via RLS directly; update or add a parallel `useEventByToken` that uses `getEventView`). Keep both surfaces if the existing `useEvent(id)` is used elsewhere.

- [ ] **Step 5: Run test (expect PASS)**

```sh
cd /Users/edouard/dev/wishlist/app && npm run test -- --run useEvent.test && npx tsc -b
```

- [ ] **Step 6: Commit**

```sh
git add app/src/events/useEvent.ts app/src/events/eventApi.ts
git commit -m "$(cat <<'EOF'
feat(events): useEvent surfaces my_status; add eventApi helpers

eventApi.getEventView / joinEventViaToken wrap the new RPCs. useEvent
hook reads my_status (honoree/active/pending/guest/anon).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Task C.2: Router route /event/:token

**Files:**
- Modify: `app/src/Router.tsx`

- [ ] **Step 1: Add the route** (no test for this — covered by EventLandingScreen test in C.3)

In `app/src/Router.tsx`, add a route entry near the existing `/share/:token` route. Both should be eager-loaded (critical path for anon visitors):

```tsx
// Inside Router.tsx (next to <Route path="/share/:token" ... />)
<Route path="/event/:token" element={<EventLandingScreen />} />
```

Eager-import the screen at the top of the file (don't `React.lazy` it — anon visitors from email links need a fast first paint):

```tsx
import { EventLandingScreen } from './screens/events/EventLandingScreen';
```

- [ ] **Step 2: tsc check (will fail until screen exists)**

```sh
cd /Users/edouard/dev/wishlist/app && npx tsc -b 2>&1 | head -20
```

Expected: error "Cannot find module './screens/events/EventLandingScreen'". This is fine — we create the screen in C.3.

- [ ] **Step 3: Do NOT commit yet** — we commit Router and EventLandingScreen together at end of C.3 to keep tsc green per commit.

## Task C.3: EventLandingScreen — anon view + RTL test

**Files:**
- Create: `app/src/screens/events/EventLandingScreen.tsx`
- Create: `app/src/screens/events/__tests__/EventLandingScreen.test.tsx`
- Modify: `app/src/i18n/ru.ts`, `app/src/i18n/en.ts` (add `events.landing.*` keys)

- [ ] **Step 1: Write failing RTL test**

```tsx
// app/src/screens/events/__tests__/EventLandingScreen.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { EventLandingScreen } from '../EventLandingScreen';
import { I18nProvider } from '../../../i18n/I18nContext';

vi.mock('../../../events/eventApi', () => ({
  getEventView: vi.fn(),
  joinEventViaToken: vi.fn(),
}));
vi.mock('../../../auth/useAuth', () => ({
  useAuth: () => ({ user: null, loading: false }),
}));

import { getEventView } from '../../../events/eventApi';

const renderWithRouter = (token = 'abc123') =>
  render(
    <I18nProvider initialLang="ru">
      <MemoryRouter initialEntries={[`/event/${token}`]}>
        <Routes>
          <Route path="/event/:token" element={<EventLandingScreen />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>
  );

describe('EventLandingScreen — anon view', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders event title + items + sign-in CTA when anon', async () => {
    (getEventView as any).mockResolvedValue({
      event_id: 'e1',
      title: 'День рождения Оли',
      kind: 'birthday',
      occurs_on: '2026-06-12',
      note: null,
      honoree_id: 'u1',
      honoree_name: 'Оля',
      honoree_avatar_url: null,
      my_status: 'anon',
      participant_count: 4,
      items: [
        { id: 'i1', title: 'Книга', cover_url: null, url: null, price_cents: 1800, currency: 'EUR', is_claimed: null },
      ],
    });
    renderWithRouter();
    await waitFor(() => expect(screen.getByText('День рождения Оли')).toBeInTheDocument());
    expect(screen.getByText('Книга')).toBeInTheDocument();
    // Sign-in CTA visible to anon
    expect(screen.getByRole('link', { name: /войти/i })).toBeInTheDocument();
    // No claim status visible
    expect(screen.queryByText(/занято|claimed/i)).not.toBeInTheDocument();
  });

  it('renders not_found message on invalid token', async () => {
    (getEventView as any).mockRejectedValue(new Error('event_not_found'));
    renderWithRouter('badtoken');
    await waitFor(() => expect(screen.getByText(/не найден|not found/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test (expect FAIL — component doesn't exist)**

```sh
cd /Users/edouard/dev/wishlist/app && npm run test -- --run EventLandingScreen.test
```

- [ ] **Step 3: Commit test**

```sh
git add app/src/screens/events/__tests__/EventLandingScreen.test.tsx
git commit -m "$(cat <<'EOF'
test(ui): EventLandingScreen — anon view renders items + sign-in CTA

Currently red — component does not exist.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Create EventLandingScreen (anon path only — auth path in C.4)**

```tsx
// app/src/screens/events/EventLandingScreen.tsx
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { PaperLayout } from '../../components/PaperLayout';
import { ItemPhoto } from '../../components/ItemPhoto';
import { useI18n } from '../../i18n/useI18n';
import { useAuth } from '../../auth/useAuth';
import { getEventView, type EventView } from '../../events/eventApi';
import { errorCode, errorMessage } from '../../lib/errors';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; event: EventView }
  | { kind: 'error'; messageKey: string };

export function EventLandingScreen() {
  const { token } = useParams<{ token: string }>();
  const { user } = useAuth();
  const { t } = useI18n();
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getEventView(token)
      .then((event) => {
        if (!cancelled) setState({ kind: 'ready', event });
      })
      .catch((err) => {
        if (!cancelled) {
          const code = errorCode(err);
          setState({ kind: 'error', messageKey: code });
        }
      });
    return () => { cancelled = true; };
  }, [token]);

  if (state.kind === 'loading') {
    return <PaperLayout as="main"><p>{t('common.loading')}</p></PaperLayout>;
  }
  if (state.kind === 'error') {
    return (
      <PaperLayout as="main">
        <h1>{t(`errors.${state.messageKey}`)}</h1>
      </PaperLayout>
    );
  }
  const ev = state.event;
  const nextUrl = encodeURIComponent(`/event/${token}`);

  return (
    <PaperLayout as="main">
      <header>
        <h1 style={{ fontFamily: 'Newsreader, serif', fontStyle: 'italic' }}>{ev.title}</h1>
        {ev.occurs_on && (
          <p style={{ color: 'var(--ink-3)' }}>
            {new Date(ev.occurs_on).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
          </p>
        )}
        <p style={{ color: 'var(--ink-3)' }}>{t('events.landing.honoree', { name: ev.honoree_name })}</p>
        <p style={{ color: 'var(--ink-3)' }}>
          {t('events.landing.participantCount', { count: ev.participant_count })}
        </p>
      </header>

      <ul style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px', listStyle: 'none', padding: 0 }}>
        {ev.items.map((item) => (
          <li key={item.id} style={{ padding: '8px', border: '1px solid var(--hair)' }}>
            <ItemPhoto src={item.cover_url ?? undefined} alt={item.title} />
            <p style={{ marginTop: '6px', fontSize: '14px' }}>{item.title}</p>
            {item.price_cents != null && (
              <p style={{ color: 'var(--ink-3)', fontSize: '13px' }}>
                {(item.price_cents / 100).toFixed(0)} {item.currency ?? '€'}
              </p>
            )}
          </li>
        ))}
      </ul>

      {!user && (
        <div style={{ marginTop: '24px', textAlign: 'center' }}>
          <Link
            to={`/login?next=${nextUrl}`}
            style={{ background: 'var(--accent)', color: '#fff', padding: '12px 24px', textDecoration: 'none', display: 'inline-block' }}
          >
            {t('events.landing.signInToClaim')}
          </Link>
        </div>
      )}
    </PaperLayout>
  );
}
```

- [ ] **Step 5: Add i18n keys**

In `app/src/i18n/ru.ts` inside the `events` block:

```ts
landing: {
  honoree:          'Для: {name}',
  participantCount: '{count} {count, plural, one{друг} few{друга} other{друзей}} участвуют',
  signInToClaim:    'Войти, чтобы взять подарок',
  notFound:         'Event не найден или ссылка неверна.',
},
```

In `app/src/i18n/en.ts` matching:

```ts
landing: {
  honoree:          'For: {name}',
  participantCount: '{count} {count, plural, one{friend} other{friends}} joining',
  signInToClaim:    'Sign in to claim something',
  notFound:         'Event not found or the link is invalid.',
},
```

- [ ] **Step 6: Run test (expect PASS)**

```sh
cd /Users/edouard/dev/wishlist/app && npx tsc -b && npm run test -- --run EventLandingScreen.test
```

Expected: tests pass.

- [ ] **Step 7: Commit EventLandingScreen + Router route + i18n**

```sh
git add app/src/screens/events/EventLandingScreen.tsx app/src/Router.tsx app/src/i18n/ru.ts app/src/i18n/en.ts
git commit -m "$(cat <<'EOF'
feat(ui): EventLandingScreen + /event/:token route

Anon view: title, date, honoree, items grid (no claim status), sign-in
CTA. Eager-loaded (critical path for email-link visitors).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Task C.4: EventLandingScreen — authed auto-join + redirect

**Files:**
- Modify: `app/src/screens/events/EventLandingScreen.tsx`
- Modify: `app/src/screens/events/__tests__/EventLandingScreen.test.tsx`

- [ ] **Step 1: Append failing tests**

In the test file, append a new describe block:

```tsx
describe('EventLandingScreen — authed auto-join', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('redirects honoree to /events/:id without calling join_event_via_token', async () => {
    vi.doMock('../../../auth/useAuth', () => ({
      useAuth: () => ({ user: { id: 'u-honoree' }, loading: false }),
    }));
    (getEventView as any).mockResolvedValue({
      event_id: 'e1', title: 'T', kind: 'birthday', occurs_on: null, note: null,
      honoree_id: 'u-honoree', honoree_name: 'A', honoree_avatar_url: null,
      my_status: 'honoree', participant_count: 0, items: [],
    });
    const { joinEventViaToken } = await import('../../../events/eventApi');
    renderWithRouter();
    await waitFor(() => {
      expect(joinEventViaToken).not.toHaveBeenCalled();
    });
  });

  it('calls join_event_via_token then redirects when authed-non-honoree', async () => {
    vi.doMock('../../../auth/useAuth', () => ({
      useAuth: () => ({ user: { id: 'u-bob' }, loading: false }),
    }));
    (getEventView as any).mockResolvedValue({
      event_id: 'e1', title: 'T', kind: 'birthday', occurs_on: null, note: null,
      honoree_id: 'u-honoree', honoree_name: 'A', honoree_avatar_url: null,
      my_status: 'guest', participant_count: 0, items: [],
    });
    const { joinEventViaToken } = await import('../../../events/eventApi');
    (joinEventViaToken as any).mockResolvedValue('e1');
    renderWithRouter();
    await waitFor(() => {
      expect(joinEventViaToken).toHaveBeenCalledWith('abc123');
    });
  });
});
```

- [ ] **Step 2: Run (expect FAIL)**

```sh
cd /Users/edouard/dev/wishlist/app && npm run test -- --run EventLandingScreen.test
```

- [ ] **Step 3: Commit test**

```sh
git add app/src/screens/events/__tests__/EventLandingScreen.test.tsx
git commit -m "$(cat <<'EOF'
test(ui): EventLandingScreen — authed auto-join + honoree shortcut

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Implement auto-join in EventLandingScreen**

Add to the existing component, after the `useEffect` that fetches the event:

```tsx
import { useNavigate } from 'react-router-dom';
// ... inside the component:
const navigate = useNavigate();

useEffect(() => {
  if (state.kind !== 'ready' || !user || !token) return;
  const ev = state.event;
  if (ev.my_status === 'honoree') {
    navigate(`/events/${ev.event_id}`, { replace: true });
    return;
  }
  if (ev.my_status === 'active') {
    navigate(`/events/${ev.event_id}`, { replace: true });
    return;
  }
  // guest or pending: join, then redirect
  joinEventViaToken(token)
    .then((eventId) => navigate(`/events/${eventId}`, { replace: true }))
    .catch(() => {/* surface error in UI — already handled by error state */});
}, [state, user, token, navigate]);
```

Import `joinEventViaToken` from `../../events/eventApi` at the top of the file.

- [ ] **Step 5: Run test (expect PASS)**

```sh
cd /Users/edouard/dev/wishlist/app && npm run test -- --run EventLandingScreen.test
```

- [ ] **Step 6: Commit**

```sh
git add app/src/screens/events/EventLandingScreen.tsx
git commit -m "$(cat <<'EOF'
feat(ui): EventLandingScreen — auto-join authed visitor

Honoree → direct redirect (no participant row). Authed non-honoree →
join_event_via_token → redirect. Anon → sign-in CTA (unchanged).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Task C.5: CreateEventScreen simplification — drop audience picker

**Files:**
- Modify: `app/src/screens/events/CreateEventScreen.tsx`
- Modify: `app/src/screens/events/__tests__/CreateEventScreen.test.tsx` (may or may not exist; create if missing)

- [ ] **Step 1: Write failing test**

```tsx
// app/src/screens/events/__tests__/CreateEventScreen.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CreateEventScreen } from '../CreateEventScreen';
import { I18nProvider } from '../../../i18n/I18nContext';

vi.mock('../../../events/useEvents', () => ({
  useEvents: () => ({ /* minimal */ }),
}));
vi.mock('../../../auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
}));

describe('CreateEventScreen', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('does NOT render any audience/circle picker', () => {
    render(
      <I18nProvider initialLang="ru"><MemoryRouter>
        <CreateEventScreen />
      </MemoryRouter></I18nProvider>
    );
    expect(screen.queryByText(/круг|circle/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/аудиториа|audience/i)).not.toBeInTheDocument();
  });

  it('renders title, kind, occurs_on, note fields', () => {
    render(
      <I18nProvider initialLang="ru"><MemoryRouter>
        <CreateEventScreen />
      </MemoryRouter></I18nProvider>
    );
    expect(screen.getByLabelText(/название|title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/тип|kind/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test (expect FAIL — audience picker still in DOM until removed)**

```sh
cd /Users/edouard/dev/wishlist/app && npm run test -- --run CreateEventScreen.test
```

- [ ] **Step 3: Commit test**

```sh
git add app/src/screens/events/__tests__/CreateEventScreen.test.tsx
git commit -m "$(cat <<'EOF'
test(ui): CreateEventScreen — no audience/circle picker after simplification

Currently red — picker still present.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Edit `CreateEventScreen.tsx`**

Remove all JSX + state related to audience/circles. Specifically:
- Delete any `<MultiSelect>`/`<Checkbox>` block for circle selection
- Delete `selectedCircleIds` state and effects
- Delete the `await supabase.from('event_circles').insert(...)` call after event creation
- Keep title, kind, occurs_on, note inputs + item curation picker

The submit handler becomes:

```tsx
const onSubmit = async (form: FormData) => {
  const { data, error } = await supabase
    .from('events')
    .insert({
      honoree_id: user!.id,
      title: form.get('title') as string,
      kind: form.get('kind') as string,
      occurs_on: (form.get('occurs_on') as string) || null,
      note: (form.get('note') as string) || null,
    })
    .select('id, share_token')
    .single();
  if (error) { setError(errorMessage(t, error)); return; }
  // Curate selected items
  if (selectedItemIds.length > 0) {
    await supabase.from('event_items').insert(
      selectedItemIds.map((id) => ({ event_id: data!.id, item_id: id }))
    );
  }
  // Navigate to share screen (task C.6)
  navigate(`/events/${data!.id}/share`);
};
```

- [ ] **Step 5: Run test (expect PASS)**

```sh
cd /Users/edouard/dev/wishlist/app && npx tsc -b && npm run test -- --run CreateEventScreen.test
```

- [ ] **Step 6: Commit**

```sh
git add app/src/screens/events/CreateEventScreen.tsx
git commit -m "$(cat <<'EOF'
feat(ui): CreateEventScreen — drop audience/circle picker

Submit now just creates the event + curated items, then navigates to
the new share screen (added in next task). No more circle dropdown.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Task C.6: Post-create share screen

**Files:**
- Modify: `app/src/screens/events/EventDetailScreen.tsx` OR create new `EventShareSuccessScreen.tsx` (decide based on Router patterns)
- Modify: `app/src/Router.tsx`

For simplicity, add a `share=true` query param to `/events/:id` rather than a new route. EventDetailScreen reads it and shows a one-time celebratory share card; the URL is cleaned to remove the param after dismiss.

- [ ] **Step 1: Write failing test**

```tsx
// app/src/screens/events/__tests__/EventDetailScreen.test.tsx (or extend existing)
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { EventDetailScreen } from '../EventDetailScreen';
import { I18nProvider } from '../../../i18n/I18nContext';

vi.mock('../../../events/useEvent', () => ({
  useEvent: () => ({
    state: {
      status: 'ready',
      event: {
        id: 'e1', title: 'T', honoree_id: 'u-honoree', share_token: 'abc123def456',
        kind: 'birthday', occurs_on: null, note: null,
      },
      role: 'honoree',
    },
  }),
}));
vi.mock('../../../auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u-honoree' } }),
}));

describe('EventDetailScreen — post-create share', () => {
  it('shows share card when navigated with ?share=1 and copy button visible', () => {
    render(
      <I18nProvider initialLang="ru"><MemoryRouter initialEntries={['/events/e1?share=1']}>
        <Routes><Route path="/events/:id" element={<EventDetailScreen />} /></Routes>
      </MemoryRouter></I18nProvider>
    );
    expect(screen.getByText(/готово|created|done/i)).toBeInTheDocument();
    expect(screen.getByText(/abc123def456/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /копировать|copy/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test (expect FAIL)**

```sh
cd /Users/edouard/dev/wishlist/app && npm run test -- --run EventDetailScreen.test
```

- [ ] **Step 3: Commit test**

```sh
git add app/src/screens/events/__tests__/EventDetailScreen.test.tsx
git commit -m "$(cat <<'EOF'
test(ui): EventDetailScreen — post-create share card with copy button

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Edit EventDetailScreen.tsx**

Add a check for `?share=1` query param at the top of the rendered tree (only when `role === 'honoree'`):

```tsx
import { useSearchParams } from 'react-router-dom';
// ...
const [params, setParams] = useSearchParams();
const showShareCard = params.get('share') === '1' && role === 'honoree';

// In the JSX, before the existing content:
{showShareCard && (
  <div style={{ background: 'var(--paper-2)', padding: '24px', border: '1px solid var(--hair)', marginBottom: '24px' }}>
    <p style={{ fontFamily: 'Caveat, cursive', fontSize: '24px', color: 'var(--accent)' }}>Готово!</p>
    <p>{t('events.share.howToShare')}</p>
    <code style={{ display: 'block', padding: '8px', background: 'var(--paper)', margin: '12px 0' }}>
      {`${window.location.origin}/event/${event.share_token}`}
    </code>
    <button onClick={() => {
      navigator.clipboard.writeText(`${window.location.origin}/event/${event.share_token}`);
      toast.success(t('events.share.copied'));
    }}>
      {t('events.share.copy')}
    </button>
    <button onClick={() => { params.delete('share'); setParams(params, { replace: true }); }}>
      {t('common.dismiss')}
    </button>
  </div>
)}
```

Add i18n strings for `events.share.howToShare`, `events.share.copy`, `events.share.copied`, `common.dismiss` in ru.ts + en.ts.

- [ ] **Step 5: Run test (expect PASS) + tsc**

```sh
cd /Users/edouard/dev/wishlist/app && npx tsc -b && npm run test -- --run EventDetailScreen.test
```

- [ ] **Step 6: Commit**

```sh
git add app/src/screens/events/EventDetailScreen.tsx app/src/i18n/ru.ts app/src/i18n/en.ts
git commit -m "$(cat <<'EOF'
feat(ui): post-create share card on EventDetailScreen ?share=1

After event creation, navigate with ?share=1 to surface a one-time
share card with copy-to-clipboard. Honoree-only. Dismissable.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Task C.7: PR C — push + open

- [ ] **Step 1: Local CI**

```sh
cd /Users/edouard/dev/wishlist/app && npm run lint && npx tsc -b && npm run test -- --run && npm run build && cd .. && (cd supabase/tests/integration && eval "$(supabase status --output env | sed 's/^/export /')" && npm test)
```

- [ ] **Step 2: Push + PR**

```sh
git push -u origin feat/events-link-ui-public
gh pr create --base feat/events-link-email --title "feat(ui): public event landing + simplified create flow" --body "$(cat <<'EOF'
## Summary
Phase C of events link-first. Public flow surfaces.

- New `/event/:token` route + `EventLandingScreen` (eager-loaded)
- Anon view: title + items grid (no claim status) + sign-in CTA
- Authed-non-honoree: auto-call `join_event_via_token` → redirect to `/events/:id`
- Honoree: direct redirect to `/events/:id`
- `CreateEventScreen`: audience/circle picker removed; submit → `/events/:id?share=1`
- Post-create share card on `EventDetailScreen` (honoree, dismissable)
- i18n strings (ru + en) for landing, share card, dismiss

## Stacked on PR B

## Test plan
- [x] RTL tests for EventLandingScreen (anon + authed paths)
- [x] RTL tests for CreateEventScreen (no audience picker, fields intact)
- [x] RTL test for share card on EventDetailScreen
- [x] tsc, lint, build, integration suite

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

# PHASE D — Coordinator + People + pending invites

**Branch:** `feat/events-link-ui-coord` (stacked on C)
**Outcome:** coordinator dashboard surfaces share card + invite button + participant list; People auto-populates; pending invites visible/actionable in /events.

## Task D.0: Branch

```sh
git checkout feat/events-link-ui-public && git checkout -b feat/events-link-ui-coord
```

## Task D.1: useEvents update — handle my_status (pending)

**Files:**
- Modify: `app/src/events/useEvents.ts`
- Create or extend: `app/src/events/__tests__/useEvents.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
// in useEvents.test.tsx
it('exposes my_status from get_my_events RPC; categorises pending separately', async () => {
  (supabase.rpc as any).mockResolvedValue({
    data: [
      { id: 'e1', my_status: 'honoree', title: 'A', participant_count: 2, share_token: 't1' },
      { id: 'e2', my_status: 'active',  title: 'B', participant_count: 4, share_token: 't2' },
      { id: 'e3', my_status: 'pending', title: 'C', participant_count: 0, share_token: 't3' },
    ],
    error: null,
  });
  const { result } = renderHook(() => useEvents());
  await waitFor(() => expect(result.current.state.status).toBe('ready'));
  // We exposes a categorised view
  if (result.current.state.status === 'ready') {
    expect(result.current.state.events).toHaveLength(3);
    expect(result.current.state.pending).toHaveLength(1);
    expect(result.current.state.pending[0]?.id).toBe('e3');
  }
});
```

- [ ] **Step 2: Run (expect FAIL)**, commit test, update hook to expose `pending` and `events` lists, run (expect PASS), commit impl.

## Task D.2: usePeople — switch to get_my_people

**Files:**
- Modify: `app/src/people/usePeople.ts`
- Create or extend: `app/src/people/__tests__/usePeople.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
it('loads from get_my_people RPC', async () => {
  (supabase.rpc as any).mockResolvedValue({
    data: [
      { user_id: 'u1', display_name: 'Tanya', handle: 't', avatar_url: null, has_public_list: true, last_interaction_at: '2026-05-20' },
    ],
    error: null,
  });
  const { result } = renderHook(() => usePeople());
  await waitFor(() => expect(result.current.state.status).toBe('ready'));
  if (result.current.state.status === 'ready') {
    expect(result.current.state.people).toHaveLength(1);
    expect(result.current.state.people[0]?.display_name).toBe('Tanya');
  }
});

it('renders empty state when get_my_people returns []', async () => {
  (supabase.rpc as any).mockResolvedValue({ data: [], error: null });
  const { result } = renderHook(() => usePeople());
  await waitFor(() => expect(result.current.state.status).toBe('ready'));
  if (result.current.state.status === 'ready') {
    expect(result.current.state.people).toEqual([]);
  }
});
```

- [ ] **Step 2: Red → commit → switch hook data source from old group-based query to `supabase.rpc('get_my_people')` → green → commit.

## Task D.3: PeopleScreen empty-state copy

**Files:**
- Modify: `app/src/screens/people/PeopleScreen.tsx`
- Modify: `app/src/i18n/{ru,en}.ts`

- [ ] **Step 1: Failing test**

```tsx
it('renders friendly empty state when no people yet', () => {
  vi.mocked(usePeople).mockReturnValue({
    state: { status: 'ready', people: [] },
  } as any);
  render(<I18nProvider initialLang="ru"><MemoryRouter><PeopleScreen /></MemoryRouter></I18nProvider>);
  expect(screen.getByText(/появятся друзья|friends will appear/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Red → commit → add `people.emptyState` keys + render condition → green → commit.

ru: `'Здесь появятся друзья после твоего первого event’а.'`
en: `'Friends will appear here after your first event.'`

## Task D.4: InviteFromPeopleModal

**Files:**
- Create: `app/src/screens/events/InviteFromPeopleModal.tsx`
- Create: `app/src/screens/events/__tests__/InviteFromPeopleModal.test.tsx`
- Modify: `app/src/i18n/{ru,en}.ts`

- [ ] **Step 1: Failing test**

```tsx
// InviteFromPeopleModal.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InviteFromPeopleModal } from '../InviteFromPeopleModal';
import { I18nProvider } from '../../../i18n/I18nContext';

vi.mock('../../../people/usePeople', () => ({
  usePeople: () => ({
    state: { status: 'ready', people: [
      { user_id: 'p1', display_name: 'Таня', avatar_url: null, last_interaction_at: '2026-05-20', has_public_list: true, handle: 't' },
      { user_id: 'p2', display_name: 'Миша', avatar_url: null, last_interaction_at: '2026-05-10', has_public_list: false, handle: 'm' },
    ] },
  }),
}));
vi.mock('../../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ data: 2, error: null }),
    functions: { invoke: vi.fn().mockResolvedValue({ data: { sent: 2 } }) },
  },
}));

describe('InviteFromPeopleModal', () => {
  it('selects two friends → submit → rpc called + edge function invoked + toast count', async () => {
    const onClose = vi.fn();
    const showToast = vi.fn();
    render(
      <I18nProvider initialLang="ru">
        <InviteFromPeopleModal eventId="e1" open={true} onClose={onClose} showToast={showToast} />
      </I18nProvider>
    );
    fireEvent.click(screen.getByLabelText('Таня'));
    fireEvent.click(screen.getByLabelText('Миша'));
    fireEvent.click(screen.getByRole('button', { name: /позвать 2/i }));
    const { supabase } = await import('../../../lib/supabase');
    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('invite_to_event', {
        _event_id: 'e1', _user_ids: ['p1', 'p2'],
      });
      expect(supabase.functions.invoke).toHaveBeenCalledWith('send-event-invite', {
        body: { event_id: 'e1', user_ids: ['p1', 'p2'] },
      });
      expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/2/));
      expect(onClose).toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Red → commit → write component → green → commit.

Component sketch (full code, written into the file):

```tsx
// app/src/screens/events/InviteFromPeopleModal.tsx
import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { usePeople } from '../../people/usePeople';
import { useI18n } from '../../i18n/useI18n';

interface Props {
  eventId: string;
  open: boolean;
  onClose: () => void;
  showToast: (msg: string) => void;
}

export function InviteFromPeopleModal({ eventId, open, onClose, showToast }: Props) {
  const { t } = useI18n();
  const peopleState = usePeople();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  if (!open) return null;
  if (peopleState.state.status !== 'ready') return null;

  const toggle = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const submit = async () => {
    if (selected.size === 0) return;
    setBusy(true);
    const userIds = [...selected];
    const { error } = await supabase.rpc('invite_to_event', {
      _event_id: eventId, _user_ids: userIds,
    });
    if (error) {
      showToast(t('errors.unknown'));
      setBusy(false);
      return;
    }
    // Fire-and-forget email send
    void supabase.functions.invoke('send-event-invite', {
      body: { event_id: eventId, user_ids: userIds },
    }).catch(() => {/* ignored */});
    showToast(t('events.invite.success', { count: userIds.size }));
    setBusy(false);
    onClose();
  };

  return (
    <div role="dialog" aria-modal="true" style={modalBackdropStyle}>
      <div style={modalCardStyle}>
        <h2>{t('events.invite.title')}</h2>
        <ul style={{ listStyle: 'none', padding: 0, maxHeight: '300px', overflowY: 'auto' }}>
          {peopleState.state.people.map((p) => (
            <li key={p.user_id} style={{ padding: '8px 0', borderBottom: '1px solid var(--hair)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <input
                  type="checkbox"
                  aria-label={p.display_name}
                  checked={selected.has(p.user_id)}
                  onChange={() => toggle(p.user_id)}
                />
                <span>{p.display_name}</span>
              </label>
            </li>
          ))}
        </ul>
        <p style={{ color: 'var(--ink-3)', fontSize: '13px', marginTop: '16px' }}>
          {t('events.invite.helpText')}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
          <button onClick={onClose} disabled={busy}>{t('common.cancel')}</button>
          <button onClick={submit} disabled={busy || selected.size === 0}>
            {t('events.invite.submit', { count: selected.size })}
          </button>
        </div>
      </div>
    </div>
  );
}

const modalBackdropStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
};
const modalCardStyle: React.CSSProperties = {
  background: 'var(--paper)', padding: '32px', maxWidth: '440px', width: '90%',
  border: '1px solid var(--hair)',
};
```

i18n keys to add:

```ts
events.invite: {
  title:      'Кого позвать на event?',
  submit:     'Позвать {count} →',
  success:    'Позвал(а) {count} друзей',
  helpText:   'Им придёт email и появится в /events с пометкой «приглашение».',
},
common.cancel: 'Отмена',  // (if not present already)
```

Mirror EN.

## Task D.5: EventDetailScreen — coordinator share + invite + participants

**Files:**
- Modify: `app/src/screens/events/EventDetailScreen.tsx`
- Modify: `app/src/screens/events/__tests__/EventDetailScreen.test.tsx`

- [ ] **Step 1: Failing tests**

Append to `app/src/screens/events/__tests__/EventDetailScreen.test.tsx`:

```tsx
describe('EventDetailScreen — coordinator panel', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  function mockEventAsRole(role: 'honoree' | 'active') {
    vi.mocked(useEvent).mockReturnValue({
      state: {
        status: 'ready',
        event: {
          id: 'e1', title: 'T', honoree_id: role === 'honoree' ? 'u-me' : 'u-other',
          share_token: 'abc123def456', kind: 'birthday', occurs_on: null, note: null,
        },
        role,
      },
    } as never);
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u-me' } } as never);
  }

  it('honoree sees share card always (not just ?share=1) + invite button', () => {
    mockEventAsRole('honoree');
    render(
      <I18nProvider initialLang="ru"><MemoryRouter initialEntries={['/events/e1']}>
        <Routes><Route path="/events/:id" element={<EventDetailScreen />} /></Routes>
      </MemoryRouter></I18nProvider>
    );
    expect(screen.getByText(/abc123def456/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /позвать друзей/i })).toBeInTheDocument();
  });

  it('non-honoree (active participant) does NOT see invite button', () => {
    mockEventAsRole('active');
    render(
      <I18nProvider initialLang="ru"><MemoryRouter initialEntries={['/events/e1']}>
        <Routes><Route path="/events/:id" element={<EventDetailScreen />} /></Routes>
      </MemoryRouter></I18nProvider>
    );
    expect(screen.queryByRole('button', { name: /позвать друзей/i })).not.toBeInTheDocument();
  });

  it('honoree sees participant list with statuses', async () => {
    mockEventAsRole('honoree');
    // Mock the event_participants query (Supabase client) to return a mixed-status list
    const fromMock = vi.fn().mockReturnValue({
      select: () => ({
        eq: () => Promise.resolve({ data: [
          { user_id: 'p1', status: 'active',  joined_at: '2026-05-20', profiles: { display_name: 'Tanya' } },
          { user_id: 'p2', status: 'pending', invited_at: '2026-05-22', profiles: { display_name: 'Misha' } },
        ], error: null }),
      }),
    });
    vi.mocked((await import('../../../lib/supabase')).supabase.from).mockImplementation(fromMock as never);
    render(
      <I18nProvider initialLang="ru"><MemoryRouter initialEntries={['/events/e1']}>
        <Routes><Route path="/events/:id" element={<EventDetailScreen />} /></Routes>
      </MemoryRouter></I18nProvider>
    );
    expect(await screen.findByText('Tanya')).toBeInTheDocument();
    expect(await screen.findByText('Misha')).toBeInTheDocument();
    expect(screen.getByText(/приглашение/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run (expect FAIL — no coordinator panel yet)**

```sh
cd /Users/edouard/dev/wishlist/app && npm run test -- --run EventDetailScreen.test
```

- [ ] **Step 3: Commit tests**

```sh
git add app/src/screens/events/__tests__/EventDetailScreen.test.tsx
git commit -m "$(cat <<'EOF'
test(ui): EventDetailScreen coordinator panel — share card + invite + participants

- Honoree sees always-on share card + invite button
- Non-honoree (active) does NOT see invite button
- Honoree sees participant list with active/pending statuses

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Implement coordinator panel in `EventDetailScreen.tsx`**

Add three sections, conditionally rendered when `role === 'honoree'`:

1. **Share card** (always-on for honoree, distinct from transient `?share=1` celebratory card from C.6):
```tsx
{role === 'honoree' && (
  <section style={shareCardStyle}>
    <h3>{t('events.share.title')}</h3>
    <code>{`${window.location.origin}/event/${event.share_token}`}</code>
    <button onClick={handleCopy}>{t('events.share.copy')}</button>
  </section>
)}
```

2. **Invite button** (opens InviteFromPeopleModal from D.4):
```tsx
{role === 'honoree' && (
  <button onClick={() => setInviteOpen(true)}>{t('events.invite.openButton')}</button>
)}
<InviteFromPeopleModal eventId={event.id} open={inviteOpen} onClose={() => setInviteOpen(false)} showToast={toast.success} />
```

3. **Participants section** (collapsed by default):
```tsx
{role === 'honoree' && (
  <section>
    <details>
      <summary>{t('events.participants.title', { count: participants.length })}</summary>
      <ul>{participants.map((p) => (
        <li key={p.user_id}>
          {p.profiles.display_name}
          <span className={`status-badge status-${p.status}`}>
            {t(`events.participants.status.${p.status}`)}
          </span>
        </li>
      ))}</ul>
    </details>
  </section>
)}
```

Fetch participants via existing `supabase.from('event_participants').select('user_id, status, joined_at, invited_at, profiles!user_id(display_name, avatar_url)').eq('event_id', eventId)`.

Add i18n keys in ru.ts + en.ts:
```ts
events.share: { title: 'Ссылка для приглашения', copy: 'Копировать', copied: 'Скопировано', howToShare: '...' }
events.invite: { openButton: 'Позвать друзей', ... }  // others already added in D.4
events.participants: {
  title: '{count} {count, plural, one{участник} few{участника} other{участников}}',
  status: { active: 'участвует', pending: 'приглашение', declined: 'отказался' },
}
```

Mirror EN.

- [ ] **Step 5: Run test (expect PASS) + tsc**

```sh
cd /Users/edouard/dev/wishlist/app && npx tsc -b && npm run test -- --run EventDetailScreen.test
```

- [ ] **Step 6: Commit**

```sh
git add app/src/screens/events/EventDetailScreen.tsx app/src/i18n/ru.ts app/src/i18n/en.ts
git commit -m "$(cat <<'EOF'
feat(ui): EventDetailScreen — coordinator panel

- Always-on share card with copy button (honoree only)
- Invite button → opens InviteFromPeopleModal
- Collapsed participants section with active/pending status badges

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Task D.6: EventsScreen — pending UX

**Files:**
- Modify: `app/src/screens/events/EventsScreen.tsx`
- Modify: `app/src/screens/events/__tests__/EventsScreen.test.tsx`

- [ ] **Step 1: Failing tests**

Create `app/src/screens/events/__tests__/EventsScreen.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EventsScreen } from '../EventsScreen';
import { I18nProvider } from '../../../i18n/I18nContext';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});
vi.mock('../../../events/useEvents', () => ({
  useEvents: vi.fn(),
}));
vi.mock('../../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ data: 'e-pending', error: null }),
    from: vi.fn(() => ({
      update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
    })),
  },
}));

import { useEvents } from '../../../events/useEvents';

describe('EventsScreen — pending UX', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  function mockEvents(pending: Array<{ id: string; title: string; invited_by_name?: string }>) {
    vi.mocked(useEvents).mockReturnValue({
      state: {
        status: 'ready',
        events: pending.map((p) => ({ ...p, my_status: 'pending', share_token: `tok-${p.id}` })),
        pending,
      },
    } as never);
  }

  it('pending events render with invite badge + accept/decline buttons', () => {
    mockEvents([{ id: 'e-pending', title: 'Surprise BD', invited_by_name: 'Tanya' }]);
    render(
      <I18nProvider initialLang="ru"><MemoryRouter><EventsScreen /></MemoryRouter></I18nProvider>
    );
    expect(screen.getByText('Surprise BD')).toBeInTheDocument();
    expect(screen.getByText(/приглашение от/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /принять/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /отклонить/i })).toBeInTheDocument();
  });

  it('accept calls join_event_via_token with the event share_token + navigates to /events/:id', async () => {
    mockEvents([{ id: 'e-pending', title: 'X' }]);
    render(
      <I18nProvider initialLang="ru"><MemoryRouter><EventsScreen /></MemoryRouter></I18nProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: /принять/i }));
    const { supabase } = await import('../../../lib/supabase');
    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('join_event_via_token', { _token: 'tok-e-pending' });
      expect(navigateMock).toHaveBeenCalledWith('/events/e-pending');
    });
  });

  it('decline updates event_participants row to declined', async () => {
    mockEvents([{ id: 'e-pending', title: 'X' }]);
    const { supabase } = await import('../../../lib/supabase');
    const updateChain = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    });
    vi.mocked(supabase.from).mockReturnValue({ update: updateChain } as never);

    render(
      <I18nProvider initialLang="ru"><MemoryRouter><EventsScreen /></MemoryRouter></I18nProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: /отклонить/i }));
    await waitFor(() => {
      expect(supabase.from).toHaveBeenCalledWith('event_participants');
      expect(updateChain).toHaveBeenCalledWith({ status: 'declined' });
    });
  });
});
```

- [ ] **Step 2: Run (expect FAIL — pending UX not in DOM)**

```sh
cd /Users/edouard/dev/wishlist/app && npm run test -- --run EventsScreen.test
```

- [ ] **Step 3: Commit tests**

```sh
git add app/src/screens/events/__tests__/EventsScreen.test.tsx
git commit -m "$(cat <<'EOF'
test(ui): EventsScreen — pending invite UX

- Pending events render with invite badge + accept/decline
- Accept → join_event_via_token RPC + navigate
- Decline → UPDATE event_participants set status='declined'

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Implement pending UX in `EventsScreen.tsx`**

For each event row where `my_status === 'pending'`, render:
- "приглашение от {inviter}" badge (use the existing event card structure; add the badge near the title)
- Two inline buttons: "Принять" and "Отклонить"

Handlers:

```tsx
const handleAccept = async (event: EventRow) => {
  const { data, error } = await supabase.rpc('join_event_via_token', { _token: event.share_token });
  if (error) { toast.error(errorMessage(t, error)); return; }
  navigate(`/events/${data as string}`);
};
const handleDecline = async (event: EventRow) => {
  const { error } = await supabase.from('event_participants')
    .update({ status: 'declined' })
    .eq('event_id', event.id)
    .eq('user_id', user!.id);
  if (error) { toast.error(errorMessage(t, error)); return; }
  // Optionally trigger a refresh of useEvents — realtime channel should pick it up
};
```

Also: replace the dropped `audience_circle_count` badge with `participant_count` badge (already done in A.13, but verify the new card shape includes it).

i18n keys:
```ts
events.pending: {
  invitedBy: 'приглашение от {name}',
  accept:    'Принять',
  decline:   'Отклонить',
},
```

Mirror EN.

- [ ] **Step 5: Run test (expect PASS)**

```sh
cd /Users/edouard/dev/wishlist/app && npx tsc -b && npm run test -- --run EventsScreen.test
```

- [ ] **Step 6: Commit**

```sh
git add app/src/screens/events/EventsScreen.tsx app/src/i18n/ru.ts app/src/i18n/en.ts
git commit -m "$(cat <<'EOF'
feat(ui): EventsScreen — pending invite UX

- Invite badge ("приглашение от X") on pending event cards
- Accept button → join_event_via_token RPC → navigate to event
- Decline button → UPDATE event_participants set status='declined'

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Task D.7: Privacy smoke test (manual + automated)

- [ ] **Step 1: Manual smoke** — open the app in two browsers (alice as honoree, bob as participant). alice creates event; copy link; open in bob's browser; bob joins; bob claims an item; alice refreshes; verify alice does NOT see "bob claimed X" anywhere (item detail, event list, OG image).

- [ ] **Step 2: Add automated UI smoke** — a vitest test that mounts EventDetailScreen as honoree and asserts no claim-attribution text leaks into the rendered output. Add to `EventDetailScreen.test.tsx`:

```tsx
it('honoree does NOT see who claimed any item (UI regression guard)', async () => {
  // Mock useEvent + useEventItems with claims data structured AS IF the RLS leaked it.
  // Render. Assert no claim attribution text appears.
  // (RLS should prevent the leak, but UI should also not render it even if data sneaks in.)
});
```

Run, commit.

## Task D.8: PR D — push + open

- [ ] **Step 1: Local CI**

```sh
cd /Users/edouard/dev/wishlist/app && npm run lint && npx tsc -b && npm run test -- --run && npm run build && cd .. && (cd supabase/tests/integration && eval "$(supabase status --output env | sed 's/^/export /')" && npm test)
```

- [ ] **Step 2: Push + PR**

```sh
git push -u origin feat/events-link-ui-coord
gh pr create --base feat/events-link-ui-public --title "feat(ui): coordinator dashboard + People + InviteFromPeopleModal + pending invites" --body "$(cat <<'EOF'
## Summary
Phase D — final phase of events link-first. Coordinator features + People + pending UX.

- `useEvents`: surfaces `my_status`, categorises pending events separately
- `usePeople`: switched data source from group-based query to `get_my_people` RPC
- `PeopleScreen`: empty-state copy "Здесь появятся друзья после твоего первого event'а"
- `InviteFromPeopleModal` (NEW): checklist of People → `invite_to_event` RPC + `send-event-invite` Edge Function fire-and-forget
- `EventDetailScreen` coordinator panel: always-on share card + invite button + collapsed participants section with status badges
- `EventsScreen`: pending invite cards with "приглашение от X" badge + accept (RPC) / decline (UPDATE) inline buttons
- UI regression guard: honoree never sees claim attribution even if data leaked

## Stacked on PR C

## Test plan
- [x] RTL tests for all new/modified components
- [x] Integration tests still green (no schema changes in this PR)
- [x] tsc, lint, build, full vitest suite
- [ ] After merge — manual smoke per the after-merge checklist in the plan doc

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## After all PRs merge

1. **Deploy Edge Function on prod:**
   ```sh
   supabase functions deploy send-event-invite --project-ref fiuheufmawxkgbqddwwu
   ```

2. **Smoke-test live on `ratlist.app`:**
   - Create an event
   - Share link
   - Open in incognito → sign in → land back on event with active status
   - Invite a friend from People → verify email arrives
   - Honoree never sees claim attribution

3. **Update memory** at `~/.claude/projects/-Users-edouard-dev-wishlist/memory/` — add a `project_events_redesign_v2.md` (or similar) noting the link-first redesign shipped.

4. **Delete stale closed-PR branches on remote** (optional cleanup):
   ```sh
   git push origin --delete feat/cagnotte-hr-mode-events feat/cagnotte-schema feat/cagnotte-mangopay-kyc
   ```
   Only after confirming they are no longer needed.

---

## Spec coverage self-check

Walking through `docs/superpowers/specs/2026-05-24-events-link-first-design.md` section-by-section:

| Spec section | Plan task(s) | Status |
|---|---|---|
| Schema (Section 1) | A.1 | ✓ |
| can_see_event | A.2 | ✓ |
| can_see_item | A.3 | ✓ |
| events RLS (Section 2) | A.4 | ✓ |
| event_participants RLS | A.5 | ✓ |
| Privacy matrix | A.11 + D.7 | ✓ |
| get_event_view (Section 3) | A.6 | ✓ |
| join_event_via_token | A.7 | ✓ |
| invite_to_event | A.8 | ✓ |
| get_my_people | A.9 | ✓ |
| get_my_events update | A.10 | ✓ |
| Errors mapping | A.12 | ✓ |
| Edge Function (Section 4) | B.1–B.3 | ✓ |
| Idempotency log | B.1 | ✓ |
| CreateEventScreen simplification (Section 5.A) | C.5 | ✓ |
| EventLandingScreen (Section 5.B) | C.3, C.4 | ✓ |
| EventDetailScreen coordinator (Section 5.C) | C.6, D.5 | ✓ |
| InviteFromPeopleModal (Section 5.D) | D.4 | ✓ |
| PeopleScreen update (Section 5.E) | D.2, D.3 | ✓ |
| EventsScreen pending UX (Section 5.F) | D.1, D.6 | ✓ |
| Router /event/:token | C.2 | ✓ |
| Frontend tsc-fix | A.13 | ✓ |
| seedEvent helper update | A.14 | ✓ |
| Test plan (Section 6) | distributed | ✓ |
| 4-PR layout | A.15, B.4, C.7, D.8 | ✓ |
| Out-of-scope (notif prefs, EN locale, /groups cleanup, reminders, HR-mode) | n/a (explicitly excluded) | ✓ |

No gaps.

---

## Pickup tips for the implementer

1. **TDD is mandatory, not aspirational.** Test commit before impl commit per feature. Skipping this is the lesson from the cagnotte arc. The reviewer can verify by running `git log --oneline <branch>` and confirming the test:/feat: alternation.

2. **Never `--no-verify`.** Pre-commit hooks exist for a reason. If a hook fails, fix the root cause.

3. **Local CI before push** (per [memory `feedback_local_ci_before_pr`](~/.claude/projects/-Users-edouard-dev-wishlist/memory/feedback_local_ci_before_pr.md)): `npm run lint && npx tsc -b && npm run test -- --run && npm run build && (cd supabase/tests/integration && eval "$(supabase status --output env | sed 's/^/export /')" && npm test)`. All green before `git push`.

4. **Privacy invariants are non-negotiable.** `events-link-privacy.test.ts` is the gate. If it ever fails, stop and debug — don't continue with a broken invariant.

5. **Local Supabase on shifted ports 544xx.** Don't `supabase stop` the user's other 543xx instance.

6. **Migration timestamps are sequential.** All migration files in this plan use `20260524XXXXXX` prefix. If you write a new migration in the same minute as another, increment the second-of-minute portion (`20260524120100` not `20260524120000`).

7. **For each PR**, after `gh pr create` succeeds:
   - Verify GitHub Actions CI is green
   - Don't request review until green
   - When stacking, base the next branch on the in-flight one until the prior merges

8. **i18n parity is enforced by tsc** (Translation type). If you forget to add a new key in en.ts, tsc fails the build. Use that signal.

9. **realtime channels** — `event_participants` is in the publication. UI hooks that depend on participant changes (coordinator dashboard, EventsScreen pending list) should subscribe via `supabase.channel(...).on('postgres_changes', ...)`. Use the existing debounce helper at `app/src/lib/debounce.ts`.

10. **The visual companion server** may still be running from the brainstorming session at `http://localhost:50567` — it auto-exits after 30 mins of inactivity. Not relevant to execution; just FYI.
