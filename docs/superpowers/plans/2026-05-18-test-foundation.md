# Test Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock the three privacy invariants, Santa-draw correctness, the `errors.ts` mapper, and four hot hooks/forms behind automated tests, with a GitHub Actions CI workflow running all of it on every PR + push to main.

**Architecture:** Three independent test surfaces — frontend Vitest (jsdom + RTL with mocked supabase), integration Vitest (node + real local Supabase, JWT-minted test users), and existing Deno edge tests — wired by one GitHub Actions workflow with three parallel jobs.

**Tech Stack:** Vitest, jsdom, @testing-library/react, jose (HS256 JWT signing), Deno test, @supabase/supabase-js, GitHub Actions, supabase CLI.

**Spec:** [`docs/superpowers/specs/2026-05-18-test-foundation-design.md`](../specs/2026-05-18-test-foundation-design.md)

---

## Background notes for the implementer

You may have no context on this repo. Six things to know:

1. **Local Supabase ports are shifted** to 544xx (54421 API / 54422 DB / 54423 Studio / 54424 Mailpit) per `supabase/config.toml`. The user has another Supabase instance on the default 543xx — **do not stop it**. In CI, default ports work because there's no conflict; we read URL/key from `supabase status --output env`.
2. **TypeScript strictness** — `tsconfig.app.json` has `strict: true`, `noUncheckedIndexedAccess`, `noImplicitAny`, `verbatimModuleSyntax`. Use `import type { ... }` for type-only imports; never `any`; never `@ts-ignore`.
3. **Commit convention** — conventional-commit (`feat(area):`, `chore(area):`, `test(area):`). End every commit body with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` via heredoc. Never `--no-verify`, never `--amend`. Branch is `main`.
4. **The RLS policies + run_santa_draw already exist.** Integration tests are CHARACTERIZATION tests — they should pass on the first run against existing code. If a test fails on first run, that's a real privacy bug, not an implementation gap. Escalate to the user before making the test pass by changing test expectations.
5. **The `@supabase/supabase-js` version in `app/` is `^2.105.4`**. Match in `supabase/tests/integration/package.json` so behaviors are consistent.
6. **`supabase status --output env`** prints env vars needed by integration tests: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`. Locally, export them in your shell before running integration tests. In CI, pipe them into `$GITHUB_ENV`.

Required local prereq:
```sh
supabase start                          # if not already running
supabase status                         # confirm URL/key
```

---

## Task 1: Migration + integration scaffolding

**Files:**
- Create: `supabase/migrations/<UTC>_truncate_test_state.sql`
- Create: `supabase/tests/integration/package.json`
- Create: `supabase/tests/integration/tsconfig.json`
- Create: `supabase/tests/integration/vitest.config.ts`
- Create: `supabase/tests/integration/helpers/env.ts`
- Create: `supabase/tests/integration/helpers/mintJwt.ts`
- Create: `supabase/tests/integration/helpers/client.ts`
- Create: `supabase/tests/integration/helpers/seed.ts`
- Create: `supabase/tests/integration/.gitignore`

- [ ] **Step 1: Generate a UTC timestamp for the migration filename**

```sh
date -u +"%Y%m%d%H%M%S"
```

Save the value (e.g. `20260518104500`) and use it as the prefix in step 2.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/<TS>_truncate_test_state.sql` (replace `<TS>` with the value from step 1):

```sql
-- supabase/migrations/<TS>_truncate_test_state.sql
--
-- A SECURITY DEFINER RPC the integration test harness calls between
-- tests to wipe transient state. Restricted by a session-local guard
-- so it physically cannot run in prod: the caller must SET
-- `app.allow_test_truncate = 'on'` for the current session/transaction
-- before invoking. CI does that via the integration test setup; prod
-- never does.
--
-- Resets every table populated by user activity. Keeps `profiles` so
-- test users persist across tests in a single run. Keeps `auth.users`
-- entirely (test users are owned by Supabase Auth).

create or replace function public.truncate_test_state()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('app.allow_test_truncate', true), '') <> 'on' then
    raise exception 'truncate_test_state refused — app.allow_test_truncate is not on';
  end if;

  truncate table
    public.santa_assignments,
    public.santa_exclusions,
    public.santa_participants,
    public.santa_events,
    public.event_items,
    public.event_circles,
    public.events,
    public.claims,
    public.item_photos,
    public.item_groups,
    public.items,
    public.invites,
    public.group_members,
    public.groups,
    public.reports
    restart identity
    cascade;
end;
$$;

comment on function public.truncate_test_state() is
  'Integration-test-only. Wipes user-activity tables. Refuses unless app.allow_test_truncate = on for the session.';

revoke all on function public.truncate_test_state() from public, anon, authenticated;
grant execute on function public.truncate_test_state() to service_role;
```

- [ ] **Step 3: Apply migration locally**

```sh
supabase migration up --local
```

Expected: no errors. The migration applies and the function is created.

- [ ] **Step 4: Verify the guard refuses without the setting**

```sh
psql 'postgresql://postgres:postgres@127.0.0.1:54422/postgres' \
  -c "select public.truncate_test_state();"
```

Expected: `ERROR: truncate_test_state refused — app.allow_test_truncate is not on`.

- [ ] **Step 5: Verify the guard accepts with the setting**

```sh
psql 'postgresql://postgres:postgres@127.0.0.1:54422/postgres' <<'SQL'
begin;
set local app.allow_test_truncate = 'on';
select public.truncate_test_state();
commit;
SQL
```

Expected: no error, function returns void.

- [ ] **Step 6: Regenerate the TS types**

```sh
supabase gen types typescript --local --schema public 2>/dev/null > app/src/types/database.ts
```

Verify: `grep -n truncate_test_state app/src/types/database.ts` shows it under the `Functions` section.

- [ ] **Step 7: Create `supabase/tests/integration/package.json`**

```json
{
  "name": "ratlist-integration-tests",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run"
  },
  "devDependencies": {
    "@supabase/supabase-js": "2.105.4",
    "@types/node": "^24.12.3",
    "jose": "^5.9.6",
    "typescript": "~6.0.2",
    "vitest": "^2.1.9"
  }
}
```

- [ ] **Step 8: Create `supabase/tests/integration/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "verbatimModuleSyntax": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["**/*.ts"]
}
```

- [ ] **Step 9: Create `supabase/tests/integration/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['*.test.ts'],
    fileParallelism: false,   // serial — seedFresh truncates global state
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
});
```

- [ ] **Step 10: Create `helpers/env.ts`**

```typescript
// supabase/tests/integration/helpers/env.ts
//
// Sanity guard for integration tests. Imported by every test file
// (transitively via client.ts). Aborts the suite immediately if the
// env points at anything other than a local Supabase instance.

const rawUrl = process.env.SUPABASE_URL;
if (!rawUrl || !(rawUrl.startsWith('http://127.0.0.1:') || rawUrl.startsWith('http://localhost:'))) {
  throw new Error(
    `integration tests refuse to run against ${rawUrl ?? '(unset)'} — local Supabase only. ` +
      `Run \`supabase status --output env\` and export the result.`,
  );
}

const required = {
  SUPABASE_URL: rawUrl,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET,
};

for (const [k, v] of Object.entries(required)) {
  if (!v) throw new Error(`integration tests missing env: ${k}`);
}

export const SUPABASE_URL = required.SUPABASE_URL;
export const ANON_KEY = required.SUPABASE_ANON_KEY!;
export const SERVICE_ROLE_KEY = required.SUPABASE_SERVICE_ROLE_KEY!;
export const JWT_SECRET = required.SUPABASE_JWT_SECRET!;
```

- [ ] **Step 11: Create `helpers/mintJwt.ts`**

```typescript
// supabase/tests/integration/helpers/mintJwt.ts
import { SignJWT } from 'jose';
import { JWT_SECRET } from './env.ts';

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

- [ ] **Step 12: Create `helpers/client.ts`**

```typescript
// supabase/tests/integration/helpers/client.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY } from './env.ts';
import { mintUserJwt } from './mintJwt.ts';

export async function clientFor(userId: string): Promise<SupabaseClient> {
  const jwt = await mintUserJwt(userId);
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

- [ ] **Step 13: Create `helpers/seed.ts`**

```typescript
// supabase/tests/integration/helpers/seed.ts
import { adminClient } from './client.ts';

export const TEST_USERS = {
  alice: '11111111-1111-1111-1111-111111111111',
  bob:   '22222222-2222-2222-2222-222222222222',
  carol: '33333333-3333-3333-3333-333333333333',
  dave:  '44444444-4444-4444-4444-444444444444',
} as const;

export type TestUserName = keyof typeof TEST_USERS;

export interface SeedContext {
  alice: string;
  bob: string;
  carol: string;
  dave: string;
  groupId: string;
  itemAliceOwns: string;
}

/**
 * Idempotently create the four test users in auth.users and upsert
 * their profiles. Safe to call repeatedly.
 */
export async function ensureTestUsers(): Promise<typeof TEST_USERS> {
  const admin = adminClient();
  for (const [name, id] of Object.entries(TEST_USERS)) {
    const { error } = await admin.auth.admin.createUser({
      id,
      email: `${name}@test.local`,
      email_confirm: true,
      password: 'test-test-test',
      user_metadata: { display_name: name },
    });
    // Code 'email_exists' / 'user_already_exists' → idempotent. Anything else throws.
    if (error && !/already|exists/i.test(error.message)) {
      throw new Error(`createUser(${name}) failed: ${error.message}`);
    }
    const { error: profErr } = await admin.from('profiles').upsert({
      id,
      display_name: name,
      handle: `${name}_t`,
      onboarded_at: new Date().toISOString(),
    });
    if (profErr) throw new Error(`upsert profile(${name}) failed: ${profErr.message}`);
  }
  return TEST_USERS;
}

