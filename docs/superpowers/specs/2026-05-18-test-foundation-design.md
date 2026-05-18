# Test foundation — design spec

Date: 2026-05-18
Source: full-project audit run on 2026-05-17 surfaced "zero automated tests" as the largest gap. This is the second of three buckets from that audit. First bucket (edge security hardening) shipped 2026-05-17 → 2026-05-18; third bucket (realtime/polish) is deferred.

## Problem

The project has zero automated tests beyond the 25 Deno tests added in the edge-security-hardening series. The highest-risk uncovered paths:

1. **Three privacy invariants** (CLAUDE.md, "Privacy invariants (DO NOT regress)"):
   - A. `claims` rows are invisible to the owner of the item.
   - B. `santa_assignments` are visible only to the giver until the event status flips to `revealed`.
   - C. `items` are visible to owner OR via `item_groups` OR via the new `event_items` audience path.
   These are documented as manual curl/psql verifications. Any future migration can silently break them; nothing fails until a user notices on prod.

2. **`run_santa_draw` Postgres function** — derangement algorithm with retry loop and exclusion graph. Core business logic, zero coverage. A bug here mis-pairs giftings — a user-visible disaster.

3. **`errorCode()` / `errorMessage()` mapper in `app/src/lib/errors.ts`** — 24 codes mapped from SQLSTATE / RAISE EXCEPTION / message fragments. Every screen funnels through this; a misclassification means the user sees the wrong message. Tests would also lock the contract so adding new codes is safer.

4. **Hot frontend hooks** (`useMyItems`, `useEvent`, `useSantaEvent`) — handle Supabase response shaping, realtime subscriptions, and error states. Bugs cascade across many screens.

5. **`ItemForm` URL-meta integration** — special-cases edge-function refusal codes (blocked_host, urlNotAllowed). The yesterday's `urlNotAllowed` UX work has no regression cover.

6. **CI** — no `.github/workflows` exists. PRs land without any gate.

## Goals

- Lock the three privacy invariants behind integration tests that exercise the actual REST + RLS code path (not a mock).
- Cover `run_santa_draw` correctness (derangement, exclusions, error paths).
- Cover `errors.ts` mapper exhaustively (every code path).
- Add focused RTL tests for four hot hooks/forms.
- Wire a GitHub Actions CI workflow that runs everything on every PR + push to main, finishing in under 5 minutes wall-clock.

## Non-goals

- Playwright / Cypress e2e. Deferred until the basic foundation is in place.
- Visual regression / screenshot tests.
- Component coverage for every screen. We test 4 hot spots; the rest gets tests when bugs surface.
- Coverage thresholds gating PRs. We generate coverage reports but don't fail PRs on percentage — too easy to game, too noisy on first iteration.
- Mutation testing.
- Codecov / external coverage upload service.
- Sentry release tagging.
- Lighthouse / a11y audits inside CI.

## Architecture

Three independent test surfaces, one CI workflow that runs all three:

```
┌─────────────────────┐     ┌─────────────────────────┐     ┌────────────────────┐
│ Frontend (Vitest)   │     │ Integration (Vitest)    │     │ Edge (Deno)        │
│ app/src/**/*.test.* │     │ supabase/tests/integ/   │     │ supabase/functions/│
│                     │     │                         │     │  **/*.test.ts      │
│ - errors.ts unit    │     │ - claims privacy (A)    │     │ - already exists   │
│ - 3 hook tests      │     │ - santa privacy (B)     │     │   (25 tests)       │
│ - ItemForm test     │     │ - event_items (C)       │     │                    │
│ - jsdom + RTL       │     │ - run_santa_draw        │     │                    │
│ - mocked supabase   │     │ - real local Supabase   │     │                    │
└─────────┬───────────┘     └────────────┬────────────┘     └─────────┬──────────┘
          │                              │                            │
          └──────────────────────────────┴────────────────────────────┘
                                         │
                              ┌──────────▼──────────┐
                              │ .github/workflows/  │
                              │ ci.yml — 3 jobs     │
                              │ in parallel         │
                              └─────────────────────┘
```

Each surface has its own runner (Vitest jsdom / Vitest node / Deno) so they can't interfere. CI runs them as independent jobs, parallel.

## File layout