/**
 * Wipe transient state. Requires the SECURITY DEFINER RPC defined in
 * the truncate_test_state migration. Wraps the call in a transaction
 * with the session-local guard set on.
 */
export async function truncateBetweenTests(): Promise<void> {
  const admin = adminClient();
  // The guard `app.allow_test_truncate = 'on'` must be set in the
  // same transaction as the function call. We use a tiny SQL wrapper
  // via the `pg_meta`-style query — supabase-js doesn't expose
  // SET LOCAL directly, so we go through the SQL editor endpoint via
  // `rpc` to a no-op SQL function. Easier: call the function with
  // service-role; configure the GUC at the role level via env.
  //
  // Simpler workaround that works: set the GUC at the database level
  // for the service_role during setup, then call the RPC normally.
  // We do that in setupGuc() below, called once per process.
  const { error } = await admin.rpc('truncate_test_state');
  if (error) throw new Error(`truncate_test_state failed: ${error.message}`);
}

/**
 * Set the GUC at the database level for the duration of the test
 * process. Called once at suite start. Idempotent.
 */
export async function setupGuc(): Promise<void> {
  const admin = adminClient();
  // Set the GUC for the `service_role` role so every connection from
  // the admin client inherits it. ALTER ROLE persists across sessions
  // until reset, which is fine for the local Supabase instance.
  // Production never has the service_role connected via this client.
  const { error } = await admin.rpc('exec_sql' as never, {
    sql: "alter role service_role set app.allow_test_truncate = 'on';",
  });
  // If the convenience RPC doesn't exist (Supabase doesn't ship one),
  // fall back to a direct psql command in the integration test runner.
  // See the per-test-file beforeAll hook in Task 2 for the fallback.
  if (error) {
    // Not an error — the test file's beforeAll will handle it.
    // Documented in the task plan.
  }
}

/**
 * High-level helper. Wipes state, ensures users, inserts one group
 * with all four members as members and alice as admin, and one item
 * owned by alice published to the group. Tests that need more (events,
 * santa events) build on this baseline.
 */
export async function seedFresh(): Promise<SeedContext> {
  await truncateBetweenTests();
  const users = await ensureTestUsers();
  const admin = adminClient();

  // Group
  const { data: grp, error: grpErr } = await admin
    .from('groups')
    .insert({ name: 'Test Circle', created_by: users.alice })
    .select('id')
    .single();
  if (grpErr || !grp) throw new Error(`insert group failed: ${grpErr?.message}`);

  // Memberships (alice is admin by default; insert others)
  const { error: memErr } = await admin.from('group_members').insert([
    { group_id: grp.id, user_id: users.alice, role: 'admin' },
    { group_id: grp.id, user_id: users.bob,   role: 'member' },
    { group_id: grp.id, user_id: users.carol, role: 'member' },
    { group_id: grp.id, user_id: users.dave,  role: 'member' },
  ]);
  if (memErr) throw new Error(`insert members failed: ${memErr.message}`);

  // One item owned by alice, published to the group
  const { data: item, error: itemErr } = await admin
    .from('items')
    .insert({ owner_id: users.alice, title: 'A test thing alice wants' })
    .select('id')
    .single();
  if (itemErr || !item) throw new Error(`insert item failed: ${itemErr?.message}`);
  const { error: igErr } = await admin
    .from('item_groups')
    .insert({ item_id: item.id, group_id: grp.id });
  if (igErr) throw new Error(`insert item_group failed: ${igErr.message}`);

  return {
    alice: users.alice,
    bob: users.bob,
    carol: users.carol,
    dave: users.dave,
    groupId: grp.id,
    itemAliceOwns: item.id,
  };
}
```

- [ ] **Step 14: Create `supabase/tests/integration/.gitignore`**

```
node_modules/
package-lock.json
```

We're intentionally not checking in a lockfile for this subpackage — its deps are pinned in package.json and rare to change; avoiding a second lockfile keeps the repo cleaner.

- [ ] **Step 15: Install integration deps locally**

```sh
cd /Users/edouard/dev/wishlist/supabase/tests/integration && npm install
```

Expected: deps resolve, `node_modules/` appears, no errors.

- [ ] **Step 16: Configure the GUC on service_role at the DB level**

The seed helper's `setupGuc()` documented that `alter role ... set` is needed. Do it manually now so all subsequent test runs work:

```sh
psql 'postgresql://postgres:postgres@127.0.0.1:54422/postgres' \
  -c "alter role service_role set app.allow_test_truncate = 'on';"
```

Expected: `ALTER ROLE`. Persisted to the local DB. CI does this in the `integration-tests` job (added in Task 12).

- [ ] **Step 17: Smoke-test the harness with a tiny inline test**

Create `supabase/tests/integration/harness.test.ts` temporarily:

```typescript
import { describe, it, expect } from 'vitest';
import { seedFresh } from './helpers/seed.ts';
import { clientFor } from './helpers/client.ts';

describe('harness smoke', () => {
  it('seeds and reads with a per-user client', async () => {
    const ctx = await seedFresh();
    const aliceClient = await clientFor(ctx.alice);
    const { data, error } = await aliceClient.from('items').select('id, title');
    expect(error).toBeNull();
    expect(data).toEqual([
      expect.objectContaining({ id: ctx.itemAliceOwns, title: 'A test thing alice wants' }),
    ]);
  });
});
```

- [ ] **Step 18: Export env and run the smoke test**

```sh
# Load env from local Supabase into the current shell
eval "$(supabase status --output env | sed 's/^/export /')"
# Verify the four vars are set
echo "URL=$SUPABASE_URL"
echo "ANON length=${#SUPABASE_ANON_KEY}"
echo "SRK length=${#SUPABASE_SERVICE_ROLE_KEY}"
echo "JWT length=${#SUPABASE_JWT_SECRET}"

cd /Users/edouard/dev/wishlist/supabase/tests/integration && npm test
```

Expected: `harness smoke > seeds and reads with a per-user client` passes. If env vars come out empty, the actual `supabase status --output env` output may use different variable names — inspect with `supabase status --output env` directly and adjust the export step.

If the JWT_SECRET name differs (older Supabase CLI used `SUPABASE_JWT_SECRET`; newer might use `JWT_SECRET`), update `helpers/env.ts` to read from the actual name and re-run.

- [ ] **Step 19: Delete the smoke test**

```sh
rm /Users/edouard/dev/wishlist/supabase/tests/integration/harness.test.ts
```

It served its purpose — the real tests follow.

- [ ] **Step 20: Commit**

```sh
git -C /Users/edouard/dev/wishlist add \
  supabase/migrations \
  supabase/tests/integration/ \
  app/src/types/database.ts
git -C /Users/edouard/dev/wishlist commit -m "$(cat <<'EOF'
feat(tests): integration test harness scaffolding