```
app/
├── vitest.config.ts            # NEW — jsdom env, alias matching tsconfig
├── vitest.setup.ts             # NEW — testing-library/jest-dom + cleanup
├── package.json                # +vitest, +@testing-library/*, +jsdom
├── src/
│   ├── test/
│   │   └── supabaseMock.ts     # NEW — shared chainable supabase mock
│   ├── lib/
│   │   └── errors.test.ts      # NEW — 30+ cases covering AppErrorCode union
│   ├── items/
│   │   └── __tests__/
│   │       └── useMyItems.test.tsx     # NEW — 4 cases
│   ├── events/
│   │   └── __tests__/
│   │       └── useEvent.test.tsx       # NEW — 3 cases
│   ├── santa/
│   │   └── __tests__/
│   │       └── useSantaEvent.test.tsx  # NEW — 4 cases
│   └── screens/items/
│       └── __tests__/
│           └── ItemForm.test.tsx       # NEW — 5 cases

supabase/
├── tests/
│   └── integration/
│       ├── package.json        # NEW — vitest + supabase-js + jose
│       ├── vitest.config.ts    # NEW — node env, sequential
│       ├── tsconfig.json       # NEW
│       ├── helpers/
│       │   ├── env.ts          # NEW — env guard (local-only)
│       │   ├── mintJwt.ts      # NEW — HS256 sign with JWT_SECRET
│       │   ├── client.ts       # NEW — supabase-js client factory per user
│       │   └── seed.ts         # NEW — truncate + insert deterministic fixtures
│       ├── claims-privacy.test.ts             # Invariant A — 4 cases
│       ├── santa-assignments-privacy.test.ts  # Invariant B — 6 cases
│       ├── event-items-visibility.test.ts     # Invariant C — 5 cases
│       └── santa-draw.test.ts                 # run_santa_draw — 6 cases

.github/
└── workflows/
    └── ci.yml                  # NEW — 3 jobs (lint-build, frontend-tests, integration-tests)
```

## Components

### 1. Frontend Vitest config (`app/vitest.config.ts`)

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    css: false,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
```

`vitest.setup.ts`:

```typescript
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
afterEach(cleanup);
```

`app/package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:edge": "cd ../supabase/functions && deno test --allow-net --allow-env",
"test:integration": "cd ../supabase/tests/integration && npm test"
```

New devDependencies:
- `vitest`
- `jsdom`
- `@testing-library/react`
- `@testing-library/jest-dom`
- `@testing-library/user-event`

`@vitejs/plugin-react` is already a devDep (used by `vite.config.ts`).

### 2. Shared supabase mock (`app/src/test/supabaseMock.ts`)

A single chainable mock factory that the four hook tests reuse. Tests customize specific terminal calls (`maybeSingle`, `single`, the awaitable shape) per case.

```typescript
import { vi } from 'vitest';

export function createSupabaseMock() {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    // For non-terminal awaits (.select().eq() awaited directly), assign
    // `_chain.then` per-test to control the resolution.
    then: undefined as unknown,
  };
  const channel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
    unsubscribe: vi.fn(),
  };
  return {
    from: vi.fn().mockReturnValue(chain),
    rpc: vi.fn(),
    channel: vi.fn().mockReturnValue(channel),
    removeChannel: vi.fn(),
    functions: { invoke: vi.fn() },
    auth: { getUser: vi.fn() },
    _chain: chain,
    _channel: channel,
  };
}
```

Per-test usage:

```typescript
vi.mock('../../lib/supabase', () => ({ supabase: createSupabaseMock() }));
// then in tests, cast back and customize:
const mocked = supabase as unknown as ReturnType<typeof createSupabaseMock>;
mocked._chain.then = (resolve: (v: unknown) => void) => resolve({ data: [...], error: null });
```

The mock's `then` assignment is the small ugliness of mocking a Supabase Postgrest chain that's awaitable. It's contained in one place; the alternative (`vitest-mock-extended` etc.) is a bigger dependency for marginal cleanup.

### 3. `app/src/lib/errors.test.ts`

Three `describe` blocks mirroring the three matcher families in `errorCode()`:

- **SQLSTATE-driven** (~7 cases): `23514 + items_title_check → titleTooLong`, `23514 + profiles_handle_format → handleInvalidFormat`, `23514 fallthrough → generic`, `23505 + profiles_handle_key → handleTaken`, `23505 generic → duplicate`, `23503 → foreignKey`, `42501 → permissionDenied`.

- **RAISE EXCEPTION P0001** (~11 cases via `it.each`): one row per exception message currently in `matchMessage()`.

- **Message-fragment fallback** (~10 cases via `it.each`): `blocked_host`, `private_address`, `too_many_redirects`, `unsupported_protocol` all → `urlNotAllowed`; `file_too_large` → `photoTooLarge`; `unsupported_type` → `photoBadType`; `Failed to fetch` / `NetworkError` → `network`; `not authenticated` → `notAuthenticated`; `row-level security` → `permissionDenied`.

- **Fallthrough** (~5 cases): `null`/`undefined`/empty string → `generic`; unknown SQLSTATE → `generic`; plain string → `matchMessage`.

- **`errorMessage(t, err)`** (~2 cases): localizes via injected `t`; uses the result of `errorCode`.

Total: ~35 cases. Each case is one assertion. Implementation effort: 1-2 hours.

### 4. Four RTL/hook tests

#### `useMyItems.test.tsx` (~4 cases)

- `loads items on mount` — happy path; assert `state.kind === 'fetched'` and `state.items` matches the canned data.
- `surfaces Postgrest error mapped through errorCode` — error `{ code: '42501' }` arrives; assert `state.kind === 'error'` and the error message routes through `errorMessage(t, ...)` to `permissionDenied`.
- `realtime subscription is set up and torn down` — assert `supabase.channel(...).subscribe()` called on mount, `removeChannel(channel)` called on unmount.
- `re-fetches when realtime emits change` — fire the captured `on('postgres_changes')` handler manually; assert a second `.from('items')` call happens.

Render via `renderHook` from `@testing-library/react`. Wrap in an `AuthProvider` mock that supplies a fixed `userId`.

#### `useEvent.test.tsx` (~3 cases)

- `loads event with honoree profile and items`.
- `honoreeMode detection` — when `caller.id === event.honoree_id`, the returned state exposes `mode === 'honoree'`.
- `guestMode detection` — otherwise `mode === 'guest'`.

#### `useSantaEvent.test.tsx` (~4 cases)

- `loads participants and assignments (revealed event)`.
- `runDraw calls rpc and fires send-santa-draw functions.invoke` — assert `rpc('run_santa_draw', ...)` then `functions.invoke('send-santa-draw', ...)` (best-effort, not awaited).
- `runDraw returns error from rpc` — `rpc()` resolves `{ error: {...} }`; assert returned shape `{ error: '...' }`.
- `reveal calls reveal_santa_event rpc and reloads`.

#### `ItemForm.test.tsx` (~5 cases)

- `idle → fetching → ok fills empty fields` — mock `fetchUrlMeta` to return success; click "Достать с сайта"; assert title/maker/cover fields fill.
- `does not overwrite user-typed fields` — pre-fill `title`; fetch returns a different title; assert original title kept.
- `blocked_host → metaBlocked feedback line` — mock returns `{ kind: 'error', code: 'blocked_host' }`; assert `t('add.metaBlocked')` text is in the document.
- `private_address → metaUrlNotAllowed feedback line` — same, code `private_address`; assert `t('add.metaUrlNotAllowed')`.
- `generic error → metaFetchError feedback line` — code `something_else`; assert `t('add.metaFetchError')`.

Render via `render(<ItemForm ... />)` wrapped in an `I18nProvider` mock that returns RU strings unmodified (so the test asserts the actual visible string). Mock `fetchUrlMeta` at module level.

### 5. Integration test harness (`supabase/tests/integration/`)

#### `package.json`

```json
{
  "name": "ratlist-integration-tests",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run"
  },
  "devDependencies": {
    "vitest": "^2.1.0",
    "@supabase/supabase-js": "2.45.4",
    "jose": "^5.0.0"
  }
}
```

`@supabase/supabase-js` version matches the one already in `app/package.json` (currently 2.45.4) so behaviors stay consistent.

#### `vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['*.test.ts'],
    fileParallelism: false,            // serial — seedFresh truncates global state
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
});
```

#### `helpers/env.ts`

```typescript
const url = process.env.SUPABASE_URL;
if (!url || !(url.startsWith('http://127.0.0.1:') || url.startsWith('http://localhost:'))) {
  throw new Error(`integration tests refuse to run against ${url} — local Supabase only`);
}
export const SUPABASE_URL = url;
export const ANON_KEY = process.env.SUPABASE_ANON_KEY!;
export const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
export const JWT_SECRET = process.env.SUPABASE_JWT_SECRET!;
for (const [k, v] of Object.entries({ ANON_KEY, SERVICE_ROLE_KEY, JWT_SECRET })) {
  if (!v) throw new Error(`integration tests missing env: ${k}`);
}
```

Runs at import time. Any test file's first import of `env.ts` aborts the suite if env is wrong.

#### `helpers/mintJwt.ts`

```typescript
import { SignJWT } from 'jose';
import { JWT_SECRET } from './env';