Adds the SECURITY DEFINER truncate_test_state RPC (gated on a
session-local GUC so it physically can't run in prod), and the
supabase/tests/integration/ harness — Vitest + supabase-js +
jose-minted JWTs against the local Supabase instance. No test
files yet; subsequent commits add the per-invariant suites.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Invariant A — claims privacy

**Files:**
- Create: `supabase/tests/integration/claims-privacy.test.ts`

Background: The `claims` table's SELECT policy says `not public.owns_item(item_id) and public.can_see_item(item_id)`. An item-owner viewing their own list must NEVER see who claimed what. Two sub-cases: direct query and PostgREST embedded select.

- [ ] **Step 1: Write the test file**

```typescript
// supabase/tests/integration/claims-privacy.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { clientFor, adminClient } from './helpers/client.ts';
import { seedFresh, type SeedContext } from './helpers/seed.ts';

describe('Invariant A — claims hidden from item owner', () => {
  let ctx: SeedContext;

  beforeEach(async () => {
    ctx = await seedFresh();
  });

  it('owner does not see another user\'s claim on their own item', async () => {
    // bob (group member) claims alice's item.
    const bobClient = await clientFor(ctx.bob);
    const { error: claimErr } = await bobClient
      .from('claims')
      .insert({ item_id: ctx.itemAliceOwns, user_id: ctx.bob, share: 1.0 });
    expect(claimErr).toBeNull();

    // alice (owner) reads — must see no claims.
    const aliceClient = await clientFor(ctx.alice);
    const { data: aliceView, error: aliceErr } = await aliceClient
      .from('claims')
      .select('*')
      .eq('item_id', ctx.itemAliceOwns);
    expect(aliceErr).toBeNull();
    expect(aliceView).toEqual([]);
  });

  it('non-owner who can see the item sees its claims', async () => {
    const bobClient = await clientFor(ctx.bob);
    await bobClient
      .from('claims')
      .insert({ item_id: ctx.itemAliceOwns, user_id: ctx.bob, share: 1.0 });

    // carol (group member, not owner) reads — must see the claim.
    const carolClient = await clientFor(ctx.carol);
    const { data: carolView, error: carolErr } = await carolClient
      .from('claims')
      .select('user_id')
      .eq('item_id', ctx.itemAliceOwns);
    expect(carolErr).toBeNull();
    expect(carolView).toHaveLength(1);
    expect(carolView?.[0]?.user_id).toBe(ctx.bob);
  });

  it('claim is not leaked via items?select=*,claims(*) embed (owner view)', async () => {
    const bobClient = await clientFor(ctx.bob);
    await bobClient
      .from('claims')
      .insert({ item_id: ctx.itemAliceOwns, user_id: ctx.bob, share: 1.0 });

    const aliceClient = await clientFor(ctx.alice);
    const { data, error } = await aliceClient
      .from('items')
      .select('id, claims(user_id)')
      .eq('id', ctx.itemAliceOwns);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]?.claims).toEqual([]);
  });

  it('export_my_data() does not include claims on own items for the owner', async () => {
    const bobClient = await clientFor(ctx.bob);
    await bobClient
      .from('claims')
      .insert({ item_id: ctx.itemAliceOwns, user_id: ctx.bob, share: 1.0 });

    // alice runs the export RPC. The export must contain her own claims
    // ON OTHERS' items (the my_claims field) but never reveal claims
    // anyone else made on HER items.
    const aliceClient = await clientFor(ctx.alice);
    const { data, error } = await aliceClient.rpc('export_my_data');
    expect(error).toBeNull();
    expect(data).toBeTruthy();
    // The export shape includes `my_claims` (claims alice has made on
    // others' items) — bob's claim on alice's item must NOT appear.
    const exportObj = data as Record<string, unknown>;
    const myClaims = exportObj.my_claims;
    if (Array.isArray(myClaims)) {
      for (const c of myClaims) {
        const claim = c as { user_id?: string };
        // Sanity — anything labelled "my_claims" must be alice's own.
        expect(claim.user_id ?? ctx.alice).toBe(ctx.alice);
      }
    }
    // And there's no separate field exposing other users' claims on her items.
    expect(exportObj).not.toHaveProperty('claims_on_my_items');
  });
});
```

- [ ] **Step 2: Re-export env (if your shell rotated) and run the suite**

```sh
eval "$(supabase status --output env | sed 's/^/export /')"
cd /Users/edouard/dev/wishlist/supabase/tests/integration && npm test -- claims-privacy
```

Expected: all 4 cases pass. These are characterization tests — the RLS already enforces this. If any case fails, **stop and report**: that's a real privacy bug.

- [ ] **Step 3: Commit**

```sh
git -C /Users/edouard/dev/wishlist add supabase/tests/integration/claims-privacy.test.ts
git -C /Users/edouard/dev/wishlist commit -m "$(cat <<'EOF'
test(privacy): lock invariant A — claims hidden from item owner

Four integration cases against the real local Supabase. Verifies
that the item owner cannot see anyone's claims on their own items,
that other group members can, and that the PostgREST embed shortcut
doesn't leak via items?select=*,claims(*). Also locks
export_my_data() against accidentally exposing claims on the
caller's items.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Invariant B — santa_assignments privacy

**Files:**
- Create: `supabase/tests/integration/santa-assignments-privacy.test.ts`

Background: `santa_assignments` has TWO select policies (OR'd): `giver_id = auth.uid()` OR `(event.status = 'revealed' AND viewer is_group_member of the event group)`. No INSERT/UPDATE/DELETE policies — writes only via `run_santa_draw` (SECURITY DEFINER). The organiser is blind unless they joined as a participant.

- [ ] **Step 1: Add helper for seeding a Santa event**

Append to `supabase/tests/integration/helpers/seed.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';

export interface SantaSeed {
  eventId: string;
  organiserId: string;
  participantIds: string[];
}

/**
 * Build on top of seedFresh(): create a santa_events row owned by the
 * organiser in the seeded group, and (optionally) sign up participants.
 */
export async function seedSantaEvent(
  ctx: SeedContext,
  organiser: TestUserName,
  participants: TestUserName[],
  opts?: { status?: 'collecting' | 'drawn' | 'revealed' },
): Promise<SantaSeed> {
  const admin = adminClient();
  const organiserId = ctx[organiser];
  const { data: ev, error: evErr } = await admin
    .from('santa_events')
    .insert({
      group_id: ctx.groupId,
      created_by: organiserId,
      name: 'Test Santa',
      status: opts?.status ?? 'collecting',
    })
    .select('id')
    .single();
  if (evErr || !ev) throw new Error(`insert santa_event failed: ${evErr?.message}`);

  for (const p of participants) {
    const { error } = await admin.from('santa_participants').insert({
      event_id: ev.id,
      user_id: ctx[p],
    });
    if (error) throw new Error(`insert santa_participant(${p}) failed: ${error.message}`);
  }

  return {
    eventId: ev.id,
    organiserId,
    participantIds: participants.map((p) => ctx[p]),
  };
}

/**
 * Insert a santa_assignment row directly via service role, bypassing
 * the absent INSERT policy. Used in tests that need to verify SELECT
 * visibility without running the full draw.
 */
export async function insertAssignment(
  eventId: string,
  giverId: string,
  receiverId: string,
): Promise<void> {
  const admin = adminClient();
  const { error } = await admin.from('santa_assignments').insert({
    event_id: eventId,
    giver_id: giverId,
    receiver_id: receiverId,
  });
  if (error) throw new Error(`insert assignment failed: ${error.message}`);
}
```

- [ ] **Step 2: Write the test file**

```typescript
// supabase/tests/integration/santa-assignments-privacy.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { adminClient, clientFor } from './helpers/client.ts';
import {
  seedFresh,
  seedSantaEvent,
  insertAssignment,
  type SeedContext,
  type SantaSeed,
} from './helpers/seed.ts';

describe('Invariant B — santa_assignments giver-only until reveal', () => {
  let ctx: SeedContext;

  beforeEach(async () => {
    ctx = await seedFresh();
  });

  it('giver sees own assignment in collecting/drawn state', async () => {
    const santa = await seedSantaEvent(ctx, 'alice', ['alice', 'bob', 'carol'], { status: 'drawn' });
    await insertAssignment(santa.eventId, ctx.bob, ctx.carol);

    const bobClient = await clientFor(ctx.bob);
    const { data, error } = await bobClient
      .from('santa_assignments')
      .select('giver_id, receiver_id')
      .eq('event_id', santa.eventId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]).toEqual({ giver_id: ctx.bob, receiver_id: ctx.carol });
  });

  it('receiver does NOT see their own assignment before reveal', async () => {
    const santa = await seedSantaEvent(ctx, 'alice', ['alice', 'bob', 'carol'], { status: 'drawn' });
    await insertAssignment(santa.eventId, ctx.bob, ctx.carol);

    // carol is the receiver; she should see nothing.
    const carolClient = await clientFor(ctx.carol);
    const { data, error } = await carolClient
      .from('santa_assignments')
      .select('giver_id, receiver_id')
      .eq('event_id', santa.eventId)
      .eq('receiver_id', ctx.carol);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('organiser who is NOT a participant sees nothing before reveal', async () => {
    // Organiser alice did NOT join the event.
    const santa = await seedSantaEvent(ctx, 'alice', ['bob', 'carol', 'dave'], { status: 'drawn' });
    await insertAssignment(santa.eventId, ctx.bob, ctx.carol);
    await insertAssignment(santa.eventId, ctx.carol, ctx.dave);
    await insertAssignment(santa.eventId, ctx.dave, ctx.bob);

    const aliceClient = await clientFor(ctx.alice);
    const { data, error } = await aliceClient
      .from('santa_assignments')
      .select('giver_id')
      .eq('event_id', santa.eventId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('group member who did NOT join the event sees nothing', async () => {
    const santa = await seedSantaEvent(ctx, 'alice', ['alice', 'bob', 'carol'], { status: 'drawn' });
    await insertAssignment(santa.eventId, ctx.bob, ctx.carol);

    // dave is in the group but did not participate.
    const daveClient = await clientFor(ctx.dave);
    const { data, error } = await daveClient
      .from('santa_assignments')
      .select('giver_id')
      .eq('event_id', santa.eventId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('after reveal, all group members see all assignments', async () => {
    const santa = await seedSantaEvent(ctx, 'alice', ['alice', 'bob', 'carol'], { status: 'collecting' });
    await insertAssignment(santa.eventId, ctx.alice, ctx.bob);
    await insertAssignment(santa.eventId, ctx.bob, ctx.carol);
    await insertAssignment(santa.eventId, ctx.carol, ctx.alice);

    // Flip status to 'revealed' as admin (avoids the reveal RPC's own checks).
    const admin = adminClient();
    await admin.from('santa_events').update({ status: 'revealed' }).eq('id', santa.eventId);

    // dave is in the group but didn't join — should still see after reveal.
    const daveClient = await clientFor(ctx.dave);
    const { data, error } = await daveClient
      .from('santa_assignments')
      .select('giver_id, receiver_id')
      .eq('event_id', santa.eventId);
    expect(error).toBeNull();
    expect(data).toHaveLength(3);
  });

  it('direct INSERT into santa_assignments by client is blocked (writes only via SECURITY DEFINER)', async () => {
    const santa = await seedSantaEvent(ctx, 'alice', ['alice', 'bob'], { status: 'drawn' });

    const aliceClient = await clientFor(ctx.alice);
    const { data, error } = await aliceClient.from('santa_assignments').insert({
      event_id: santa.eventId,
      giver_id: ctx.alice,
      receiver_id: ctx.bob,
    });
    expect(data).toBeNull();
    expect(error).toBeTruthy();
    // RLS rejection — exact code may be '42501' insufficient_privilege.
    expect(error?.code).toBe('42501');
  });
});
```

- [ ] **Step 3: Run the suite**

```sh
cd /Users/edouard/dev/wishlist/supabase/tests/integration && npm test -- santa-assignments-privacy
```

Expected: all 6 cases pass. If any fails — real privacy bug, stop and escalate.

- [ ] **Step 4: Commit**

```sh
git -C /Users/edouard/dev/wishlist add \
  supabase/tests/integration/helpers/seed.ts \
  supabase/tests/integration/santa-assignments-privacy.test.ts
git -C /Users/edouard/dev/wishlist commit -m "$(cat <<'EOF'
test(privacy): lock invariant B — santa_assignments giver-only

Six integration cases covering the giver-sees-self path, receiver
blindness before reveal, organiser blindness when not joined as
participant, post-reveal full visibility to group members, and the
blocked direct INSERT (writes must flow through run_santa_draw).

Also adds seedSantaEvent + insertAssignment helpers in seed.ts.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Invariant C — event_items visibility through audience circles

**Files:**
- Create: `supabase/tests/integration/event-items-visibility.test.ts`

Background: `items` has a new SELECT policy that exposes the honoree's item to any group member of an `event_circles.group_id` IF the item is on `event_items` and the event is owned by the honoree. Three deliberate acts (own event, own item, published to audience circle) needed; cross-sharing must be impossible.

- [ ] **Step 1: Add event seed helper**

Append to `supabase/tests/integration/helpers/seed.ts`:

```typescript
export interface EventSeed {
  eventId: string;
  honoreeId: string;
}

export async function seedEvent(
  ctx: SeedContext,
  honoree: TestUserName,
  opts?: { audienceGroups?: string[]; curatedItems?: string[] },
): Promise<EventSeed> {
  const admin = adminClient();
  const honoreeId = ctx[honoree];
  const { data: ev, error: evErr } = await admin
    .from('events')
    .insert({
      honoree_id: honoreeId,
      title: 'Birthday test',
      occurs_on: '2026-12-01',
    })
    .select('id')
    .single();
  if (evErr || !ev) throw new Error(`insert event failed: ${evErr?.message}`);

  for (const groupId of opts?.audienceGroups ?? []) {
    const { error } = await admin
      .from('event_circles')
      .insert({ event_id: ev.id, group_id: groupId });
    if (error) throw new Error(`insert event_circle failed: ${error.message}`);
  }
  for (const itemId of opts?.curatedItems ?? []) {
    const { error } = await admin
      .from('event_items')
      .insert({ event_id: ev.id, item_id: itemId });
    if (error) throw new Error(`insert event_item failed: ${error.message}`);
  }

  return { eventId: ev.id, honoreeId };
}
```

- [ ] **Step 2: Write the test file**

```typescript
// supabase/tests/integration/event-items-visibility.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { adminClient, clientFor } from './helpers/client.ts';
import { seedFresh, seedEvent, type SeedContext } from './helpers/seed.ts';

describe('Invariant C — event_items visibility through audience circles', () => {
  let ctx: SeedContext;

  beforeEach(async () => {
    ctx = await seedFresh();
  });

  it('audience member sees event_items the honoree added', async () => {
    // alice's item is on her event, audience includes the seeded group (bob is in).
    const ev = await seedEvent(ctx, 'alice', {
      audienceGroups: [ctx.groupId],
      curatedItems: [ctx.itemAliceOwns],
    });
    const bobClient = await clientFor(ctx.bob);
    const { data, error } = await bobClient
      .from('event_items')
      .select('event_id, item_id')
      .eq('event_id', ev.eventId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]?.item_id).toBe(ctx.itemAliceOwns);
  });

  it('audience member does NOT see honoree items not added to the event', async () => {
    // alice has TWO items; only one is on the event.
    const admin = adminClient();
    const { data: item2, error: i2err } = await admin
      .from('items')
      .insert({ owner_id: ctx.alice, title: 'Second alice item, NOT on event' })
      .select('id')
      .single();
    expect(i2err).toBeNull();

    const ev = await seedEvent(ctx, 'alice', {
      audienceGroups: [ctx.groupId],
      curatedItems: [ctx.itemAliceOwns],
    });

    const bobClient = await clientFor(ctx.bob);
    const { data, error } = await bobClient
      .from('items')
      .select('id')
      .in('id', [ctx.itemAliceOwns, item2!.id]);
    expect(error).toBeNull();
    // bob sees ONLY the on-event item. (item2 is not in item_groups for
    // bob's group, and not on event_items.)
    const ids = data?.map((r) => r.id);
    expect(ids).toContain(ctx.itemAliceOwns);
    expect(ids).not.toContain(item2!.id);
  });

  it('non-audience user sees nothing about the event', async () => {
    // Create a SECOND group only carol is in. Use that as audience.
    const admin = adminClient();
    const { data: priv, error: pgErr } = await admin
      .from('groups')
      .insert({ name: 'Private circle', created_by: ctx.carol })
      .select('id')
      .single();
    expect(pgErr).toBeNull();
    await admin.from('group_members').insert({
      group_id: priv!.id,
      user_id: ctx.carol,
      role: 'admin',
    });

    const ev = await seedEvent(ctx, 'alice', {
      audienceGroups: [priv!.id],
      curatedItems: [ctx.itemAliceOwns],
    });

    // bob is NOT in the private group; should see nothing.
    const bobClient = await clientFor(ctx.bob);
    const { data: events, error: eErr } = await bobClient
      .from('events')
      .select('id')
      .eq('id', ev.eventId);
    expect(eErr).toBeNull();
    expect(events).toEqual([]);
  });

  it('honoree cannot insert into event_items pointing at someone else\'s item', async () => {
    // bob owns an item; alice creates an event and tries to attach bob's item.
    const admin = adminClient();
    const { data: bobItem, error: bErr } = await admin
      .from('items')
      .insert({ owner_id: ctx.bob, title: 'Bob owns this' })
      .select('id')
      .single();
    expect(bErr).toBeNull();
    const ev = await seedEvent(ctx, 'alice');

    const aliceClient = await clientFor(ctx.alice);
    const { data, error } = await aliceClient
      .from('event_items')
      .insert({ event_id: ev.eventId, item_id: bobItem!.id });
    expect(data).toBeNull();
    expect(error).toBeTruthy();
    expect(error?.code).toBe('42501');
  });

  it('honoree cannot add event_items to someone else\'s event', async () => {
    const ev = await seedEvent(ctx, 'bob'); // bob owns the event
    // alice tries to insert one of her items into bob's event.
    const aliceClient = await clientFor(ctx.alice);
    const { data, error } = await aliceClient
      .from('event_items')
      .insert({ event_id: ev.eventId, item_id: ctx.itemAliceOwns });
    expect(data).toBeNull();
    expect(error).toBeTruthy();
    expect(error?.code).toBe('42501');
  });
});
```

- [ ] **Step 3: Run the suite**

```sh
cd /Users/edouard/dev/wishlist/supabase/tests/integration && npm test -- event-items-visibility
```

Expected: 5 cases pass.

- [ ] **Step 4: Commit**

```sh
git -C /Users/edouard/dev/wishlist add \
  supabase/tests/integration/helpers/seed.ts \
  supabase/tests/integration/event-items-visibility.test.ts
git -C /Users/edouard/dev/wishlist commit -m "$(cat <<'EOF'
test(privacy): lock invariant C — event_items audience visibility

Five integration cases: audience member sees on-event items;
items NOT on the event stay invisible; non-audience users see
nothing about the event; honoree can't bundle someone else's item;
non-honoree can't add items to an event.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `run_santa_draw` correctness

**Files:**
- Create: `supabase/tests/integration/santa-draw.test.ts`

Background: `run_santa_draw` is a `SECURITY DEFINER` Postgres function. Derangement (no self-gifting) + respects `santa_exclusions` + organiser-only. Throws `too_few_participants` if <2; `no_valid_assignment` if exclusions make it impossible.

- [ ] **Step 1: Add exclusion helper**

Append to `supabase/tests/integration/helpers/seed.ts`:

```typescript
export async function insertExclusion(
  eventId: string,
  excluderId: string,
  excludedId: string,
): Promise<void> {
  const admin = adminClient();
  const { error } = await admin.from('santa_exclusions').insert({
    event_id: eventId,
    user_id: excluderId,
    excluded_user_id: excludedId,
  });
  if (error) throw new Error(`insert exclusion failed: ${error.message}`);
}
```

- [ ] **Step 2: Write the test file**

```typescript
// supabase/tests/integration/santa-draw.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { adminClient, clientFor } from './helpers/client.ts';
import {
  seedFresh,
  seedSantaEvent,
  insertExclusion,
  type SeedContext,
} from './helpers/seed.ts';

describe('run_santa_draw correctness', () => {
  let ctx: SeedContext;

  beforeEach(async () => {
    ctx = await seedFresh();
  });

  it('produces a valid derangement (no self-gifting) for 4 participants', async () => {
    const santa = await seedSantaEvent(ctx, 'alice', ['alice', 'bob', 'carol', 'dave']);
    const aliceClient = await clientFor(ctx.alice);
    const { error } = await aliceClient.rpc('run_santa_draw', { _event_id: santa.eventId });
    expect(error).toBeNull();

    // Read all assignments via service role (giver-only SELECT policy).
    const admin = adminClient();
    const { data, error: aErr } = await admin
      .from('santa_assignments')
      .select('giver_id, receiver_id')
      .eq('event_id', santa.eventId);
    expect(aErr).toBeNull();
    expect(data).toHaveLength(4);
    for (const a of data ?? []) {
      expect(a.giver_id).not.toBe(a.receiver_id);
    }
    // Every giver appears exactly once; every receiver appears exactly once.
    const givers = new Set((data ?? []).map((r) => r.giver_id));
    const receivers = new Set((data ?? []).map((r) => r.receiver_id));
    expect(givers.size).toBe(4);
    expect(receivers.size).toBe(4);
  });

  it('respects exclusions (alice excludes bob → alice does not give to bob)', async () => {
    const santa = await seedSantaEvent(ctx, 'alice', ['alice', 'bob', 'carol', 'dave']);
    await insertExclusion(santa.eventId, ctx.alice, ctx.bob);

    const aliceClient = await clientFor(ctx.alice);
    const { error } = await aliceClient.rpc('run_santa_draw', { _event_id: santa.eventId });
    expect(error).toBeNull();

    const admin = adminClient();
    const { data } = await admin
      .from('santa_assignments')
      .select('giver_id, receiver_id')
      .eq('event_id', santa.eventId);
    const aliceAssignment = (data ?? []).find((a) => a.giver_id === ctx.alice);
    expect(aliceAssignment).toBeTruthy();
    expect(aliceAssignment?.receiver_id).not.toBe(ctx.bob);
  });

  it('rejects fewer than 2 participants', async () => {
    const santa = await seedSantaEvent(ctx, 'alice', ['alice']);
    const aliceClient = await clientFor(ctx.alice);
    const { error } = await aliceClient.rpc('run_santa_draw', { _event_id: santa.eventId });
    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/too_few_participants/);
  });

  it('rejects impossible exclusion graph', async () => {
    // 2 participants, each excludes the other → no valid pairing.
    const santa = await seedSantaEvent(ctx, 'alice', ['alice', 'bob']);
    await insertExclusion(santa.eventId, ctx.alice, ctx.bob);
    await insertExclusion(santa.eventId, ctx.bob, ctx.alice);
    const aliceClient = await clientFor(ctx.alice);
    const { error } = await aliceClient.rpc('run_santa_draw', { _event_id: santa.eventId });
    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/no_valid_assignment/);
  });

  it('non-organiser caller is rejected', async () => {
    const santa = await seedSantaEvent(ctx, 'alice', ['alice', 'bob', 'carol']);
    const bobClient = await clientFor(ctx.bob);
    const { error } = await bobClient.rpc('run_santa_draw', { _event_id: santa.eventId });
    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/not_organi[sz]er/);
  });

  it('drawing twice keeps status drawn (wrong_status second time)', async () => {
    const santa = await seedSantaEvent(ctx, 'alice', ['alice', 'bob', 'carol']);
    const aliceClient = await clientFor(ctx.alice);
    const first = await aliceClient.rpc('run_santa_draw', { _event_id: santa.eventId });
    expect(first.error).toBeNull();

    const second = await aliceClient.rpc('run_santa_draw', { _event_id: santa.eventId });
    expect(second.error).toBeTruthy();
    expect(second.error?.message).toMatch(/wrong_status/);

    const admin = adminClient();
    const { data: ev } = await admin
      .from('santa_events')
      .select('status')
      .eq('id', santa.eventId)
      .maybeSingle();
    expect(ev?.status).toBe('drawn');
  });
});
```

- [ ] **Step 3: Run the suite**

```sh
cd /Users/edouard/dev/wishlist/supabase/tests/integration && npm test -- santa-draw
```

Expected: 6 cases pass.

- [ ] **Step 4: Commit**

```sh
git -C /Users/edouard/dev/wishlist add \
  supabase/tests/integration/helpers/seed.ts \
  supabase/tests/integration/santa-draw.test.ts
git -C /Users/edouard/dev/wishlist commit -m "$(cat <<'EOF'
test(santa): lock run_santa_draw correctness

Six integration cases: valid derangement, exclusion respect,
too-few-participants, impossible exclusion graph,
non-organiser rejection, idempotency on second draw.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Frontend Vitest scaffolding

**Files:**
- Modify: `app/package.json`
- Create: `app/vitest.config.ts`
- Create: `app/vitest.setup.ts`
- Create: `app/src/test/supabaseMock.ts`

- [ ] **Step 1: Add devDependencies to `app/package.json`**

Open `app/package.json`. Find the `"devDependencies"` block. Add (preserving alphabetical order roughly, JSON syntax valid):

```json
"@testing-library/jest-dom": "^6.6.4",
"@testing-library/react": "^16.3.0",
"@testing-library/user-event": "^14.6.1",
"jsdom": "^25.0.1",
"vitest": "^2.1.9",
```

Add `"test"` and `"test:watch"` and `"test:integration"` to `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:integration": "cd ../supabase/tests/integration && npm test",
"test:edge": "cd ../supabase/functions && deno test --allow-net --allow-env"
```

(`test:edge` already exists — leave it; place the new ones before/around it as you prefer.)

- [ ] **Step 2: Install**

```sh
cd /Users/edouard/dev/wishlist/app && npm install
```

Expected: deps resolve, `package-lock.json` updates.

- [ ] **Step 3: Create `app/vitest.config.ts`**

```typescript
// app/vitest.config.ts
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

- [ ] **Step 4: Create `app/vitest.setup.ts`**

```typescript
// app/vitest.setup.ts
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(cleanup);
```

- [ ] **Step 5: Create `app/src/test/supabaseMock.ts`**

```typescript
// app/src/test/supabaseMock.ts
//
// Shared chainable mock for the supabase client. Hook/component tests
// import this, replace the module with `vi.mock('../../lib/supabase', ...)`,
// and customize the terminal calls (`maybeSingle`, `single`, the
// awaitable `then`) per test.
import { vi } from 'vitest';

export type SupabaseMock = ReturnType<typeof createSupabaseMock>;

export function createSupabaseMock() {
  // The Postgrest chain. Most methods return `this` for chaining;
  // terminal methods (`maybeSingle`, `single`) resolve. The `then`
  // property makes the chain itself awaitable for queries that don't
  // call a terminal method — assign it per-test to control resolution.
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    neq: vi.fn(),
    in: vi.fn(),
    is: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    upsert: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    then: undefined as unknown,
  };
  // Wire each chainable method to return the chain itself.
  for (const k of ['select','eq','neq','in','is','order','limit','update','insert','delete','upsert'] as const) {
    chain[k].mockReturnValue(chain);
  }

  const channel = {
    on: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  };
  channel.on.mockReturnValue(channel);
  channel.subscribe.mockReturnValue(channel);

  return {
    from: vi.fn().mockReturnValue(chain),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    channel: vi.fn().mockReturnValue(channel),
    removeChannel: vi.fn(),
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
    _chain: chain,
    _channel: channel,
  };
}
```

- [ ] **Step 6: Verify Vitest boots with zero tests**

```sh
cd /Users/edouard/dev/wishlist/app && npm test
```

Expected: Vitest exits cleanly with "No test files found" (or "0 tests"). The exit code should be 0 — Vitest treats no-tests as a soft warning, not a failure. If it fails with exit 1, add `--passWithNoTests` to the script or skip this verification and check after Task 7's tests land.

If Vitest exit is non-zero, edit the script to: `"test": "vitest run --passWithNoTests"`.

- [ ] **Step 7: Commit**

```sh
git -C /Users/edouard/dev/wishlist add \
  app/package.json \
  app/package-lock.json \
  app/vitest.config.ts \
  app/vitest.setup.ts \
  app/src/test/supabaseMock.ts
git -C /Users/edouard/dev/wishlist commit -m "$(cat <<'EOF'
chore(tests): vitest + RTL scaffolding for frontend

Adds vitest + jsdom + @testing-library/* devDeps, vitest config
(jsdom env, RTL setup), and a shared chainable supabase mock used
by upcoming hook/form tests. No tests yet — subsequent commits add
errors.ts + four RTL/hook files.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `errors.ts` unit tests

**Files:**
- Create: `app/src/lib/errors.test.ts`

The file under test is `app/src/lib/errors.ts`. Read it once before writing tests so the per-case inputs match the actual matcher.

- [ ] **Step 1: Write the test file**

```typescript
// app/src/lib/errors.test.ts
import { describe, it, expect } from 'vitest';
import { errorCode, errorMessage } from './errors';

describe('errorCode', () => {
  describe('SQLSTATE-driven', () => {
    it('23514 + items_title_check → titleTooLong', () => {
      expect(errorCode({ code: '23514', message: 'violates items_title_check' }))
        .toBe('titleTooLong');
    });
    it('23514 + profiles_handle_format → handleInvalidFormat', () => {
      expect(errorCode({ code: '23514', message: 'violates profiles_handle_format' }))
        .toBe('handleInvalidFormat');
    });
    it('23514 fallthrough → generic', () => {
      expect(errorCode({ code: '23514', message: 'some other check' })).toBe('generic');
    });
    it('23505 + profiles_handle_key → handleTaken', () => {
      expect(errorCode({ code: '23505', message: 'duplicate key value violates unique constraint "profiles_handle_key"' }))
        .toBe('handleTaken');
    });
    it('23505 generic → duplicate', () => {
      expect(errorCode({ code: '23505', message: 'duplicate key' })).toBe('duplicate');
    });
    it('23503 → foreignKey', () => {
      expect(errorCode({ code: '23503', message: 'fk violation' })).toBe('foreignKey');
    });
    it('42501 → permissionDenied', () => {
      expect(errorCode({ code: '42501', message: 'rls denial' })).toBe('permissionDenied');
    });
  });

  describe('RAISE EXCEPTION (P0001)', () => {
    it.each([
      ['invite_not_found',     'inviteNotFound'],
      ['invite_expired',       'inviteExpired'],
      ['invite_already_used',  'inviteUsed'],
      ['last_admin',           'lastAdmin'],
      ['sole_admin_of_groups', 'soleAdminGroups'],
      ['too_few_participants', 'santaTooFew'],
      ['no_valid_assignment',  'santaNoValid'],
      ['wrong_status',         'santaWrongStatus'],
      ['not_organiser',        'santaNotOrganiser'],
      ['not_organizer',        'santaNotOrganiser'],
      ['cannot_reveal',        'santaCannotReveal'],
      ['display_name_required','displayNameRequired'],
    ] as const)('%s → %s', (msg, expected) => {
      expect(errorCode({ code: 'P0001', message: msg })).toBe(expected);
    });
  });

  describe('message-fragment fallback (no SQLSTATE)', () => {
    it.each([
      ['blocked_host',         'urlNotAllowed'],
      ['private_address',      'urlNotAllowed'],
      ['too_many_redirects',   'urlNotAllowed'],
      ['unsupported_protocol', 'urlNotAllowed'],
      ['file_too_large',       'photoTooLarge'],
      ['unsupported_type',     'photoBadType'],
      ['Failed to fetch',      'network'],
      ['NetworkError',         'network'],
      ['not authenticated',    'notAuthenticated'],
      ['row-level security',   'permissionDenied'],
      ['items_title_check',    'titleTooLong'],
      ['profiles_handle_format','handleInvalidFormat'],
    ] as const)('%s → %s', (msg, expected) => {
      expect(errorCode({ message: msg })).toBe(expected);
    });
  });

  describe('fallthrough', () => {
    it('null → generic', () => {
      expect(errorCode(null)).toBe('generic');
    });
    it('undefined → generic', () => {
      expect(errorCode(undefined)).toBe('generic');
    });
    it('empty string → generic', () => {
      expect(errorCode('')).toBe('generic');
    });
    it('unknown SQLSTATE → generic', () => {
      expect(errorCode({ code: '99999', message: 'whatever' })).toBe('generic');
    });
    it('plain string err → matches via matchMessage', () => {
      expect(errorCode('invite_not_found')).toBe('inviteNotFound');
    });
    it('plain unknown string → generic', () => {
      expect(errorCode('random text we do not match')).toBe('generic');
    });
  });
});

describe('errorMessage', () => {
  it('returns localized string via t (using mapped code)', () => {
    const t = (k: string) => `[${k}]`;
    expect(errorMessage(t, { code: '42501' })).toBe('[errors.permissionDenied]');
  });

  it('routes generic for null', () => {
    const t = (k: string) => `[${k}]`;
    expect(errorMessage(t, null)).toBe('[errors.generic]');
  });
});
```

- [ ] **Step 2: Run the suite**

```sh
cd /Users/edouard/dev/wishlist/app && npm test -- errors
```

Expected: all tests pass. Count should be ~35 (the it.each counts as N cases).

If any case fails: read `app/src/lib/errors.ts` and reconcile. Possible mismatches: a message fragment isn't exactly what the matcher expects (e.g. case sensitivity on `Row-Level Security`). Adjust the input to match the matcher, NOT the matcher to match the test — the matcher's behavior is the contract.

- [ ] **Step 3: Commit**

```sh
git -C /Users/edouard/dev/wishlist add app/src/lib/errors.test.ts
git -C /Users/edouard/dev/wishlist commit -m "$(cat <<'EOF'
test(errors): lock errors.ts mapper contract

~35 cases covering every branch of errorCode() — SQLSTATE-driven
matchers, P0001 RAISE EXCEPTION payloads, message-fragment fallback,
and fallthrough behaviour. Plus a small errorMessage() suite that
verifies localisation routing.

Adding a new AppErrorCode in the future now requires a new test
case here, locking the mapping contract.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `useMyItems` RTL test

**Files:**
- Create: `app/src/items/__tests__/useMyItems.test.tsx`

Background (already verified): `useMyItems` exports `useMyItems()` and uses `loadItems(userId)` internally. On mount: calls `supabase.auth.getUser()`, then `loadItems`, then sets up a realtime channel. On unmount: `supabase.removeChannel(channel)`.

- [ ] **Step 1: Write the test**

```typescript
// app/src/items/__tests__/useMyItems.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { createSupabaseMock, type SupabaseMock } from '../../test/supabaseMock';

// Mock the supabase module before importing the hook.
vi.mock('../../lib/supabase', () => ({
  supabase: createSupabaseMock(),
}));

import { supabase } from '../../lib/supabase';
import { useMyItems } from '../useMyItems';

const mocked = supabase as unknown as SupabaseMock;

function stubAuthUser(userId: string): void {
  mocked.auth.getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
}

function stubItemsResponse(rows: Array<Record<string, unknown>>): void {
  // Make the chain await as a final Promise — the items hook awaits
  // after `.order()`/`.eq()` without a terminal `.single()`.
  mocked._chain.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null });
}

function stubItemsError(err: { code?: string; message: string }): void {
  mocked._chain.then = (resolve: (v: unknown) => void) =>
    resolve({ data: null, error: err });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useMyItems', () => {
  it('loads items on mount (happy path)', async () => {
    stubAuthUser('user-1');
    stubItemsResponse([
      { id: 'i1', owner_id: 'user-1', title: 'A', status: 'active' },
    ]);

    const { result } = renderHook(() => useMyItems());

    await waitFor(() => {
      expect(result.current.query.kind).toBe('fetched');
    });
    if (result.current.query.kind === 'fetched') {
      expect(result.current.query.items).toHaveLength(1);
      expect(result.current.query.items[0]?.title).toBe('A');
    }
  });

  it('surfaces Postgrest error', async () => {
    stubAuthUser('user-1');
    stubItemsError({ code: '42501', message: 'permission denied' });

    const { result } = renderHook(() => useMyItems());

    await waitFor(() => {
      expect(result.current.query.kind).toBe('error');
    });
  });

  it('subscribes to realtime on mount and cleans up on unmount', async () => {
    stubAuthUser('user-1');
    stubItemsResponse([]);

    const { unmount } = renderHook(() => useMyItems());

    await waitFor(() => {
      expect(mocked.channel).toHaveBeenCalled();
      expect(mocked._channel.subscribe).toHaveBeenCalled();
    });

    unmount();
    expect(mocked.removeChannel).toHaveBeenCalledWith(mocked._channel);
  });

  it('re-fetches when realtime emits a change', async () => {
    stubAuthUser('user-1');
    stubItemsResponse([]);

    renderHook(() => useMyItems());

    await waitFor(() => expect(mocked._channel.subscribe).toHaveBeenCalled());

    const fromCallsBefore = mocked.from.mock.calls.length;

    // Capture the postgres_changes handler from the chain's `.on(...)` calls.
    // useMyItems registers one or more `.on('postgres_changes', config, handler)`.
    const onCalls = mocked._channel.on.mock.calls;
    const handler = onCalls.find((c) => c[0] === 'postgres_changes')?.[2];
    expect(handler).toBeDefined();

    await act(async () => {
      handler!({ eventType: 'INSERT', new: { id: 'i2' } });
      // give the hook's debounce / refetch a tick
      await new Promise((r) => setTimeout(r, 0));
    });

    // After the handler fires, useMyItems calls loadItems again, which
    // calls supabase.from('items') a second time.
    expect(mocked.from.mock.calls.length).toBeGreaterThan(fromCallsBefore);
  });
});
```

- [ ] **Step 2: Run the test**

```sh
cd /Users/edouard/dev/wishlist/app && npm test -- useMyItems
```

Expected: 4 cases pass.

If a test fails on the realtime case because the hook uses a slightly different handler shape: read `app/src/items/useMyItems.ts` around the `.channel(...).on(...)` call to see the exact arguments order, and adjust the test's handler arg pattern.

- [ ] **Step 3: Commit**

```sh
git -C /Users/edouard/dev/wishlist add app/src/items/__tests__/useMyItems.test.tsx
git -C /Users/edouard/dev/wishlist commit -m "$(cat <<'EOF'
test(items): useMyItems happy path, error, realtime lifecycle

Four cases: loads on mount, surfaces Postgrest error, subscribes
+ tears down realtime channel, re-fetches on incoming change.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: `useEvent` RTL test

**Files:**
- Create: `app/src/events/__tests__/useEvent.test.tsx`

Background: `useEvent(eventId)` returns `{ query, ... }`. Mode detection: when caller's `auth.getUser()` returns id matching `event.honoree_id`, mode is `'honoree'`; otherwise `'guest'`. The hook calls `loadEvent(eventId, uid)`.

- [ ] **Step 1: Write the test**

```typescript
// app/src/events/__tests__/useEvent.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createSupabaseMock, type SupabaseMock } from '../../test/supabaseMock';

vi.mock('../../lib/supabase', () => ({
  supabase: createSupabaseMock(),
}));

import { supabase } from '../../lib/supabase';
import { useEvent } from '../useEvent';

const mocked = supabase as unknown as SupabaseMock;

beforeEach(() => {
  vi.clearAllMocks();
});

function stubAuthUser(userId: string): void {
  mocked.auth.getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
}

/**
 * `useEvent.loadEvent` reads from several tables. The minimum viable
 * stub: when the hook calls `.from('events').select(...).eq('id', x).maybeSingle()`,
 * return the event row; for any other table return empty arrays via `.then`.
 */
function stubEventLoad(eventRow: Record<string, unknown>): void {
  // .maybeSingle() resolves once with the event.
  mocked._chain.maybeSingle.mockResolvedValueOnce({ data: eventRow, error: null });
  // Subsequent awaits (event_items, event_circles, etc.) get empty arrays.
  mocked._chain.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
}

describe('useEvent', () => {
  it('loads the event row and surfaces it in fetched state', async () => {
    stubAuthUser('user-1');
    stubEventLoad({
      id: 'ev-1',
      honoree_id: 'user-1',
      title: 'Birthday',
      occurs_on: '2026-12-01',
    });

    const { result } = renderHook(() => useEvent('ev-1'));

    await waitFor(() => {
      expect(result.current.query.kind).toBe('fetched');
    });
    if (result.current.query.kind === 'fetched') {
      expect(result.current.query.event.id).toBe('ev-1');
    }
  });

  it('mode is "honoree" when caller is the honoree', async () => {
    stubAuthUser('user-honoree');
    stubEventLoad({
      id: 'ev-2',
      honoree_id: 'user-honoree',
      title: 'X',
      occurs_on: '2026-12-01',
    });

    const { result } = renderHook(() => useEvent('ev-2'));

    await waitFor(() => {
      expect(result.current.query.kind).toBe('fetched');
    });
    if (result.current.query.kind === 'fetched') {
      expect(result.current.query.mode).toBe('honoree');
    }
  });

  it('mode is "guest" when caller is NOT the honoree', async () => {
    stubAuthUser('user-guest');
    stubEventLoad({
      id: 'ev-3',
      honoree_id: 'user-honoree',
      title: 'X',
      occurs_on: '2026-12-01',
    });

    const { result } = renderHook(() => useEvent('ev-3'));

    await waitFor(() => {
      expect(result.current.query.kind).toBe('fetched');
    });
    if (result.current.query.kind === 'fetched') {
      expect(result.current.query.mode).toBe('guest');
    }
  });
});
```

- [ ] **Step 2: Run the test**

```sh
cd /Users/edouard/dev/wishlist/app && npm test -- useEvent
```

Expected: 3 cases pass.

If `result.current.query` doesn't expose a `mode` field directly: read `app/src/events/useEvent.ts` for the exact shape (it might be `query.event.mode` or `result.current.mode`), and adjust the assertions.

- [ ] **Step 3: Commit**

```sh
git -C /Users/edouard/dev/wishlist add app/src/events/__tests__/useEvent.test.tsx
git -C /Users/edouard/dev/wishlist commit -m "$(cat <<'EOF'
test(events): useEvent — load + honoree/guest mode detection

Three cases: fetched state happy path, mode='honoree' when caller
is event.honoree_id, mode='guest' otherwise.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: `useSantaEvent` RTL test

**Files:**
- Create: `app/src/santa/__tests__/useSantaEvent.test.tsx`

Background: `useSantaEvent(eventId)` exposes `query` + actions including `runDraw()` (calls `rpc('run_santa_draw')` then `functions.invoke('send-santa-draw')` fire-and-forget) and `reveal()` (calls `rpc('reveal_santa_event')`).

- [ ] **Step 1: Write the test**

```typescript
// app/src/santa/__tests__/useSantaEvent.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { createSupabaseMock, type SupabaseMock } from '../../test/supabaseMock';

vi.mock('../../lib/supabase', () => ({
  supabase: createSupabaseMock(),
}));

import { supabase } from '../../lib/supabase';
import { useSantaEvent } from '../useSantaEvent';

const mocked = supabase as unknown as SupabaseMock;

beforeEach(() => {
  vi.clearAllMocks();
});

function stubAuthUser(userId: string): void {
  mocked.auth.getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
}

function stubSantaLoad(eventRow: Record<string, unknown>): void {
  mocked._chain.maybeSingle.mockResolvedValueOnce({ data: eventRow, error: null });
  mocked._chain.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
}

describe('useSantaEvent', () => {
  it('loads participants and assignments (revealed event)', async () => {
    stubAuthUser('organizer-1');
    stubSantaLoad({
      id: 'se-1',
      group_id: 'g-1',
      created_by: 'organizer-1',
      status: 'revealed',
      name: 'Test Santa',
    });

    const { result } = renderHook(() => useSantaEvent('se-1'));
    await waitFor(() => {
      expect(result.current.query.kind).toBe('fetched');
    });
  });

  it('runDraw calls rpc(run_santa_draw) and fires send-santa-draw functions.invoke', async () => {
    stubAuthUser('organizer-1');
    stubSantaLoad({
      id: 'se-2',
      group_id: 'g-1',
      created_by: 'organizer-1',
      status: 'collecting',
      name: 'Test Santa',
    });
    mocked.rpc.mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => useSantaEvent('se-2'));
    await waitFor(() => expect(result.current.query.kind).toBe('fetched'));

    await act(async () => {
      await result.current.runDraw();
    });

    expect(mocked.rpc).toHaveBeenCalledWith('run_santa_draw', { _event_id: 'se-2' });
    expect(mocked.functions.invoke).toHaveBeenCalledWith(
      'send-santa-draw',
      expect.objectContaining({ body: { event_id: 'se-2' } }),
    );
  });

  it('runDraw returns error if rpc fails', async () => {
    stubAuthUser('organizer-1');
    stubSantaLoad({
      id: 'se-3',
      group_id: 'g-1',
      created_by: 'organizer-1',
      status: 'collecting',
      name: 'Test Santa',
    });
    mocked.rpc.mockResolvedValue({ data: null, error: { message: 'too_few_participants' } });

    const { result } = renderHook(() => useSantaEvent('se-3'));
    await waitFor(() => expect(result.current.query.kind).toBe('fetched'));

    let drawResult: Awaited<ReturnType<typeof result.current.runDraw>> | undefined;
    await act(async () => {
      drawResult = await result.current.runDraw();
    });

    expect(drawResult).toEqual(expect.objectContaining({ error: expect.any(String) }));
    expect(mocked.functions.invoke).not.toHaveBeenCalled();
  });

  it('reveal calls rpc(reveal_santa_event)', async () => {
    stubAuthUser('organizer-1');
    stubSantaLoad({
      id: 'se-4',
      group_id: 'g-1',
      created_by: 'organizer-1',
      status: 'drawn',
      name: 'Test Santa',
    });
    mocked.rpc.mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => useSantaEvent('se-4'));
    await waitFor(() => expect(result.current.query.kind).toBe('fetched'));

    await act(async () => {
      await result.current.reveal();
    });

    expect(mocked.rpc).toHaveBeenCalledWith('reveal_santa_event', { _event_id: 'se-4' });
  });
});
```

- [ ] **Step 2: Run the test**

```sh
cd /Users/edouard/dev/wishlist/app && npm test -- useSantaEvent
```

Expected: 4 cases pass.

If `result.current.runDraw` or `reveal` isn't exposed exactly that way: read `app/src/santa/useSantaEvent.ts` for the exact return shape (e.g. it might be inside an `actions` object), and adjust the assertions.

- [ ] **Step 3: Commit**

```sh
git -C /Users/edouard/dev/wishlist add app/src/santa/__tests__/useSantaEvent.test.tsx
git -C /Users/edouard/dev/wishlist commit -m "$(cat <<'EOF'
test(santa): useSantaEvent — load, runDraw, runDraw-error, reveal

Four cases verifying the hook's main side-effects: load happy
path, runDraw fires rpc + send-santa-draw invoke, rpc error
short-circuits the email invoke, reveal fires the right rpc.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: `ItemForm` RTL test

**Files:**
- Create: `app/src/screens/items/__tests__/ItemForm.test.tsx`

Background: `ItemForm` has the URL-meta fetch UX added in the edge-security-hardening series. It special-cases `blocked_host` (showing `metaBlocked`) and the three SSRF codes via `urlNotAllowed` (showing `metaUrlNotAllowed`). Generic errors show `metaFetchError`.

- [ ] **Step 1: Inspect the component to confirm props + i18n key access**

```sh
grep -n "interface ItemFormProps\|export function ItemForm\|export default\|useI18n" \
  /Users/edouard/dev/wishlist/app/src/screens/items/ItemForm.tsx | head
```

Note the component's exported function name and props. The minimal RTL test will need to know the props shape (e.g. `mode`, `initialItem`, `onSubmit`, etc.) — if too complex to construct, focus only on the URL-meta interaction path by mounting the component with a "create new item" minimal prop set.

If the component is awkward to mount in isolation (e.g. it requires an AuthProvider + I18nProvider), wrap it in those providers. Examine `app/src/auth/AuthProvider` and `app/src/i18n/index.tsx` for the minimum render. Don't go too deep — if it takes more than ~30 minutes to get a mount working, scope down: keep the i18n string assertions but use looser providers / partial mock contexts.

- [ ] **Step 2: Write the test**

```typescript
// app/src/screens/items/__tests__/ItemForm.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock fetchUrlMeta before the component imports it.
vi.mock('../../../items/fetchUrlMeta', () => ({
  fetchUrlMeta: vi.fn(),
}));

// Mock the supabase client (the form might call into it for uploads,
// even though we exercise only the URL-meta path).
import { createSupabaseMock } from '../../../test/supabaseMock';
vi.mock('../../../lib/supabase', () => ({
  supabase: createSupabaseMock(),
}));

import { fetchUrlMeta } from '../../../items/fetchUrlMeta';

// The wrapper needs an i18n context. Inspect app/src/i18n/index.tsx
// for the provider's name; below assumes I18nProvider with a Russian
// dict. Adjust the import path if it differs.
import { I18nProvider } from '../../../i18n';

// Import the form last — vi.mock hoists above this.
import { ItemForm } from '../ItemForm';

const mockedFetchUrlMeta = vi.mocked(fetchUrlMeta);

beforeEach(() => {
  vi.clearAllMocks();
});

function renderForm() {
  // Render with the minimum props the form needs in create mode.
  // If the form requires more props (e.g. onSubmit, mode), pass stub
  // values. If the form requires AuthProvider, wrap with that too.
  return render(
    <I18nProvider>
      <ItemForm mode="create" onSubmit={vi.fn()} />
    </I18nProvider>,
  );
}

describe('ItemForm — fetchUrlMeta integration', () => {
  it('idle → fetching → ok fills empty fields', async () => {
    mockedFetchUrlMeta.mockResolvedValue({
      kind: 'ok',
      data: {
        title: 'Fancy mug',
        site_name: 'shop.example',
        image_url: 'https://shop.example/mug.png',
      },
    });
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByPlaceholderText(/https/i), 'https://shop.example/mug');
    await user.click(screen.getByRole('button', { name: /достать|fetch/i }));

    await waitFor(() => {
      // The form's success feedback shows which fields were filled.
      // The exact string is `add.metaFetchedNote` localised.
      // Loosely match — adjust selector if the user-visible text
      // differs in your i18n.
      expect(screen.queryByText(/title|название/i)).toBeTruthy();
    });
  });

  it('does not overwrite user-typed fields', async () => {
    mockedFetchUrlMeta.mockResolvedValue({
      kind: 'ok',
      data: { title: 'From the site' },
    });
    const user = userEvent.setup();
    renderForm();

    // Pre-fill title manually.
    const titleInput = screen.getByLabelText(/название|title/i);
    await user.type(titleInput, 'User typed this');

    await user.type(screen.getByPlaceholderText(/https/i), 'https://shop.example/');
    await user.click(screen.getByRole('button', { name: /достать|fetch/i }));

    await waitFor(() => {
      // Title should be unchanged.
      expect((titleInput as HTMLInputElement).value).toBe('User typed this');
    });
  });

  it('blocked_host → renders metaBlocked feedback', async () => {
    mockedFetchUrlMeta.mockResolvedValue({ kind: 'error', code: 'blocked_host' });
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByPlaceholderText(/https/i), 'https://blocked.example/');
    await user.click(screen.getByRole('button', { name: /достать|fetch/i }));

    await waitFor(() => {
      // RU: "с этого сайта не тянем превью..."
      expect(screen.getByText(/не тянем превью|don't fetch previews/i)).toBeInTheDocument();
    });
  });

  it('private_address → renders metaUrlNotAllowed feedback', async () => {
    mockedFetchUrlMeta.mockResolvedValue({ kind: 'error', code: 'private_address' });
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByPlaceholderText(/https/i), 'http://127.0.0.1/');
    await user.click(screen.getByRole('button', { name: /достать|fetch/i }));

    await waitFor(() => {
      // RU: "не получилось — ссылка похожа на внутренний адрес..."
      expect(screen.getByText(/внутренний адрес|internal address/i)).toBeInTheDocument();
    });
  });

  it('generic error → renders metaFetchError feedback', async () => {
    mockedFetchUrlMeta.mockResolvedValue({ kind: 'error', code: 'fetch_failed' });
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByPlaceholderText(/https/i), 'https://example.com/dead');
    await user.click(screen.getByRole('button', { name: /достать|fetch/i }));

    await waitFor(() => {
      // RU: "не получилось достать данные"
      expect(screen.getByText(/не получилось достать|couldn't fetch/i)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 3: Run the test, iterate if needed**

```sh
cd /Users/edouard/dev/wishlist/app && npm test -- ItemForm
```

Expected: 5 cases pass. If any test fails on a label/placeholder mismatch — the actual i18n strings or the form's `placeholder` / `aria-label` differs from what the test expects. Update the test's selectors to match the actual DOM.

If `<I18nProvider>` doesn't exist by that name in `app/src/i18n/`: inspect `app/src/i18n/index.tsx` for the actual provider name. The form requires whatever the `App.tsx` wraps its tree in.

- [ ] **Step 4: Commit**

```sh
git -C /Users/edouard/dev/wishlist add app/src/screens/items/__tests__/ItemForm.test.tsx
git -C /Users/edouard/dev/wishlist commit -m "$(cat <<'EOF'
test(items): ItemForm — fetchUrlMeta integration paths

Five cases: success fills empty fields, doesn't overwrite typed
fields, blocked_host → metaBlocked, private_address →
metaUrlNotAllowed, generic error → metaFetchError. Locks the
urlNotAllowed UX work added by the edge-security-hardening series.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the workflow**

```yaml
# .github/workflows/ci.yml
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
        run: supabase status --output env >> "$GITHUB_ENV"
      - name: Configure session GUC on service_role
        run: |
          PGPASSWORD=postgres psql -h 127.0.0.1 -p 54422 -U postgres -d postgres \
            -c "alter role service_role set app.allow_test_truncate = 'on';"
        # `supabase start` reads the repo's supabase/config.toml which
        # pins DB to port 54422 (shifted from default 54322 because the
        # user runs a second Supabase instance locally on the default
        # range). CI uses the same config, same port.
      - name: Install integration deps
        working-directory: supabase/tests/integration
        run: npm install
      - name: Run RLS + Santa-draw integration tests
        working-directory: supabase/tests/integration
        run: npm test
      - name: Run edge function deno tests
        working-directory: supabase/functions
        run: deno test --allow-net --allow-env
      - name: Stop Supabase
        if: always()
        run: supabase stop --workdir . --no-backup
```

- [ ] **Step 2: Push and watch a CI run**

```sh
git -C /Users/edouard/dev/wishlist add .github/workflows/ci.yml
git -C /Users/edouard/dev/wishlist commit -m "$(cat <<'EOF'
chore(ci): GitHub Actions workflow — lint+build, frontend, integration

Three parallel jobs: lint+tsc+build, frontend Vitest, integration
Vitest (with supabase start) + edge deno tests. All run on PRs and
pushes to main. Total wall-time ~3-4 minutes.

After the first green run, enable required status checks in the
repository settings (GitHub UI).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git -C /Users/edouard/dev/wishlist push origin main
```

- [ ] **Step 3: Verify the CI run**

Watch the workflow via:
```sh
gh -R Illouminus/ratlist run watch
```

Or visit the Actions tab in GitHub. The three jobs should run in parallel:
- `lint-build` — passes within ~2 minutes
- `frontend-tests` — passes within ~1 minute
- `integration-tests` — passes within ~3-4 minutes (90s for `supabase start` + tests)

If anything fails: triage by job. Common issues:
- `npm ci` failing → `package-lock.json` not committed, or out of sync with `package.json`. Run `npm install` locally, commit the updated lockfile.
- `supabase start` timing out → bump `timeout-minutes` to 20, or pre-pull images.
- Integration tests failing because env vars don't propagate → the `supabase status --output env` step uses var names that differ from `helpers/env.ts`. Run the same command locally, compare with `helpers/env.ts`, reconcile.
- The `Configure session GUC on service_role` psql step fails → port mismatch. Confirm with `supabase status` in the runner (add a debug step `- run: supabase status`).

Iterate on the workflow, push fixes, re-watch until green.

- [ ] **Step 4: Document the new commands in CLAUDE.md (optional but high-leverage)**

Open `CLAUDE.md` and find the "Quick start" or similar section. Add a line near it:

```markdown
## Testing

- Frontend unit + RTL: `cd app && npm test`
- Integration (RLS + Santa draw): `eval "$(supabase status --output env | sed 's/^/export /')"; cd supabase/tests/integration && npm test`
- Edge function Deno tests: `cd app && npm run test:edge`
- All of the above run in CI on every PR. See `.github/workflows/ci.yml`.
```

- [ ] **Step 5: Commit the docs update**

```sh
git -C /Users/edouard/dev/wishlist add CLAUDE.md
git -C /Users/edouard/dev/wishlist commit -m "$(cat <<'EOF'
docs: document test commands for the new test foundation

Adds a Testing section listing the three entry points (frontend,
integration, edge) and notes that CI runs all of them.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Configure branch protection (manual, in GitHub UI)**

This step happens in the GitHub UI, not in code. After the first green CI run on `main`:

1. Go to https://github.com/Illouminus/ratlist/settings/branches
2. Click "Add classic branch protection rule" (or edit existing main rule).
3. Branch name pattern: `main`.
4. Enable "Require status checks to pass before merging".
5. Add the three required checks: `lint-build`, `frontend-tests`, `integration-tests`.
6. Save.

This is a one-time setup. Document in your own notes that it's done.

---

## What this plan does NOT do (deferred)

- Playwright e2e — separate bucket later.
- Component coverage for screens beyond `ItemForm`.
- Tests for `useGroups`, `useGroupInvites`, `usePeople`, `useFriendList`.
- Coverage threshold gating on PRs (no `--coverage` enforcement).
- Codecov / coverage badge upload.
- Sentry release tags / monitoring integration in CI.
- Database schema diff testing (does prod schema match what migrations would build?).
- GitHub Environments + approval gating for deploys.