export async function mintUserJwt(
  userId: string,
  opts?: { role?: 'authenticated' | 'anon'; expiresIn?: string },
): Promise<string> {
  const secret = new TextEncoder().encode(JWT_SECRET);
  return await new SignJWT({
    sub: userId,
    role: opts?.role ?? 'authenticated',
    aud: 'authenticated',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('supabase')
    .setIssuedAt()
    .setExpirationTime(opts?.expiresIn ?? '1h')
    .sign(secret);
}
```

#### `helpers/client.ts`

```typescript
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY } from './env';
import { mintUserJwt } from './mintJwt';

export async function clientFor(userId: string) {
  const jwt = await mintUserJwt(userId);
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function adminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}
```

#### `helpers/seed.ts`

```typescript
import { adminClient } from './client';

const TEST_USERS = {
  alice:  '11111111-1111-1111-1111-111111111111',
  bob:    '22222222-2222-2222-2222-222222222222',
  carol:  '33333333-3333-3333-3333-333333333333',
  dave:   '44444444-4444-4444-4444-444444444444',
} as const;

export async function ensureTestUsers(): Promise<typeof TEST_USERS> {
  const admin = adminClient();
  for (const [name, id] of Object.entries(TEST_USERS)) {
    await admin.auth.admin.createUser({
      id,
      email: `${name}@test.local`,
      email_confirm: true,
      password: 'test-test-test',
      user_metadata: { display_name: name },
    }).catch(() => {
      // user already exists — ignore
    });
    // upsert profile row (onboarded)
    await admin.from('profiles').upsert({
      id,
      display_name: name,
      handle: `${name}_t`,
      onboarded_at: new Date().toISOString(),
    });
  }
  return TEST_USERS;
}

/**
 * Wipe transient state between tests. Keeps test users and their
 * profiles. Implemented as a SECURITY DEFINER RPC so it runs as one
 * transaction; called via service-role client.
 */
export async function truncateBetweenTests(): Promise<void> {
  const admin = adminClient();
  const { error } = await admin.rpc('truncate_test_state');
  if (error) throw new Error(`truncate_test_state failed: ${error.message}`);
}

export interface SeedContext {
  alice: string;
  bob: string;
  carol: string;
  dave: string;
  groupId: string;
  itemAliceOwns: string;
  // ... other ids depending on the file's needs (event, santa_event, etc.)
}

/**
 * High-level helper a test uses: wipes state, ensures test users,
 * inserts one group with all four members, and one item owned by alice
 * published to the group. Tests that need more (events, santa events)
 * add to this baseline.
 */
export async function seedFresh(): Promise<SeedContext> {
  await truncateBetweenTests();
  const users = await ensureTestUsers();
  // Insert one group, all four members, one item.
  // Returns the SeedContext.
}
```

The `truncate_test_state` RPC is defined as part of this work (migration in the implementation plan). It's `SECURITY DEFINER`, callable only by service role, and truncates `items`, `item_groups`, `item_photos`, `claims`, `groups`, `group_members`, `invites`, `santa_events`, `santa_participants`, `santa_exclusions`, `santa_assignments`, `events`, `event_circles`, `event_items`, `reports` — everything except `auth.*` and `profiles`. The function is gated on `current_setting('app.allow_test_truncate', true) = 'on'`, which we set via SQL at session start in CI/local, so it's impossible to accidentally invoke in prod.

### 6. The four integration test files

Each follows the same pattern:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { clientFor } from './helpers/client';
import { seedFresh } from './helpers/seed';

describe('Invariant A — claims hidden from owner', () => {
  let ctx: Awaited<ReturnType<typeof seedFresh>>;
  beforeEach(async () => { ctx = await seedFresh(); });

  it('owner does not see anyone else\'s claim on their own item', async () => {
    // ... bob claims alice's item
    const aliceClient = await clientFor(ctx.alice);
    const { data } = await aliceClient.from('claims').select('*').eq('item_id', ctx.itemAliceOwns);
    expect(data).toEqual([]);
  });
  // ... 3 more cases
});
```

Exact test list (from Section 3 of brainstorm):

**`claims-privacy.test.ts`** (4 cases):
1. owner does not see anyone's claim on their own item
2. non-owner who can see the item sees its claims
3. claim row not leaked via `items?select=*,claims(*)` embed for the owner
4. `export_my_data()` does not include claims on own items

**`santa-assignments-privacy.test.ts`** (6 cases):
1. giver sees own assignment in `collecting` / `drawn` state
2. receiver does NOT see their own assignment before reveal
3. organiser who is NOT a participant sees nothing before reveal
4. group member who did NOT join the event sees nothing
5. after reveal: all group members see all assignments
6. direct INSERT into `santa_assignments` by client is blocked

**`event-items-visibility.test.ts`** (5 cases):
1. audience member sees event_items the honoree added
2. audience member does NOT see honoree items NOT added to the event
3. non-audience user sees nothing about the event
4. honoree cannot insert into event_items pointing at someone else's item
5. honoree cannot add event_items to someone else's event

**`santa-draw.test.ts`** (6 cases):
1. produces a valid derangement (no self-gifting) for 4 participants
2. respects exclusions (alice excludes bob → alice does not give to bob)
3. rejects fewer than 2 participants
4. rejects impossible exclusion graph (2 participants, each excludes the other)
5. non-organiser caller is rejected
6. drawing twice on same event keeps status `drawn` (idempotency)

Total: 21 integration cases.

### 7. CI workflow (`.github/workflows/ci.yml`)

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  lint-build:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: app
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: 'app/package-lock.json'
      - run: npm ci
      - run: npm run lint
      - run: npx tsc -b --noEmit
      - run: npm run build

  frontend-tests:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: app
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: 'app/package-lock.json'
      - run: npm ci
      - run: npm test

  integration-tests:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - uses: denoland/setup-deno@v1
        with:
          deno-version: 'v1.x'
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - name: Start local Supabase
        run: supabase start --workdir .
      - name: Capture env from supabase status
        run: supabase status --output env >> $GITHUB_ENV
      - name: Install integration deps
        working-directory: supabase/tests/integration
        run: npm install
      - name: Run integration tests
        working-directory: supabase/tests/integration
        run: npm test
      - name: Run edge function deno tests
        working-directory: supabase/functions
        run: deno test --allow-net --allow-env
      - name: Stop Supabase
        if: always()
        run: supabase stop --workdir . --no-backup
```

Note `supabase status --output env >> $GITHUB_ENV` — bridges the dynamic local-Supabase env (URL, anon key, service role key, JWT secret) into subsequent steps without hardcoding.

`supabase/tests/integration/package.json` uses `npm install` (not `npm ci`) because we don't ship a lockfile for this directory — its dependencies are pinned in `package.json` and rare to change, and avoiding a second lockfile keeps the repo cleaner.

## Data flow

### Frontend Vitest test (jsdom)

```
test imports component → vi.mock('../../lib/supabase', ...) → renderHook/render →
component calls supabase.from(...) → mock returns canned data → assert on state
```

No network. No DB. No Docker. ~50-200ms per test, ~2-3s total.

### Integration test (node + real Supabase)

```
test imports clientFor(userId) → mintJwt signs HS256 with local JWT_SECRET →
supabase-js sends Authorization: Bearer <jwt> → PostgREST validates signature →
PostgREST executes query with auth.uid() set from jwt.sub →
RLS policies fire against real tables → response returned → assert
```

This exercises the same path the deployed frontend uses, minus the browser. RLS that breaks in this test would also break in prod.

### Edge function test (Deno)

Already exists from previous work. Pure-function tests with injectable fetcher / no network. ~100ms total.

## Error handling

- Integration tests that hit a Postgrest error should assert both `data` and `error` shape — `expect(data).toBeNull()` AND `expect(error?.code).toBe('42501')` (or similar). Tests that only check `data` would pass on a silently failing query.
- The `env.ts` guard at import time means a misconfigured runner fails the whole suite immediately, not on the first connection.
- Frontend tests should NOT swallow promise rejections inside hooks — wrap with `await act(...)` or `waitFor(...)` so unhandled rejections fail the test.

## Testing strategy

Self-referential, but worth being explicit:

- **What we test:** the contracts we don't want to silently change. Privacy invariants. Santa-draw correctness. The error mapper's stable codes.
- **What we don't test:** UI text strings (covered by i18n), framework code, types (TS does that). Realtime payload-shaping is light-touch — we test "subscription attached + cleanup", not "specific payload triggers re-render N times".
- **Mocks vs reality:** frontend tests mock supabase entirely; integration tests use real supabase; edge tests use injectable network. Each surface picks the layer that's cheap to test and meaningful.
- **Determinism:** integration tests truncate before each `it`, never run in parallel within a file. Frontend tests use fresh mocks per file (Vitest default).

## Rollout

Strict order — each commit produces working software:

1. **Commit 1**: `truncate_test_state` migration + `supabase/tests/integration/` scaffolding (package.json, vitest.config.ts, tsconfig.json, helpers/). No test files yet. CI not added yet. Locally verify `cd supabase/tests/integration && npm install && npm test` runs zero tests successfully.

2. **Commit 2**: `claims-privacy.test.ts` (Invariant A). Test the harness end-to-end first with one file. Lock the invariant.

3. **Commit 3**: `santa-assignments-privacy.test.ts` (Invariant B).

4. **Commit 4**: `event-items-visibility.test.ts` (Invariant C).

5. **Commit 5**: `santa-draw.test.ts` (run_santa_draw correctness).

6. **Commit 6**: Frontend Vitest scaffolding (config, setup, supabaseMock, package.json deps). Empty test run.

7. **Commit 7**: `errors.test.ts`.

8. **Commit 8**: Four RTL/hook test files (`useMyItems`, `useEvent`, `useSantaEvent`, `ItemForm`).

9. **Commit 9**: `.github/workflows/ci.yml`. Push to a branch first to watch CI light up, fix anything, then PR-and-merge.

Each commit is a meaningful unit. If we stop after any of them, the partial work is still useful.

## Risks and mitigations

- **`supabase start` takes 60-90 seconds in CI on cold runner.** Acceptable for now (~3-4 minutes total wall-time). If it grows, can pre-pull Docker images via `docker pull` cache step.
- **`jose` HS256 signing only works if Supabase's local JWT secret is HS256.** It is — Supabase Auth uses HS256 by default. Verified by reading `supabase status --output env`.
- **Test users in `auth.users` polluting local dev.** They have predictable UUIDs (`11111111-...`, etc.) and `@test.local` emails — easy to spot. The teardown step in integration vitest leaves them (since other tests in the same session reuse them); they get wiped by `supabase db reset` or `truncate_test_state` if needed.
- **`truncate_test_state` running in prod.** Mitigated by `current_setting('app.allow_test_truncate', true) = 'on'` guard and `SECURITY DEFINER`. Even with the function present, it refuses unless the session-local setting is on. Documented in the migration.
- **Supabase CLI version drift between local and CI.** We pin `supabase/setup-cli@v1` with `version: latest`, which means CI follows Supabase's stable line. If a future release breaks `supabase status --output env`, we pin a specific version.
- **The chainable supabase mock has a `then` hack to be awaitable.** Localized to one helper. If we hit cases where it's painful (e.g. `.select().order().limit()` awaited as a Promise), document in `supabaseMock.ts` and consider `vitest-mock-extended` later.
- **RTL setup increases initial PR size.** The Section 6 commit splits keep each PR atomic — Vitest scaffolding in commit 6 ships zero tests, so reviewers can focus on config alone.

## Out of scope (so we don't lose them)

- Playwright e2e — separate bucket later.
- Component coverage for screens beyond `ItemForm` — add as bugs surface.
- Tests for `useGroups`, `useGroupInvites`, `usePeople`, `useFriendList`.
- Coverage threshold enforcement on PRs.
- Codecov / coverage badge.
- Sentry / monitoring integration into CI.
- Database schema diff testing (does the prod schema match what migrations would build?).
- Deploy gating via GitHub Environments + approval.
- Branch protection rules (configured in GitHub UI by the user; not in code).

## Acceptance criteria

The work is done when:

1. `npm test` from `app/` runs all frontend tests in <10s, all green.
2. `npm test` from `supabase/tests/integration/` runs all 21 integration tests in <60s against local Supabase, all green.
3. `deno test --allow-net --allow-env` under `supabase/functions/` still runs the 25 existing edge tests green.
4. A push to `main` triggers the CI workflow; all three jobs run in parallel; total wall-time <5 minutes; all green.
5. A PR shows the three jobs as required status checks (set up after first successful run, GitHub UI).
6. README or CLAUDE.md (one of them) mentions the new `npm test` / `npm run test:integration` entry points so future contributors know they exist.
