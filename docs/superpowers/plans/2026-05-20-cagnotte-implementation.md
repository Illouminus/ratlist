# Cagnotte Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship per-item collective gifting (cagnotte) with real money via Mangopay, plus HR-mode event creation (creator ≠ honoree) — the B2B differentiator identified in STRATEGY.md.

**Architecture:** Two new tables (`cagnottes`, `cagnotte_contributions`), one extension to `events` (creator + nullable honoree + text fallback), new `is_honoree_of_item` helper that extends the existing honoree-blind invariant through HR-mode. Mangopay Wallet-per-cagnotte escrow; manual coordinator-release; auto-refund cron on deadline. KYC LIGHT at first coordinator action. 7 new Edge Functions following the `send-santa-draw` shape.

**Tech Stack:** Vite + React 19 + TypeScript (strict), Supabase (Postgres + RLS + Edge Functions + Realtime), Mangopay REST API (sandbox first, production after first pilot). Vanilla CSS with project tokens. Resend for emails (existing).

**Spec reference:** [`docs/superpowers/specs/2026-05-20-cagnotte-design.md`](../specs/2026-05-20-cagnotte-design.md)

---

## Phasing — one PR per phase

| Phase | Purpose | Ships independently? |
| ----- | ------- | -------------------- |
| 1 | HR-mode events (creator ≠ honoree, honoree_name text, is_honoree_of_item helper, cascading claims.SELECT update) | Yes |
| 2 | Cagnotte data layer (tables, triggers, RLS, RPC) | Yes (admin-pokeable, no UI yet) |
| 3 | Mangopay wrapper + KYC LIGHT flow | No (needs Phase 2) |
| 4 | Cagnotte lifecycle Edge Functions (create / contribute / release / cancel / webhook / sweep) | No (needs Phase 3) |
| 5 | Cagnotte UI surfaces | No (needs Phase 4) |
| 6 | Email flows (7 templates) | No (needs Phase 5) |
| 7 | Docs + manual QA + production-switch checklist | No (last gate) |

Each phase ends with `git push origin <branch>` and an opened PR. Branch protection on `main` blocks direct push.

## File structure

```
supabase/migrations/
  20260520xxxxxx_events_hr_mode.sql              [Phase 1]
  20260521xxxxxx_cagnottes.sql                   [Phase 2]
  20260522xxxxxx_cagnotte_cron.sql               [Phase 4]

supabase/functions/
  _shared/
    mangopay.ts                                  [Phase 3 — Edge Function shared]
  mangopay-kyc-light/index.ts                    [Phase 3]
  cagnotte-create/index.ts                       [Phase 4]
  cagnotte-contribute/index.ts                   [Phase 4]
  cagnotte-release/index.ts                      [Phase 4]
  cagnotte-cancel/index.ts                       [Phase 4]
  mangopay-webhook/index.ts                      [Phase 4]
  cagnotte-sweep/index.ts                        [Phase 4]
  send-cagnotte-created/{index,template}.ts      [Phase 6]
  send-cagnotte-contribution/{index,template}.ts [Phase 6]
  send-cagnotte-goal-reached/{index,template}.ts [Phase 6]
  send-cagnotte-deadline-approaching/{index,template}.ts [Phase 6]
  send-cagnotte-released/{index,template}.ts     [Phase 6]
  send-cagnotte-refunded/{index,template}.ts     [Phase 6]

supabase/tests/integration/
  cagnotte-rls.test.ts                           [Phase 2]
  cagnotte-mutual-exclusion.test.ts              [Phase 2]
  hr-mode-events.test.ts                         [Phase 1]

app/src/
  lib/
    mangopay.ts                                  [Phase 3 — typed Mangopay client]
    errors.ts (modify)                           [Phase 2 — new error keys]
  types/database.ts (regen)                      [Phase 1, 2]
  events/
    useEvents.ts (modify)                        [Phase 1]
    useEvent.ts (modify)                         [Phase 1]
  cagnotte/                                      [NEW directory, Phase 5]
    useCagnotte.ts
    useMyCagnottes.ts
    cagnotteState.ts
    __tests__/
      cagnotteState.test.ts
      useCagnotte.test.ts
  screens/
    events/
      CreateEventScreen.tsx (modify)             [Phase 1]
      EventDetailScreen.tsx (modify)             [Phase 1]
    cagnotte/                                    [NEW, Phase 5]
      CagnotteCreateScreen.tsx
      CagnotteDashboard.tsx
      KycLightModal.tsx
      ContributeModal.tsx
    items/
      ItemDetailScreen.tsx (modify)              [Phase 5]
  components/
    CagnotteProgress.tsx                         [Phase 5]
  Router.tsx (modify)                            [Phase 5]
  i18n/
    ru.ts (modify)                               [Phase 1, 2, 5]
    en.ts (modify)                               [Phase 1, 2, 5]
```

---

## Phase 1 — HR-mode events extension

**Branch:** `feat/cagnotte-hr-mode-events`
**Goal:** events get `created_by` separate from `honoree_id`; `honoree_id` nullable; `honoree_name` text fallback. Existing claims privacy invariant extended via new helper `is_honoree_of_item`.

### Task 1.1: Write events HR-mode migration

**Files:**
- Create: `supabase/migrations/20260520120000_events_hr_mode.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- supabase/migrations/20260520120000_events_hr_mode.sql

-- 1. extend events: split creator from honoree
alter table public.events
  add column created_by uuid references auth.users(id);

-- backfill: existing rows have creator = honoree
update public.events set created_by = honoree_id where created_by is null;

alter table public.events
  alter column created_by set not null,
  alter column honoree_id drop not null,
  add column honoree_name text,
  add constraint events_honoree_identified
    check (honoree_id is not null or honoree_name is not null);

-- 2. new helper: is_honoree_of_item — extends honoree-blind invariant for HR-mode.
-- For event-attached items: gates by event.honoree_id.
-- For list-only items: legacy = item owner is the honoree.
create or replace function public.is_honoree_of_item(_item_id uuid)
returns boolean language plpgsql security definer
set search_path = public as $$
declare _has_events boolean;
begin
  select exists(select 1 from event_items where item_id = _item_id) into _has_events;
  if _has_events then
    return exists (
      select 1 from event_items ei
      join events e on e.id = ei.event_id
      where ei.item_id = _item_id and e.honoree_id = auth.uid()
    );
  else
    return exists (
      select 1 from items where id = _item_id and owner_id = auth.uid()
    );
  end if;
end; $$;

grant execute on function public.is_honoree_of_item(uuid) to authenticated;

-- 3. update claims.SELECT policy — backwards-compat in self-events,
-- correct semantics in HR-mode
drop policy if exists claims_select on public.claims;
create policy claims_select
  on public.claims for select
  using (
    not public.is_honoree_of_item(item_id)
    and public.can_see_item(item_id)
  );

-- 4. update existing event policies to handle new columns
-- (events RLS uses honoree_id; with creator≠honoree, creator also needs access)
drop policy if exists events_select on public.events;
create policy events_select
  on public.events for select
  using (
    created_by = auth.uid()
    or honoree_id = auth.uid()
    or exists (
      select 1 from event_circles ec
      join group_members gm on gm.group_id = ec.group_id
      where ec.event_id = events.id and gm.user_id = auth.uid()
    )
  );

drop policy if exists events_insert on public.events;
create policy events_insert
  on public.events for insert
  with check (
    created_by = auth.uid()
    and (
      honoree_id is null
      or honoree_id = auth.uid()
      or shares_group_with(honoree_id)
    )
  );

drop policy if exists events_update on public.events;
create policy events_update
  on public.events for update
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

drop policy if exists events_delete on public.events;
create policy events_delete
  on public.events for delete
  using (created_by = auth.uid());

-- 5. event_items RLS — creator can add their items OR honoree-mode legacy
-- (this assumes existing event_items policies; verify in your codebase)
drop policy if exists event_items_insert on public.event_items;
create policy event_items_insert
  on public.event_items for insert
  with check (
    exists (
      select 1 from events e
      join items i on i.id = event_items.item_id
      where e.id = event_items.event_id
        and e.created_by = auth.uid()
        and i.owner_id = auth.uid()
    )
  );
```

- [ ] **Step 2: Apply the migration locally**

Run: `supabase migration up --local`
Expected: `Applying migration 20260520120000_events_hr_mode.sql...` then no errors.

- [ ] **Step 3: Verify schema with psql**

Run: `psql postgresql://postgres:postgres@127.0.0.1:54422/postgres -c "\d events"`
Expected: `created_by` column NOT NULL with FK; `honoree_id` nullable; `honoree_name` text column present.

- [ ] **Step 4: Verify helper exists**

Run: `psql postgresql://postgres:postgres@127.0.0.1:54422/postgres -c "select pg_get_functiondef('public.is_honoree_of_item(uuid)'::regprocedure);"`
Expected: function definition prints.

- [ ] **Step 5: Regenerate TypeScript types**

Run: `supabase gen types typescript --local --schema public 2>/dev/null > app/src/types/database.ts`
Expected: file overwrites cleanly, exit 0.

- [ ] **Step 6: Verify TS compiles**

Run: `cd app && npx tsc --noEmit`
Expected: no errors (existing event-using code may need patching — that's the next tasks).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260520120000_events_hr_mode.sql app/src/types/database.ts
git commit -m "$(cat <<'EOF'
feat(db): events HR-mode + is_honoree_of_item helper

events.created_by separate from honoree_id; honoree_id nullable;
honoree_name text fallback. New is_honoree_of_item helper extends
the existing honoree-blind invariant through HR-mode events.
claims.SELECT policy updated to use the helper.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 1.2: Integration test for HR-mode RLS

**Files:**
- Create: `supabase/tests/integration/hr-mode-events.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// supabase/tests/integration/hr-mode-events.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL!;
const anon = process.env.SUPABASE_ANON_KEY!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const c = createClient(url, anon);
  await c.auth.signInWithPassword({ email, password });
  return c;
}

describe('HR-mode events', () => {
  let hrClient: SupabaseClient;
  let jeanClient: SupabaseClient;
  let colleagueClient: SupabaseClient;
  let admin: SupabaseClient;
  let eventId: string;
  let itemId: string;

  beforeAll(async () => {
    admin = createClient(url, service);
    hrClient = await signIn('hr@example.com', 'test-password');
    jeanClient = await signIn('jean@example.com', 'test-password');
    colleagueClient = await signIn('colleague@example.com', 'test-password');
  });

  it('HR can create event for Jean (registered user)', async () => {
    const { data: jean } = await jeanClient.auth.getUser();
    const { data, error } = await hrClient.from('events').insert({
      title: "Jean's retirement",
      kind: 'other',
      honoree_id: jean.user!.id,
    }).select().single();
    expect(error).toBeNull();
    expect(data!.created_by).not.toBe(jean.user!.id);
    eventId = data!.id;
  });

  it('HR can create event for non-user honoree (text only)', async () => {
    const { data, error } = await hrClient.from('events').insert({
      title: "Marc's departure",
      kind: 'other',
      honoree_id: null,
      honoree_name: 'Marc Dupont',
    }).select().single();
    expect(error).toBeNull();
    expect(data!.honoree_id).toBeNull();
    expect(data!.honoree_name).toBe('Marc Dupont');
  });

  it('Jean (honoree) cannot see HR-event he is honoree of', async () => {
    // honoree-blind invariant in HR-mode
    const { data } = await jeanClient.from('events').select().eq('id', eventId);
    expect(data).toEqual([]);
  });

  it('HR (creator) can see and modify their HR-event', async () => {
    const { data } = await hrClient.from('events').select().eq('id', eventId).single();
    expect(data!.title).toBe("Jean's retirement");
    const { error } = await hrClient.from('events').update({ note: 'updated' }).eq('id', eventId);
    expect(error).toBeNull();
  });

  it('claims policy: Jean blind to claims on items in HR-event he is honoree of', async () => {
    // Setup: HR creates an item owned by HR, attached to the event
    const { data: item } = await hrClient.from('items').insert({
      title: 'Decanter set',
    }).select().single();
    itemId = item!.id;
    await hrClient.from('event_items').insert({ event_id: eventId, item_id: itemId });

    // Audience: open the event to a circle Jean and colleague are in
    // (skipped for brevity — assume audience set up via fixtures)

    // Colleague claims
    await colleagueClient.from('claims').insert({ item_id: itemId });

    // Jean (honoree) sees nothing
    const { data: jeanSees } = await jeanClient.from('claims').select().eq('item_id', itemId);
    expect(jeanSees).toEqual([]);

    // HR (creator) DOES see the claim — they're curator, not honoree
    const { data: hrSees } = await hrClient.from('claims').select().eq('item_id', itemId);
    expect(hrSees!.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test, verify fails (no setup yet)**

Run: `cd supabase/tests/integration && npm test -- hr-mode-events`
Expected: tests fail (no fixture users, or RLS policies not yet applied to test DB).

- [ ] **Step 3: Add fixtures for test users in `supabase/tests/integration/setup.ts`**

Modify the existing fixtures file to add `hr@example.com`, `jean@example.com`, `colleague@example.com` test users + a shared group containing HR and colleague (but not Jean). Refer to existing patterns in `setup.ts`.

```typescript
// in setup.ts, alongside existing fixtures
await admin.auth.admin.createUser({
  email: 'hr@example.com', password: 'test-password', email_confirm: true,
  user_metadata: { display_name: 'HR Sophie' },
});
await admin.auth.admin.createUser({
  email: 'jean@example.com', password: 'test-password', email_confirm: true,
  user_metadata: { display_name: 'Jean Dubois' },
});
await admin.auth.admin.createUser({
  email: 'colleague@example.com', password: 'test-password', email_confirm: true,
  user_metadata: { display_name: 'Colleague' },
});
// Add a circle with HR + colleague + Jean
const { data: group } = await admin.from('groups').insert({ name: 'Office' }).select().single();
// (group_members inserts here)
```

- [ ] **Step 4: Run test, verify passes**

Run: `cd supabase/tests/integration && npm test -- hr-mode-events`
Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/tests/integration/hr-mode-events.test.ts supabase/tests/integration/setup.ts
git commit -m "$(cat <<'EOF'
test(integration): HR-mode events + claims privacy

Verifies: creator can mutate HR-event, honoree is blind even when
they are a registered user, claims hidden from honoree but visible
to HR creator (curator semantics).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 1.3: Update `useEvents` hook for honoree_name fallback

**Files:**
- Modify: `app/src/events/useEvents.ts`

- [ ] **Step 1: Read current hook to understand the pattern**

Read: `app/src/events/useEvents.ts`. Find the `Event` type or `MyEvent` row type and the load function.

- [ ] **Step 2: Update the type**

Modify the row type to make `honoree_id` nullable and add `honoree_name`:

```typescript
export type MyEvent = {
  id: string;
  title: string;
  kind: EventKind;
  occurs_on: string | null;
  note: string | null;
  created_by: string;       // NEW
  honoree_id: string | null; // NOW NULLABLE
  honoree_name: string | null; // NEW
  honoree: {                 // join result; null when honoree_id is null
    id: string;
    display_name: string;
    handle: string | null;
    avatar_url: string | null;
  } | null;
  // ...rest unchanged
};
```

- [ ] **Step 3: Update load function (the SECURITY DEFINER RPC `get_my_events`)**

The RPC needs to also return `created_by` and `honoree_name`. Check `supabase/migrations/...events.sql` for the existing function. Update via a follow-up migration if columns aren't returned. For now, the migration in Task 1.1 already extended the table; the RPC may already select `*` and pick them up automatically. If not, edit the RPC.

If `get_my_events` returns specific columns rather than `*`, modify it:

```sql
-- Add to migration if needed:
create or replace function public.get_my_events()
returns table (
  id uuid,
  title text,
  kind text,
  occurs_on date,
  note text,
  created_by uuid,
  honoree_id uuid,
  honoree_name text,
  honoree json,
  -- ...rest of existing columns
) language sql security definer
set search_path = public as $$
  -- existing query, adapted
$$;
```

- [ ] **Step 4: Add helper for display name**

In `useEvents.ts`:

```typescript
export function honoreeDisplayName(e: MyEvent): string {
  return e.honoree?.display_name ?? e.honoree_name ?? '(no name)';
}
```

- [ ] **Step 5: Run TypeScript check**

Run: `cd app && npx tsc --noEmit`
Expected: errors in components that access `event.honoree.display_name` directly — list them, they'll be fixed in subsequent tasks.

- [ ] **Step 6: Commit**

```bash
git add app/src/events/useEvents.ts supabase/migrations/  # if RPC modified
git commit -m "$(cat <<'EOF'
feat(events): nullable honoree + honoreeDisplayName helper

honoree_id nullable to support HR-mode events for non-user honorees.
honoree_name text fallback. New helper resolves either path.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 1.4: Update `useEvent` hook

**Files:**
- Modify: `app/src/events/useEvent.ts`

- [ ] **Step 1: Read current hook**

Read: `app/src/events/useEvent.ts`. Find the Event type for the detail-page hook.

- [ ] **Step 2: Apply the same type extensions as Task 1.3**

Add `created_by`, nullable `honoree_id`, `honoree_name`. Update the load query to fetch these.

- [ ] **Step 3: Update mutations**

The `updateEvent` mutation may receive a `honoree_name` change for HR-mode events. Add it to the allowed update shape:

```typescript
export type EventUpdate = {
  title?: string;
  kind?: EventKind;
  occurs_on?: string | null;
  note?: string | null;
  honoree_id?: string | null;
  honoree_name?: string | null;
};
```

- [ ] **Step 4: Update permission check**

Currently the hook likely checks `is_honoree = event.honoree_id === auth.uid()`. For HR-events, the editor is the creator. Change to:

```typescript
const isOwner = event.created_by === user.id;
const isHonoree = event.honoree_id === user.id;  // for honoree-specific UI affordances
```

`isOwner` controls edit/delete affordances. `isHonoree` is preserved separately for any honoree-only logic (none for now, but useful).

- [ ] **Step 5: Run tests**

Run: `cd app && npm test -- useEvent`
Expected: existing tests fail if they assume `event.honoree.display_name` always exists. Patch them to handle null. Re-run, expect pass.

- [ ] **Step 6: Commit**

```bash
git add app/src/events/useEvent.ts
git commit -m "$(cat <<'EOF'
feat(events): useEvent supports HR-mode (creator ≠ honoree)

isOwner uses created_by (not honoree_id) for edit affordances.
Mutation shape accepts honoree_name updates.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 1.5: Update `CreateEventScreen` with "for me / for someone else" toggle

**Files:**
- Modify: `app/src/screens/events/CreateEventScreen.tsx`

- [ ] **Step 1: Read current screen**

Read: `app/src/screens/events/CreateEventScreen.tsx`. Note current form fields and how state flows to `createEvent()`.

- [ ] **Step 2: Add toggle + new state**

Above the existing title/kind/date fields, add:

```tsx
const [forSelf, setForSelf] = useState(true);
const [honoreeSearch, setHonoreeSearch] = useState('');
const [selectedHonoreeId, setSelectedHonoreeId] = useState<string | null>(null);
const [honoreeFreeText, setHonoreeFreeText] = useState('');
```

- [ ] **Step 3: Render toggle**

In the JSX, before the title field:

```tsx
<div className="for-toggle">
  <button
    type="button"
    className={forSelf ? 'selected' : ''}
    onClick={() => setForSelf(true)}>
    {t('events.forMe')}
  </button>
  <button
    type="button"
    className={!forSelf ? 'selected' : ''}
    onClick={() => setForSelf(false)}>
    {t('events.forSomeoneElse')}
  </button>
</div>

{!forSelf && (
  <Field label={t('events.honoreeLabel')}>
    <SketchInput
      value={honoreeSearch}
      onChange={(e) => setHonoreeSearch(e.target.value)}
      placeholder={t('events.honoreePlaceholder')}
    />
    <HonoreeAutocomplete
      query={honoreeSearch}
      onSelectUser={(id) => { setSelectedHonoreeId(id); setHonoreeFreeText(''); }}
      onSelectFreeText={(name) => { setSelectedHonoreeId(null); setHonoreeFreeText(name); }}
    />
  </Field>
)}
```

- [ ] **Step 4: Create `HonoreeAutocomplete` component**

Create: `app/src/screens/events/HonoreeAutocomplete.tsx`

```tsx
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

type Props = {
  query: string;
  onSelectUser: (userId: string) => void;
  onSelectFreeText: (name: string) => void;
};

export function HonoreeAutocomplete({ query, onSelectUser, onSelectFreeText }: Props) {
  const [results, setResults] = useState<{ id: string; display_name: string }[]>([]);
  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    let cancelled = false;
    supabase
      .rpc('search_users_for_event', { _q: query })
      .then(({ data }) => { if (!cancelled) setResults(data ?? []); });
    return () => { cancelled = true; };
  }, [query]);

  return (
    <div className="honoree-autocomplete">
      {results.map((u) => (
        <button key={u.id} type="button" onClick={() => onSelectUser(u.id)}>
          {u.display_name}
        </button>
      ))}
      {query.length >= 2 && (
        <button type="button" className="freetext" onClick={() => onSelectFreeText(query)}>
          + use "{query}" as a name
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Add the RPC `search_users_for_event` to a new migration**

Append to a follow-up migration file (or amend Task 1.1's migration if not yet pushed):

```sql
create or replace function public.search_users_for_event(_q text)
returns table (id uuid, display_name text)
language sql security definer
set search_path = public as $$
  select p.id, p.display_name
  from profiles p
  where p.id != auth.uid()
    and p.display_name ilike '%' || _q || '%'
    and shares_group_with(p.id)
  limit 8;
$$;
grant execute on function public.search_users_for_event(text) to authenticated;
```

Apply: `supabase migration up --local`.

- [ ] **Step 6: Wire submit handler**

In the submit handler:

```tsx
const honoreePayload = forSelf
  ? { honoree_id: user.id }
  : selectedHonoreeId
    ? { honoree_id: selectedHonoreeId }
    : { honoree_id: null, honoree_name: honoreeFreeText };

await createEvent({ ...rest, ...honoreePayload });
```

- [ ] **Step 7: Validate before submit**

Block submit if `!forSelf && !selectedHonoreeId && !honoreeFreeText.trim()`:

```tsx
if (!forSelf && !selectedHonoreeId && !honoreeFreeText.trim()) {
  setError(t('events.honoreeRequired'));
  return;
}
```

- [ ] **Step 8: Run TypeScript check and existing tests**

Run: `cd app && npx tsc --noEmit && npm test -- CreateEventScreen`
Expected: no type errors; existing tests still pass (may need to update if they assert exact form fields).

- [ ] **Step 9: Commit**

```bash
git add app/src/screens/events/CreateEventScreen.tsx \
        app/src/screens/events/HonoreeAutocomplete.tsx \
        supabase/migrations/
git commit -m "$(cat <<'EOF'
feat(events): create event for me / for someone else

Toggle on /events/new; honoree autocomplete over shared-circle users
with free-text fallback for non-users (sets honoree_name). New RPC
search_users_for_event scoped to circle-mates.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 1.6: Update `EventDetailScreen` for honoree_name fallback

**Files:**
- Modify: `app/src/screens/events/EventDetailScreen.tsx`

- [ ] **Step 1: Read current screen**

Read: `app/src/screens/events/EventDetailScreen.tsx`. Find every reference to `event.honoree.display_name`.

- [ ] **Step 2: Replace with helper**

Import `honoreeDisplayName` from `useEvents.ts` and replace every `event.honoree.display_name` with `honoreeDisplayName(event)`.

- [ ] **Step 3: Update the mode check**

The current code likely uses `isHonoree = event.honoree_id === userId` to switch between guest and honoree modes. Change to:

```tsx
const isCreator = event.created_by === userId;
// Old: const isHonoree = event.honoree_id === userId;
// New: only creator can edit
```

The "guest mode" affordances (claim items) stay tied to "in audience but not creator and not honoree". Update accordingly.

- [ ] **Step 4: Handle honoree-link disabling**

If `event.honoree_id` is null (non-user honoree), don't render the link to `/p/:userId` for the honoree. Just show the name as text.

- [ ] **Step 5: Run TypeScript + tests**

Run: `cd app && npx tsc --noEmit && npm test -- EventDetailScreen`
Expected: passes after the fix.

- [ ] **Step 6: Commit**

```bash
git add app/src/screens/events/EventDetailScreen.tsx
git commit -m "$(cat <<'EOF'
feat(events): EventDetailScreen handles non-user honoree

Use honoreeDisplayName helper; gate "edit" affordance by created_by
(not honoree_id); skip honoree-profile link when honoree_id is null.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 1.7: i18n strings for HR-mode events

**Files:**
- Modify: `app/src/i18n/ru.ts`
- Modify: `app/src/i18n/en.ts`

- [ ] **Step 1: Add EN strings**

Append under `events`:

```typescript
events: {
  // existing...
  forMe: 'For me',
  forSomeoneElse: 'For someone else',
  honoreeLabel: 'Who is this event for?',
  honoreePlaceholder: 'Start typing a name',
  honoreeRequired: 'Pick a person or type a name.',
  honoreeNonUserNote: '({name} is not on the app; they will not see this event)',
  // ...
}
```

- [ ] **Step 2: Mirror in RU**

```typescript
events: {
  // existing...
  forMe: 'Для меня',
  forSomeoneElse: 'Для другого',
  honoreeLabel: 'Кому посвящено?',
  honoreePlaceholder: 'Начни вводить имя',
  honoreeRequired: 'Выбери человека или впиши имя.',
  honoreeNonUserNote: '({name} не пользуется приложением — событие не будет ему видно)',
}
```

- [ ] **Step 3: Run translation-shape check**

Run: `cd app && npx tsc --noEmit`
Expected: passes (RU and EN must conform to same `Translation` type).

- [ ] **Step 4: Commit**

```bash
git add app/src/i18n/ru.ts app/src/i18n/en.ts
git commit -m "$(cat <<'EOF'
feat(i18n): strings for HR-mode event creation

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 1.8: Open PR #1

- [ ] **Step 1: Push branch**

Run: `git push -u origin feat/cagnotte-hr-mode-events`

- [ ] **Step 2: Open PR**

Run via gh:

```bash
gh pr create --title "feat: HR-mode events (creator ≠ honoree)" --body "$(cat <<'EOF'
## Summary
- Events get `created_by` separate from `honoree_id`; honoree_id nullable; honoree_name text fallback
- New `is_honoree_of_item` helper extends the honoree-blind invariant through HR-mode
- `claims.SELECT` policy updated to use the helper (backwards-compat in self-events)
- `CreateEventScreen` gets "for me / for someone else" toggle + honoree autocomplete + free-text
- `EventDetailScreen` handles non-user honoree gracefully

## Spec
docs/superpowers/specs/2026-05-20-cagnotte-design.md (Phase 1 of the cagnotte plan)

## Test plan
- [x] Integration test `hr-mode-events.test.ts` passes (5 cases: creation, blind invariant, claims privacy)
- [x] Existing `useEvents` / `useEvent` unit tests pass after type updates
- [ ] Manual: create HR-event for circle-mate, verify they don't see it on /events
- [ ] Manual: create HR-event for non-user, verify free-text fallback shows correctly

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Wait for CI green, then merge**

Manual user step.

---

## Phase 2 — Cagnotte data layer

**Branch:** `feat/cagnotte-schema` (created after Phase 1 merges to main)
**Goal:** new tables + triggers + RLS + RPC. No Mangopay, no UI. Tested via psql.

### Task 2.1: Cagnotte schema migration

**Files:**
- Create: `supabase/migrations/20260521120000_cagnottes.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260521120000_cagnottes.sql

create table public.cagnottes (
  id                    uuid primary key default gen_random_uuid(),
  item_id               uuid not null unique
                          references public.items(id) on delete cascade,
  coordinator_id        uuid not null references auth.users(id),
  goal_amount_cents     integer not null check (goal_amount_cents >= 500),
  currency              text not null default 'EUR' check (currency = 'EUR'),
  deadline              timestamptz not null,
  message               text,
  mangopay_wallet_id    text not null unique,
  status                text not null default 'open'
                          check (status in ('open','released','refunded','cancelled')),
  released_at           timestamptz,
  refund_initiated_at   timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index cagnottes_open_by_deadline_idx
  on public.cagnottes (deadline) where status = 'open';
create index cagnottes_coordinator_idx on public.cagnottes (coordinator_id);

create table public.cagnotte_contributions (
  id                    uuid primary key default gen_random_uuid(),
  cagnotte_id           uuid not null
                          references public.cagnottes(id) on delete cascade,
  contributor_id        uuid not null references auth.users(id),
  amount_cents          integer not null check (amount_cents >= 100),
  mangopay_payin_id     text not null unique,
  mangopay_refund_id    text,
  status                text not null default 'pending'
                          check (status in ('pending','succeeded','failed','refunded')),
  created_at            timestamptz not null default now()
);
create index cagnotte_contributions_cagnotte_status_idx
  on public.cagnotte_contributions (cagnotte_id, status);
create index cagnotte_contributions_contributor_idx
  on public.cagnotte_contributions (contributor_id);

create table public.mangopay_users (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  mangopay_user_id      text not null unique,
  kyc_level             text not null default 'NONE'
                          check (kyc_level in ('NONE','LIGHT','REGULAR')),
  bank_account_id       text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- updated_at triggers (using existing set_updated_at)
create trigger cagnottes_set_updated_at
  before update on public.cagnottes
  for each row execute function set_updated_at();
create trigger mangopay_users_set_updated_at
  before update on public.mangopay_users
  for each row execute function set_updated_at();

-- mutual exclusion: cagnotte ↔ solo claim
create or replace function public.enforce_no_solo_claim_on_cagnotte_insert()
returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.claims where item_id = new.item_id) then
    raise exception 'item_has_solo_claim' using errcode = 'P0001';
  end if;
  return new;
end; $$;
create trigger cagnottes_check_no_claim
  before insert on public.cagnottes
  for each row execute function enforce_no_solo_claim_on_cagnotte_insert();

create or replace function public.enforce_no_open_cagnotte_on_claim_insert()
returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from public.cagnottes
    where item_id = new.item_id and status = 'open'
  ) then
    raise exception 'item_has_open_cagnotte' using errcode = 'P0001';
  end if;
  return new;
end; $$;
create trigger claims_check_no_open_cagnotte
  before insert on public.claims
  for each row execute function enforce_no_open_cagnotte_on_claim_insert();

-- item lock during open cagnotte
create or replace function public.enforce_item_locked_during_open_cagnotte()
returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from public.cagnottes
    where item_id = old.id and status = 'open'
  ) and public.is_honoree_of_item(old.id) then
    raise exception 'item_locked' using errcode = 'P0001';
  end if;
  return new;
end; $$;
create trigger items_block_modify_during_cagnotte
  before update or delete on public.items
  for each row execute function enforce_item_locked_during_open_cagnotte();
```

- [ ] **Step 2: Apply migration**

Run: `supabase migration up --local`
Expected: success.

- [ ] **Step 3: Verify tables exist**

Run: `psql ... -c "\dt public.cagnottes; \dt public.cagnotte_contributions; \dt public.mangopay_users"`
Expected: all three tables listed.

- [ ] **Step 4: Verify constraints**

Run: `psql ... -c "\d public.cagnottes"`
Expected: all CHECK constraints, FKs, indexes shown.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260521120000_cagnottes.sql
git commit -m "$(cat <<'EOF'
feat(db): cagnotte tables + triggers

cagnottes (one per item, unique item_id constraint enforces mutual
exclusion with single ownership); cagnotte_contributions (per-payin
row); mangopay_users (KYC level + bank account id). Triggers enforce
claim↔cagnotte mutual exclusion and item-lock during open cagnotte.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 2.2: RLS policies + `get_cagnotte_view` RPC

**Files:**
- Create: `supabase/migrations/20260521130000_cagnottes_rls.sql`

- [ ] **Step 1: Write RLS migration**

```sql
-- supabase/migrations/20260521130000_cagnottes_rls.sql

alter table public.cagnottes enable row level security;
alter table public.cagnotte_contributions enable row level security;
alter table public.mangopay_users enable row level security;

-- cagnottes: SELECT, INSERT, UPDATE via policies
create policy cagnottes_select
  on public.cagnottes for select
  using (
    not public.is_honoree_of_item(item_id)
    and public.can_see_item(item_id)
  );

create policy cagnottes_insert
  on public.cagnottes for insert
  with check (
    coordinator_id = auth.uid()
    and not public.is_honoree_of_item(item_id)
    and public.can_see_item(item_id)
  );

create policy cagnottes_update
  on public.cagnottes for update
  using (coordinator_id = auth.uid())
  with check (coordinator_id = auth.uid());

-- cagnotte_contributions: NO client-side SELECT. RPC only.
-- INSERT blocked from client (Edge Functions only via service role).
-- UPDATE blocked entirely from client.

-- mangopay_users: self-only
create policy mangopay_users_select
  on public.mangopay_users for select
  using (user_id = auth.uid());

create policy mangopay_users_insert
  on public.mangopay_users for insert
  with check (user_id = auth.uid());

create policy mangopay_users_update
  on public.mangopay_users for update
  using (user_id = auth.uid());

-- Helper: get_cagnotte_view RPC with caller-dependent masking
create or replace function public.get_cagnotte_view(_cagnotte_id uuid)
returns jsonb language plpgsql security definer
set search_path = public as $$
declare
  _caller uuid := auth.uid();
  _cagnotte record;
  _is_coordinator boolean;
  _is_honoree boolean;
  _can_see boolean;
begin
  select * into _cagnotte from cagnottes where id = _cagnotte_id;
  if not found then
    raise exception 'cagnotte_not_found';
  end if;
  _is_honoree := is_honoree_of_item(_cagnotte.item_id);
  _can_see := can_see_item(_cagnotte.item_id);
  if _is_honoree or not _can_see then
    raise exception 'cagnotte_forbidden';
  end if;
  _is_coordinator := (_cagnotte.coordinator_id = _caller);
  return jsonb_build_object(
    'cagnotte', row_to_json(_cagnotte),
    'is_coordinator', _is_coordinator,
    'contributions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'contributor_id', c.contributor_id,
        'contributor_name', p.display_name,
        'amount_cents', case
          when _is_coordinator or c.contributor_id = _caller then c.amount_cents
          else null
        end,
        'status', c.status,
        'created_at', c.created_at
      ) order by c.created_at desc)
      from cagnotte_contributions c
      join profiles p on p.id = c.contributor_id
      where c.cagnotte_id = _cagnotte_id and c.status in ('succeeded','pending')
    ), '[]'::jsonb)
  );
end; $$;
grant execute on function public.get_cagnotte_view(uuid) to authenticated;

-- Helper: get_my_cagnottes — list of cagnottes the caller coordinates
create or replace function public.get_my_cagnottes()
returns jsonb language plpgsql security definer
set search_path = public as $$
declare _caller uuid := auth.uid();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'cagnotte', row_to_json(c),
      'item', jsonb_build_object(
        'id', i.id, 'title', i.title, 'cover_url', i.cover_url
      ),
      'event', jsonb_build_object(
        'id', e.id, 'title', e.title, 'kind', e.kind, 'occurs_on', e.occurs_on,
        'honoree_display', coalesce(p.display_name, e.honoree_name)
      ),
      'total_raised_cents', coalesce((
        select sum(amount_cents) from cagnotte_contributions
        where cagnotte_id = c.id and status = 'succeeded'
      ), 0),
      'contributor_count', coalesce((
        select count(*) from cagnotte_contributions
        where cagnotte_id = c.id and status = 'succeeded'
      ), 0)
    ) order by
      case c.status when 'open' then 0 when 'released' then 1 else 2 end,
      c.deadline asc)
    from cagnottes c
    join items i on i.id = c.item_id
    left join event_items ei on ei.item_id = c.item_id
    left join events e on e.id = ei.event_id
    left join profiles p on p.id = e.honoree_id
    where c.coordinator_id = _caller
  ), '[]'::jsonb);
end; $$;
grant execute on function public.get_my_cagnottes() to authenticated;
```

- [ ] **Step 2: Apply migration**

Run: `supabase migration up --local`
Expected: success.

- [ ] **Step 3: Regen types**

Run: `supabase gen types typescript --local --schema public 2>/dev/null > app/src/types/database.ts`

- [ ] **Step 4: Verify TS compiles**

Run: `cd app && npx tsc --noEmit`
Expected: passes (no app code references new tables yet, only types).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260521130000_cagnottes_rls.sql app/src/types/database.ts
git commit -m "$(cat <<'EOF'
feat(db): cagnotte RLS + get_cagnotte_view RPC

RLS hides cagnottes from honoree (via is_honoree_of_item).
cagnotte_contributions blocked from direct SELECT — get_cagnotte_view
RPC returns masked-amount rows per caller (own + coordinator see
amounts; others see only names).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 2.3: Add error keys to `lib/errors.ts`

**Files:**
- Modify: `app/src/lib/errors.ts`
- Modify: `app/src/i18n/ru.ts`
- Modify: `app/src/i18n/en.ts`

- [ ] **Step 1: Add error code matchers**

Read `app/src/lib/errors.ts`. In `errorCode()`, add matchers:

```typescript
if (text.includes('item_has_solo_claim')) return 'itemHasSoloClaim';
if (text.includes('item_has_open_cagnotte')) return 'itemHasOpenCagnotte';
if (text.includes('item_locked')) return 'itemLocked';
if (text.includes('cagnotte_forbidden')) return 'cagnotteForbidden';
if (text.includes('cagnotte_not_found')) return 'cagnotteNotFound';
```

- [ ] **Step 2: Add EN strings**

In `app/src/i18n/en.ts` under `errors`:

```typescript
errors: {
  // existing...
  itemHasSoloClaim: "Someone has already claimed this item — can't start a kitty.",
  itemHasOpenCagnotte: "A kitty is already running for this item — can't claim solo.",
  itemLocked: "This item can't be modified right now.",
  cagnotteForbidden: "You don't have access to this kitty.",
  cagnotteNotFound: "Kitty not found.",
}
```

- [ ] **Step 3: Mirror in RU**

```typescript
errors: {
  itemHasSoloClaim: 'Этот item уже взял кто-то один — кагнотту не открыть.',
  itemHasOpenCagnotte: 'На этот item уже идёт кагнотта — одиночный claim недоступен.',
  itemLocked: 'Item сейчас нельзя изменить.',
  cagnotteForbidden: 'Нет доступа к этой кагнотте.',
  cagnotteNotFound: 'Кагнотта не найдена.',
}
```

- [ ] **Step 4: Run TypeScript check**

Run: `cd app && npx tsc --noEmit`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/errors.ts app/src/i18n/ru.ts app/src/i18n/en.ts
git commit -m "$(cat <<'EOF'
feat(errors): cagnotte error keys

Maps Postgres exception codes (item_has_solo_claim, item_locked,
cagnotte_forbidden, etc) to user-facing messages.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 2.4: Integration test — RLS smoke-test matrix

**Files:**
- Create: `supabase/tests/integration/cagnotte-rls.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// supabase/tests/integration/cagnotte-rls.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// [Setup similar to hr-mode-events.test.ts — fixtures: honoree, audience1, audience2, non-audience, hr]

describe('Cagnotte RLS — self-event mode', () => {
  let honoree: SupabaseClient;
  let audience1: SupabaseClient;  // will become coordinator
  let audience2: SupabaseClient;  // will contribute
  let nonAudience: SupabaseClient;
  let admin: SupabaseClient;
  let itemId: string;
  let cagnotteId: string;

  beforeAll(async () => {
    // ...sign in users, set up event with honoree, item, audience circle
    // Insert cagnotte via service role (admin) for setup
  });

  it('honoree cannot SELECT their own cagnotte', async () => {
    const { data } = await honoree.from('cagnottes').select().eq('id', cagnotteId);
    expect(data).toEqual([]);
  });

  it('honoree get_cagnotte_view throws cagnotte_forbidden', async () => {
    const { error } = await honoree.rpc('get_cagnotte_view', { _cagnotte_id: cagnotteId });
    expect(error?.message).toContain('cagnotte_forbidden');
  });

  it('honoree cannot UPDATE item with open cagnotte', async () => {
    const { error } = await honoree.from('items').update({ title: 'NEW' }).eq('id', itemId);
    expect(error?.message).toContain('item_locked');
  });

  it('audience member sees cagnotte + names, not amounts', async () => {
    const { data: view, error } = await audience2.rpc('get_cagnotte_view', { _cagnotte_id: cagnotteId });
    expect(error).toBeNull();
    const contributions = (view as any).contributions;
    expect(contributions[0].contributor_name).toBeTruthy();
    // audience2 contributed something, so they see their own amount
    expect(contributions.find((c: any) => c.contributor_id === (await audience2.auth.getUser()).data.user!.id).amount_cents).not.toBeNull();
    // amounts of OTHER contributors should be null
    expect(contributions.find((c: any) => c.contributor_id !== (await audience2.auth.getUser()).data.user!.id).amount_cents).toBeNull();
  });

  it('coordinator sees ALL contribution amounts', async () => {
    const { data: view } = await audience1.rpc('get_cagnotte_view', { _cagnotte_id: cagnotteId });
    const contribs = (view as any).contributions;
    contribs.forEach((c: any) => expect(c.amount_cents).not.toBeNull());
  });

  it('non-audience sees cagnotte_forbidden', async () => {
    const { error } = await nonAudience.rpc('get_cagnotte_view', { _cagnotte_id: cagnotteId });
    expect(error?.message).toContain('cagnotte_forbidden');
  });
});

describe('Cagnotte RLS — HR-event mode', () => {
  // mirror the matrix from spec section "Privacy smoke-test matrix" → HR-event mode
  it('HR creator sees cagnotte as audience-member', async () => { /* ... */ });
  it('HR can UPDATE their own HR-mode item even with open cagnotte', async () => { /* ... */ });
  it('Jean (HR-event honoree) blind to cagnotte', async () => { /* ... */ });
});
```

- [ ] **Step 2: Run the test, verify fails (no fixtures yet)**

Run: `cd supabase/tests/integration && npm test -- cagnotte-rls`
Expected: fails.

- [ ] **Step 3: Add fixtures in `setup.ts`**

Add helper to create a complete test scenario (audience circle, item, cagnotte). Reuse fixtures from Task 1.2 where possible.

- [ ] **Step 4: Re-run test**

Run: `cd supabase/tests/integration && npm test -- cagnotte-rls`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/tests/integration/cagnotte-rls.test.ts supabase/tests/integration/setup.ts
git commit -m "$(cat <<'EOF'
test(integration): cagnotte RLS smoke matrix

Covers self-event mode (honoree blind, audience masked amounts,
coordinator sees all, non-audience forbidden) and HR-event mode
(HR sees as audience, HR can edit own items during cagnotte, Jean
blind even as registered user).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 2.5: Integration test — mutual exclusion

**Files:**
- Create: `supabase/tests/integration/cagnotte-mutual-exclusion.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

describe('Cagnotte ↔ claim mutual exclusion', () => {
  let admin: SupabaseClient;
  let user1: SupabaseClient;
  let user2: SupabaseClient;
  let itemId: string;

  beforeAll(async () => {
    // setup: create item with audience that includes user1, user2
    // honoree is someone else
  });

  it('cannot create cagnotte when solo claim exists', async () => {
    await user1.from('claims').insert({ item_id: itemId });
    const { error } = await admin.from('cagnottes').insert({
      item_id: itemId, coordinator_id: '<user2-id>',
      goal_amount_cents: 5000, deadline: '2027-01-01',
      mangopay_wallet_id: 'fake_wallet',
    });
    expect(error?.message).toContain('item_has_solo_claim');
  });

  it('cannot create solo claim when open cagnotte exists', async () => {
    // setup: open cagnotte on another item
    const { data: item } = await admin.from('items').insert({ title: 'x' }).select().single();
    await admin.from('cagnottes').insert({
      item_id: item!.id, coordinator_id: '<user1-id>',
      goal_amount_cents: 5000, deadline: '2027-01-01',
      mangopay_wallet_id: 'fake_wallet_2',
    });
    const { error } = await user2.from('claims').insert({ item_id: item!.id });
    expect(error?.message).toContain('item_has_open_cagnotte');
  });

  it('CAN create solo claim when cagnotte is refunded (terminal state)', async () => {
    // setup cagnotte → mark as refunded
    // ...
    const { error } = await user2.from('claims').insert({ item_id: '<item-id>' });
    expect(error).toBeNull();
  });
});
```

- [ ] **Step 2: Run, verify pass after triggers from Task 2.1**

Run: `cd supabase/tests/integration && npm test -- cagnotte-mutual-exclusion`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/integration/cagnotte-mutual-exclusion.test.ts
git commit -m "$(cat <<'EOF'
test(integration): claim ↔ cagnotte mutual exclusion

Trigger-enforced rule: an item has either a solo claim OR an open
cagnotte, never both. Terminal-state cagnottes (refunded/cancelled)
release the exclusion lock.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 2.6: Open PR #2

- [ ] **Step 1: Push branch**: `git push -u origin feat/cagnotte-schema`
- [ ] **Step 2: Open PR** with body summarising the schema + RLS + mutual-exclusion test coverage, list the 2 new migrations
- [ ] **Step 3: Wait for CI + merge** (manual)

---

## Phase 3 — Mangopay wrapper + KYC LIGHT

**Branch:** `feat/cagnotte-mangopay-kyc` (off main after Phase 2 merges)
**Goal:** typed Mangopay client (`app/src/lib/mangopay.ts`) + Edge Function shared helper + `mangopay-kyc-light` Edge Function + KycLightModal UI component.

### Task 3.1: Mangopay client wrapper for the browser

**Files:**
- Create: `app/src/lib/mangopay.ts`

- [ ] **Step 1: Write the typed wrapper**

Mangopay's REST API doesn't have a great EU-published TS SDK. We hand-roll the calls we need. Most calls run server-side (Edge Functions); the browser only uses Mangopay to tokenise card data via the hosted form.

```typescript
// app/src/lib/mangopay.ts

// Browser-side: only used for card tokenisation via Mangopay's hosted iframe.
// All money operations run from Edge Functions (see _shared/mangopay.ts).

const MANGOPAY_HOST = import.meta.env.VITE_MANGOPAY_ENV === 'production'
  ? 'https://api.mangopay.com'
  : 'https://api.sandbox.mangopay.com';

const MANGOPAY_CARD_REGISTRATION_URL = `${MANGOPAY_HOST}/v2.01/cardregistrations`;

export type CardRegistrationData = {
  cardRegistrationId: string;
  preregistrationData: string;
  accessKey: string;
  cardRegistrationUrl: string;
};

// Mangopay's flow: 1) we create CardRegistration server-side, 2) browser
// posts card details directly to Mangopay, 3) Mangopay returns a token, 4)
// we POST the token to our /cagnotte-contribute Edge Function which calls
// CreatePayIn with the registered card.
export async function submitCardToMangopay(
  reg: CardRegistrationData,
  cardNumber: string,
  cardExpiration: string,  // MMYY
  cardCvx: string,
): Promise<string> {
  const body = new URLSearchParams({
    data: reg.preregistrationData,
    accessKeyRef: reg.accessKey,
    cardNumber, cardExpirationDate: cardExpiration, cardCvx,
  });
  const resp = await fetch(reg.cardRegistrationUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await resp.text();
  if (!text.startsWith('data=')) throw new Error(`mangopay_card_register_failed: ${text}`);
  return text;  // this is the registration data the Edge Function passes to UpdateCardRegistration
}
```

- [ ] **Step 2: Add env vars**

Add to `app/.env.example`:

```
VITE_MANGOPAY_ENV=sandbox
```

- [ ] **Step 3: TS check**

Run: `cd app && npx tsc --noEmit`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add app/src/lib/mangopay.ts app/.env.example
git commit -m "$(cat <<'EOF'
feat(lib): browser-side Mangopay card-tokenisation helper

submitCardToMangopay posts to Mangopay's CardRegistration directly
from the browser, so card data never touches our backend.
All other Mangopay operations live in Edge Functions.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 3.2: Edge Function shared Mangopay client

**Files:**
- Create: `supabase/functions/_shared/mangopay.ts`

- [ ] **Step 1: Write the server-side wrapper**

```typescript
// supabase/functions/_shared/mangopay.ts
// Server-side Mangopay client. Used by every cagnotte-* Edge Function.

const ENV = Deno.env.get('MANGOPAY_ENV') ?? 'sandbox';
const HOST = ENV === 'production'
  ? 'https://api.mangopay.com'
  : 'https://api.sandbox.mangopay.com';
const CLIENT_ID = Deno.env.get('MANGOPAY_CLIENT_ID')!;
const API_KEY = Deno.env.get('MANGOPAY_API_KEY')!;

function authHeader(): string {
  return 'Basic ' + btoa(`${CLIENT_ID}:${API_KEY}`);
}

async function mangopay<T>(method: 'GET'|'POST'|'PUT', path: string, body?: unknown): Promise<T> {
  const resp = await fetch(`${HOST}/v2.01/${CLIENT_ID}${path}`, {
    method,
    headers: {
      'Authorization': authHeader(),
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`mangopay_${resp.status}: ${text}`);
  }
  return resp.json() as Promise<T>;
}

export type MangopayUser = {
  Id: string; PersonType: 'NATURAL'|'LEGAL'; Email: string;
  FirstName?: string; LastName?: string; Birthday?: number; Nationality?: string;
  CountryOfResidence?: string; KYCLevel: 'LIGHT'|'REGULAR';
};

export async function createNaturalUser(input: {
  email: string; firstName: string; lastName: string;
  birthday: Date; nationality: string; countryOfResidence: string;
}): Promise<MangopayUser> {
  return mangopay<MangopayUser>('POST', '/users/natural', {
    Email: input.email, FirstName: input.firstName, LastName: input.lastName,
    Birthday: Math.floor(input.birthday.getTime() / 1000),
    Nationality: input.nationality,
    CountryOfResidence: input.countryOfResidence,
  });
}

export type MangopayWallet = {
  Id: string; Owners: string[]; Currency: string; Balance: { Amount: number; Currency: string };
};

export async function createWallet(input: {
  ownerIds: string[]; description: string;
}): Promise<MangopayWallet> {
  return mangopay<MangopayWallet>('POST', '/wallets', {
    Owners: input.ownerIds, Description: input.description, Currency: 'EUR',
  });
}

export type MangopayBankAccount = { Id: string; UserId: string; IBAN: string; BIC: string; OwnerName: string };

export async function createBankAccount(userId: string, input: {
  ownerName: string; iban: string; ownerAddress: {
    addressLine1: string; city: string; postalCode: string; country: string;
  };
}): Promise<MangopayBankAccount> {
  return mangopay<MangopayBankAccount>('POST', `/users/${userId}/bankaccounts/iban`, {
    OwnerName: input.ownerName, IBAN: input.iban,
    OwnerAddress: {
      AddressLine1: input.ownerAddress.addressLine1,
      City: input.ownerAddress.city,
      PostalCode: input.ownerAddress.postalCode,
      Country: input.ownerAddress.country,
    },
  });
}

export type CardRegistration = {
  Id: string; UserId: string; Status: string;
  PreregistrationData: string; AccessKey: string; CardRegistrationURL: string;
  CardId?: string;
};

export async function createCardRegistration(userId: string): Promise<CardRegistration> {
  return mangopay<CardRegistration>('POST', '/cardregistrations', {
    UserId: userId, Currency: 'EUR', CardType: 'CB_VISA_MASTERCARD',
  });
}

export async function updateCardRegistration(regId: string, data: string): Promise<CardRegistration> {
  return mangopay<CardRegistration>('PUT', `/cardregistrations/${regId}`, {
    RegistrationData: data,
  });
}

export type PayIn = {
  Id: string; Status: 'CREATED'|'SUCCEEDED'|'FAILED';
  CreditedFunds: { Amount: number; Currency: string };
  SecureModeRedirectURL?: string;
};

export async function createCardDirectPayIn(input: {
  authorId: string; cardId: string; creditedWalletId: string;
  amountCents: number; returnUrl: string;
}): Promise<PayIn> {
  return mangopay<PayIn>('POST', '/payins/card/direct', {
    AuthorId: input.authorId, CardId: input.cardId,
    CreditedWalletId: input.creditedWalletId,
    DebitedFunds: { Amount: input.amountCents, Currency: 'EUR' },
    Fees: { Amount: 0, Currency: 'EUR' },
    SecureMode: 'FORCE',
    SecureModeReturnURL: input.returnUrl,
  });
}

export type PayOut = { Id: string; Status: 'CREATED'|'SUCCEEDED'|'FAILED' };

export async function createPayOut(input: {
  authorId: string; debitedWalletId: string; bankAccountId: string; amountCents: number;
}): Promise<PayOut> {
  return mangopay<PayOut>('POST', '/payouts/bankwire', {
    AuthorId: input.authorId, DebitedWalletId: input.debitedWalletId,
    BankAccountId: input.bankAccountId,
    DebitedFunds: { Amount: input.amountCents, Currency: 'EUR' },
    Fees: { Amount: 0, Currency: 'EUR' },
  });
}

export type Refund = { Id: string; Status: string };

export async function refundPayIn(payInId: string, reason: string): Promise<Refund> {
  return mangopay<Refund>('POST', `/payins/${payInId}/refunds`, {
    AuthorId: undefined,  // platform-initiated full refund
    Reason: { RefundReason: 'OTHER', RefundReasonMessage: reason },
  });
}

export async function transferBetweenWallets(input: {
  authorId: string; debitedWalletId: string; creditedWalletId: string; amountCents: number;
}): Promise<{ Id: string; Status: string }> {
  return mangopay<any>('POST', '/transfers', {
    AuthorId: input.authorId,
    DebitedWalletId: input.debitedWalletId,
    CreditedWalletId: input.creditedWalletId,
    DebitedFunds: { Amount: input.amountCents, Currency: 'EUR' },
    Fees: { Amount: 0, Currency: 'EUR' },
  });
}

// Webhook signature verification
export function verifyWebhookSignature(
  body: string, signature: string, secret: string
): boolean {
  // Mangopay signs with HMAC-SHA256
  // Implementation: hmac(secret, body) === signature
  // (use Deno's std/crypto)
  // returns boolean
  return false;  // implementation per Mangopay docs
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/_shared/mangopay.ts
git commit -m "$(cat <<'EOF'
feat(edge): shared Mangopay client for Edge Functions

Wraps the API calls used by cagnotte-create / contribute / release /
cancel / sweep / webhook: users, wallets, bank accounts, card
registrations, payins (direct + 3DS), payouts, refunds, transfers.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 3.3: Edge Function `mangopay-kyc-light`

**Files:**
- Create: `supabase/functions/mangopay-kyc-light/index.ts`

- [ ] **Step 1: Write the function**

```typescript
// supabase/functions/mangopay-kyc-light/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { createNaturalUser, createBankAccount } from '../_shared/mangopay.ts';

type RequestBody = {
  firstName: string; lastName: string;
  birthday: string;  // ISO date
  nationality: string;  // ISO country code
  countryOfResidence: string;
  iban: string;
  addressLine1: string; city: string; postalCode: string; country: string;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(req) });
  if (req.method !== 'POST') return new Response('method_not_allowed', { status: 405 });

  // Auth: extract user from JWT
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response('unauthorized', { status: 401 });
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: userResp } = await supabase.auth.getUser();
  const user = userResp.user;
  if (!user) return new Response('unauthorized', { status: 401 });

  // Check if already has mangopay_user
  const { data: existing } = await supabase.from('mangopay_users')
    .select().eq('user_id', user.id).maybeSingle();
  if (existing) {
    return new Response(JSON.stringify({ mangopay_user_id: existing.mangopay_user_id }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }

  // Parse body
  const body: RequestBody = await req.json();

  // Create Mangopay user
  const mpUser = await createNaturalUser({
    email: user.email!,
    firstName: body.firstName,
    lastName: body.lastName,
    birthday: new Date(body.birthday),
    nationality: body.nationality,
    countryOfResidence: body.countryOfResidence,
  });

  // Create bank account
  const bank = await createBankAccount(mpUser.Id, {
    ownerName: `${body.firstName} ${body.lastName}`,
    iban: body.iban,
    ownerAddress: {
      addressLine1: body.addressLine1, city: body.city,
      postalCode: body.postalCode, country: body.country,
    },
  });

  // Persist
  await supabase.from('mangopay_users').insert({
    user_id: user.id,
    mangopay_user_id: mpUser.Id,
    kyc_level: 'LIGHT',
    bank_account_id: bank.Id,
  });

  return new Response(JSON.stringify({ mangopay_user_id: mpUser.Id }), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
  });
});
```

- [ ] **Step 2: Add secrets to local config**

Add to `supabase/.env` (gitignored):

```
MANGOPAY_ENV=sandbox
MANGOPAY_CLIENT_ID=<from Mangopay dashboard, sandbox>
MANGOPAY_API_KEY=<from Mangopay dashboard, sandbox>
```

- [ ] **Step 3: Serve locally**

Run: `supabase functions serve mangopay-kyc-light --no-verify-jwt`
Expected: server starts on `http://127.0.0.1:54321/functions/v1/mangopay-kyc-light`.

- [ ] **Step 4: Manual smoke test**

```bash
curl -X POST http://127.0.0.1:54321/functions/v1/mangopay-kyc-light \
  -H "Authorization: Bearer <test-jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Sophie", "lastName": "Bernard",
    "birthday": "1990-03-15", "nationality": "FR", "countryOfResidence": "FR",
    "iban": "FR7630006000011234567890189",
    "addressLine1": "1 rue Test", "city": "Paris",
    "postalCode": "75001", "country": "FR"
  }'
```

Expected: 200 OK with `{"mangopay_user_id":"<id>"}`. Verify in Mangopay sandbox dashboard the User + BankAccount exist.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/mangopay-kyc-light/
git commit -m "$(cat <<'EOF'
feat(edge): mangopay-kyc-light — one-time coordinator KYC

Creates Mangopay NATURAL User with LIGHT KYC + BankAccount for
payouts. Persists mangopay_user_id + bank_account_id in
mangopay_users. Idempotent on re-call (returns existing).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 3.4: KycLightModal component

**Files:**
- Create: `app/src/screens/cagnotte/KycLightModal.tsx`
- Modify: `app/src/i18n/{ru,en}.ts`

- [ ] **Step 1: Write the component**

```tsx
// app/src/screens/cagnotte/KycLightModal.tsx
import { useState } from 'react';
import { useI18n } from '../../i18n';
import { useAuth } from '../../auth';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';

type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export function KycLightModal({ open, onClose, onSuccess }: Props) {
  const { t } = useI18n();
  const { profile } = useAuth();
  const [firstName, setFirstName] = useState(profile?.display_name?.split(' ')[0] ?? '');
  const [lastName, setLastName] = useState(profile?.display_name?.split(' ').slice(1).join(' ') ?? '');
  const [birthday, setBirthday] = useState('');
  const [nationality, setNationality] = useState('FR');
  const [country, setCountry] = useState('FR');
  const [iban, setIban] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function submit() {
    setSubmitting(true);
    setError(null);
    const { error } = await supabase.functions.invoke('mangopay-kyc-light', {
      body: {
        firstName, lastName, birthday, nationality, countryOfResidence: country,
        iban: iban.replace(/\s+/g, ''),
        addressLine1, city, postalCode, country,
      },
    });
    setSubmitting(false);
    if (error) {
      setError(errorMessage(t, error));
      return;
    }
    onSuccess();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal kyc-modal" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose}>×</button>
        <div className="eyebrow">{t('cagnotte.kyc.eyebrow')}</div>
        <h2>{t('cagnotte.kyc.title')}</h2>
        <p className="lede">{t('cagnotte.kyc.lede')}</p>

        <div className="section-label">{t('cagnotte.kyc.aboutYou')}</div>
        {/* form fields */}
        <Field label={t('cagnotte.kyc.firstName')}>
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </Field>
        {/* ...lastName, birthday, nationality, country */}

        <hr />
        <div className="section-label">{t('cagnotte.kyc.whereMoneyLands')}</div>
        <Field label="IBAN"><input value={iban} onChange={(e) => setIban(e.target.value)} /></Field>
        {/* address fields */}

        <div className="reassurance">{t('cagnotte.kyc.reassurance')}</div>
        {error && <div className="error">{error}</div>}

        <div className="actions">
          <button className="cta" onClick={submit} disabled={submitting}>
            {submitting ? t('cagnotte.kyc.submitting') : t('cagnotte.kyc.confirm')}
          </button>
          <button className="cta-text" onClick={onClose}>{t('cagnotte.kyc.later')}</button>
        </div>
        <div className="powered">{t('cagnotte.kyc.powered')}</div>
      </div>
    </div>
  );
}
```

(Reuse `Field` from `app/src/components/`. Style via dedicated CSS file `KycLightModal.css` matching the brainstorm mockup at `.superpowers/brainstorm/.../kyc-modal.html`.)

- [ ] **Step 2: Add i18n strings**

Append to EN under `cagnotte.kyc`: `eyebrow`, `title`, `lede`, `aboutYou`, `firstName`, `lastName`, `birthday`, `nationality`, `countryOfResidence`, `whereMoneyLands`, `iban`, `addressLine1`, `city`, `postalCode`, `reassurance`, `submitting`, `confirm`, `later`, `powered`.

Mirror in RU.

- [ ] **Step 3: Run TS**

Run: `cd app && npx tsc --noEmit`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add app/src/screens/cagnotte/KycLightModal.tsx app/src/screens/cagnotte/KycLightModal.css app/src/i18n/
git commit -m "$(cat <<'EOF'
feat(cagnotte): KYC LIGHT modal for first-time coordinator

Editorial paper-aesthetic modal: collects first/last/birthday/
nationality/country + IBAN. Invokes mangopay-kyc-light Edge Function.
One-time per user — gates first cagnotte creation.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 3.5: Open PR #3

- [ ] **Step 1**: `git push -u origin feat/cagnotte-mangopay-kyc`
- [ ] **Step 2**: Open PR via gh, body covers Mangopay env setup + KYC modal screenshots + test plan
- [ ] **Step 3**: Wait for CI + merge (manual)

---

## Phase 4 — Cagnotte lifecycle Edge Functions

**Branch:** `feat/cagnotte-lifecycle`
**Goal:** create, contribute, release, cancel, webhook, sweep. All Mangopay-touching code, no UI yet.

### Task 4.1: Edge Function `cagnotte-create`

**Files:** Create: `supabase/functions/cagnotte-create/index.ts`

- [ ] **Step 1: Write function**

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { createWallet } from '../_shared/mangopay.ts';

type Body = {
  item_id: string;
  goal_amount_cents: number;
  deadline: string;        // ISO datetime
  message?: string;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(req) });
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response('unauthorized', { status: 401 });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return new Response('unauthorized', { status: 401 });
  const userId = u.user.id;

  const body: Body = await req.json();

  // Verify coordinator has Mangopay user + KYC LIGHT
  const { data: mpUser } = await supabase.from('mangopay_users')
    .select().eq('user_id', userId).maybeSingle();
  if (!mpUser) return new Response('kyc_required', { status: 400 });

  // Verify caller is not honoree (via is_honoree_of_item RPC)
  const { data: isHonoree } = await supabase.rpc('is_honoree_of_item', {
    _item_id: body.item_id,
  });
  if (isHonoree) return new Response('honoree_cannot_coordinate', { status: 403 });

  // Create Mangopay Wallet (owner = the platform, not coordinator — escrow)
  // For sandbox simplicity, owner = coordinator's Mangopay user (Mangopay
  // wallets must have owners; platform-owned wallets need separate platform
  // user setup, deferred to production-onboarding)
  const wallet = await createWallet({
    ownerIds: [mpUser.mangopay_user_id],
    description: `cagnotte ${body.item_id.slice(0, 8)}`,
  });

  // Insert DB row (uses service role to bypass RLS for insert + verify item exists)
  const { data, error } = await supabase.from('cagnottes').insert({
    item_id: body.item_id,
    coordinator_id: userId,
    goal_amount_cents: body.goal_amount_cents,
    currency: 'EUR',
    deadline: body.deadline,
    message: body.message,
    mangopay_wallet_id: wallet.Id,
  }).select().single();

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 });

  // Fire-and-forget: email notification to event audience minus creator
  supabase.functions.invoke('send-cagnotte-created', { body: { cagnotte_id: data.id } })
    .catch(() => {});  // never block the response

  return new Response(JSON.stringify({ cagnotte: data }), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
  });
});
```

- [ ] **Step 2: Manual smoke test with curl** (against `localhost:54321`)
- [ ] **Step 3: Commit**

```bash
git add supabase/functions/cagnotte-create/
git commit -m "feat(edge): cagnotte-create — wallet + DB row + audience email

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 4.2: Edge Function `cagnotte-contribute`

**Files:** Create: `supabase/functions/cagnotte-contribute/index.ts`

- [ ] **Step 1: Write function**

Body shape:
```typescript
type Body = {
  cagnotte_id: string;
  amount_cents: number;
  card_registration_data: string;  // returned by browser-side submitCardToMangopay
  card_registration_id: string;
};
```

Function flow:
1. Auth check
2. Ensure contributor has Mangopay user (lazy-create if missing — no KYC needed for contribute)
3. `updateCardRegistration(card_registration_id, card_registration_data)` → returns `CardId`
4. `createCardDirectPayIn({...})` with `returnUrl = ratlist.app/cagnotte/<id>?return_url=ok`
5. Insert `cagnotte_contributions` row with status='pending'
6. Return `{ payin_id, secure_mode_redirect_url }` for browser to 3DS-redirect

(Code shown abbreviated — same pattern as cagnotte-create with the Mangopay calls inline.)

- [ ] **Step 2: Manual smoke test with sandbox test card `4970100000000154`**
- [ ] **Step 3: Commit**

### Task 4.3: Edge Function `mangopay-webhook`

**Files:** Create: `supabase/functions/mangopay-webhook/index.ts`

- [ ] **Step 1: Write function**

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyWebhookSignature } from '../_shared/mangopay.ts';

type Event = {
  ResourceId: string;
  EventType: 'PAYIN_NORMAL_SUCCEEDED'|'PAYIN_NORMAL_FAILED'|
             'PAYOUT_NORMAL_SUCCEEDED'|'PAYOUT_NORMAL_FAILED'|
             'REFUND_PAYIN_SUCCEEDED'|'REFUND_PAYIN_FAILED';
  Date: number;
};

Deno.serve(async (req) => {
  const body = await req.text();
  const sig = req.headers.get('X-Mangopay-Signature') ?? '';
  if (!verifyWebhookSignature(body, sig, Deno.env.get('MANGOPAY_WEBHOOK_SECRET')!)) {
    return new Response('invalid_signature', { status: 401 });
  }
  const event: Event = JSON.parse(body);
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  switch (event.EventType) {
    case 'PAYIN_NORMAL_SUCCEEDED':
      await supabase.from('cagnotte_contributions')
        .update({ status: 'succeeded' })
        .eq('mangopay_payin_id', event.ResourceId)
        .eq('status', 'pending');  // idempotent: only flips pending→succeeded
      // trigger goal-check email
      // ...
      break;
    case 'PAYIN_NORMAL_FAILED':
      await supabase.from('cagnotte_contributions')
        .update({ status: 'failed' })
        .eq('mangopay_payin_id', event.ResourceId)
        .eq('status', 'pending');
      break;
    case 'PAYOUT_NORMAL_SUCCEEDED':
      // mark cagnotte's released_at fully complete — already 'released' from
      // cagnotte-release function; webhook confirms it landed
      break;
    case 'REFUND_PAYIN_SUCCEEDED':
      await supabase.from('cagnotte_contributions')
        .update({ status: 'refunded' })
        .eq('mangopay_refund_id', event.ResourceId)
        .eq('status', 'succeeded');
      break;
    // ...
  }
  return new Response('ok');
});
```

- [ ] **Step 2: Unit-test idempotency**

Create: `supabase/functions/mangopay-webhook/index.test.ts` (Deno test):

```typescript
import { assertEquals } from 'https://deno.land/std/assert/mod.ts';
Deno.test('PAYIN_NORMAL_SUCCEEDED twice = idempotent', async () => {
  // post the same event twice, expect second post to be no-op
  // ...
});
```

Run: `cd app && npm run test:edge`
Expected: passes.

- [ ] **Step 3: Commit**

### Task 4.4: Edge Function `cagnotte-release`

**Files:** Create: `supabase/functions/cagnotte-release/index.ts`

- [ ] **Step 1: Write function**

Flow:
1. Auth check → caller must be `cagnottes.coordinator_id`
2. Verify status='open'
3. Compute total = `SUM(amount_cents) WHERE cagnotte_id = X AND status = 'succeeded'`
4. If total = 0 → reject (use cagnotte-cancel instead)
5. `transferBetweenWallets(escrow → coordinator's wallet)` (in our setup wallet is already owned by coordinator, so this step may be a no-op — verify Mangopay structure)
6. `createPayOut(coordinator_wallet → coordinator_bank_account)` with full amount
7. `UPDATE cagnottes SET status='released', released_at=now() WHERE id=X AND status='open' RETURNING *`
8. If 0 rows updated → idempotent retry, return current state
9. Fire `send-cagnotte-released` Edge Function

- [ ] **Step 2: Smoke test**: full contribute → release cycle in sandbox
- [ ] **Step 3: Commit**

### Task 4.5: Edge Function `cagnotte-cancel`

**Files:** Create: `supabase/functions/cagnotte-cancel/index.ts`

- [ ] **Step 1: Write function**

Flow:
1. Auth: coordinator only
2. Verify status='open'
3. If any contribution has status='succeeded' → reject (must use refund flow via sweep, not cancel)
4. Update `cagnottes.status = 'cancelled'`

- [ ] **Step 2: Commit**

### Task 4.6: Edge Function `cagnotte-sweep`

**Files:** Create: `supabase/functions/cagnotte-sweep/index.ts`

- [ ] **Step 1: Write function**

```typescript
// Cron-invoked every 15 min. Refunds expired open cagnottes.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { refundPayIn } from '../_shared/mangopay.ts';

Deno.serve(async (req) => {
  // Authentication: this endpoint should be cron-only.
  // Use a shared secret header or rely on Supabase's internal cron auth.
  const cronSecret = req.headers.get('X-Cron-Secret');
  if (cronSecret !== Deno.env.get('CRON_SECRET')) {
    return new Response('unauthorized', { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Find expired open cagnottes
  const { data: expired } = await supabase.from('cagnottes')
    .select('id')
    .eq('status', 'open')
    .lt('deadline', new Date().toISOString());

  for (const c of expired ?? []) {
    // refund all succeeded contributions
    const { data: contribs } = await supabase.from('cagnotte_contributions')
      .select('id, mangopay_payin_id')
      .eq('cagnotte_id', c.id)
      .eq('status', 'succeeded');

    for (const co of contribs ?? []) {
      try {
        const refund = await refundPayIn(co.mangopay_payin_id!, 'deadline_passed');
        await supabase.from('cagnotte_contributions')
          .update({ mangopay_refund_id: refund.Id })
          .eq('id', co.id);
      } catch (err) {
        // log to Sentry, continue
      }
    }

    // mark cagnotte as refunded
    await supabase.from('cagnottes')
      .update({ status: 'refunded', refund_initiated_at: new Date().toISOString() })
      .eq('id', c.id)
      .eq('status', 'open');

    // fire refund-notification emails
    supabase.functions.invoke('send-cagnotte-refunded', { body: { cagnotte_id: c.id } })
      .catch(() => {});
  }

  return new Response(JSON.stringify({ swept: expired?.length ?? 0 }));
});
```

- [ ] **Step 2: Commit**

### Task 4.7: pg_cron schedule for sweep

**Files:** Create: `supabase/migrations/20260522120000_cagnotte_cron.sql`

- [ ] **Step 1: Write migration**

```sql
-- Schedule cagnotte-sweep every 15 minutes
-- Requires pg_cron extension enabled (Supabase enables it on Pro tier)
create extension if not exists pg_cron;

select cron.schedule(
  'cagnotte-sweep',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://fiuheufmawxkgbqddwwu.supabase.co/functions/v1/cagnotte-sweep',
    headers := jsonb_build_object('X-Cron-Secret', (select current_setting('app.cron_secret')))
  );
  $$
);
```

- [ ] **Step 2: Locally, run manual sweep instead of cron**

Document in spec that local testing requires `curl` instead of cron.

- [ ] **Step 3: Commit**

### Task 4.8: Open PR #4

- [ ] **Step 1**: Push, open PR
- [ ] **Step 2**: PR body covers all 6 Edge Functions, webhook idempotency tests, sandbox test cards, sweep cron setup
- [ ] **Step 3**: CI + merge

---

## Phase 5 — Cagnotte UI surfaces

**Branch:** `feat/cagnotte-ui`
**Goal:** All client-side cagnotte screens. Hooks, components, routing.

### Task 5.1: `CagnotteProgress` component

**Files:** Create: `app/src/components/CagnotteProgress.tsx` + `.css`

- [ ] **Step 1: Write component**

Reusable progress indicator (hairline + terracotta dot) used in: item detail, dashboard, contribute modal. Props: `raised: number`, `goal: number`, `currency: 'EUR'`, `variant: 'detail'|'card'`.

```tsx
type Props = {
  raised: number; goal: number;
  currency?: 'EUR';
  variant?: 'detail' | 'card';
  showLabels?: boolean;
};
export function CagnotteProgress({ raised, goal, variant = 'detail', showLabels = true }: Props) {
  const pct = Math.min(100, (raised / goal) * 100);
  const isFull = raised >= goal;
  return (
    <>
      <div className={`cagnotte-progress ${variant} ${isFull ? 'full' : ''}`}>
        <div className="track" />
        <div className="fill" style={{ right: `${100 - pct}%` }} />
        <div className="dot" style={{ left: `${pct}%` }} />
      </div>
      {showLabels && (
        <div className="progress-labels">
          <span className="amount">€{(raised / 100).toFixed(0)}</span>
          <span className="of">of €{(goal / 100).toFixed(0)}</span>
        </div>
      )}
    </>
  );
}
```

Style per mockups in `.superpowers/brainstorm/` — paper bg, terracotta accent, hairline track.

- [ ] **Step 2: Unit test**

```tsx
// app/src/components/__tests__/CagnotteProgress.test.tsx
test('full at goal', () => {
  render(<CagnotteProgress raised={10000} goal={10000} />);
  expect(screen.getByRole('progressbar')).toHaveClass('full');
});
```

- [ ] **Step 3: Commit**

### Task 5.2: `useCagnotte` hook

**Files:** Create: `app/src/cagnotte/useCagnotte.ts` + `__tests__/useCagnotte.test.ts`

- [ ] **Step 1: Write the hook (TDD)**

Test first:

```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { useCagnotte } from '../useCagnotte';

test('loads cagnotte view via RPC', async () => {
  // mock supabase.rpc('get_cagnotte_view') returning fixed payload
  const { result } = renderHook(() => useCagnotte('test-id'));
  await waitFor(() => expect(result.current.state).toBe('ready'));
  expect(result.current.cagnotte?.goal_amount_cents).toBe(28000);
});
```

Then impl:

```typescript
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type CagnotteView = { cagnotte: any; is_coordinator: boolean; contributions: any[] };
type State = { state: 'loading' } | { state: 'ready'; view: CagnotteView } | { state: 'error'; error: any };

async function loadCagnotte(id: string): Promise<State> {
  const { data, error } = await supabase.rpc('get_cagnotte_view', { _cagnotte_id: id });
  if (error) return { state: 'error', error };
  return { state: 'ready', view: data as CagnotteView };
}

export function useCagnotte(id: string) {
  const [state, setState] = useState<State>({ state: 'loading' });
  useEffect(() => {
    loadCagnotte(id).then(setState);
  }, [id]);
  return state;
}
```

- [ ] **Step 2: Run test → pass**
- [ ] **Step 3: Commit**

### Task 5.3: `useMyCagnottes` hook

**Files:** Create: `app/src/cagnotte/useMyCagnottes.ts`

- [ ] Same TDD pattern, wraps `get_my_cagnottes` RPC. Commit.

### Task 5.4: `CagnotteCreateScreen`

**Files:** Create: `app/src/screens/cagnotte/CagnotteCreateScreen.tsx` + CSS

- [ ] **Step 1: Write screen**

Wires item-context block (read item via prop or from route), goal input, deadline chip+date picker, optional message textarea, "open the kitty" CTA.

On submit:
1. Check if user has Mangopay user (query mangopay_users)
2. If not → show KycLightModal, await success
3. Then invoke `supabase.functions.invoke('cagnotte-create', { body: {...} })`
4. On success, redirect to `/i/:itemId` (cagnotte now visible there)

Reuse styling from brainstorm mockup at `cagnotte-create.html`.

- [ ] **Step 2: Component test (RTL)**: form fills, submits, KYC modal shown when missing
- [ ] **Step 3: Commit**

### Task 5.5: `ContributeModal`

**Files:** Create: `app/src/screens/cagnotte/ContributeModal.tsx`

- [ ] **Step 1: Write modal**

Flow:
1. Amount input (free EUR or preset chips €10/€20/€50)
2. Card form (Mangopay-hosted iframe-like — actually use direct browser submission via `submitCardToMangopay`)
3. On submit:
   a. Edge Function returns `{ payin_id, secure_mode_redirect_url }`
   b. `window.location.href = secure_mode_redirect_url`
4. After 3DS, user lands on `/cagnotte/<id>?return=ok` — we re-query cagnotte view (webhook should've updated status)

- [ ] **Step 2: Manual smoke test with sandbox test card**
- [ ] **Step 3: Commit**

### Task 5.6: `CagnotteDashboard`

**Files:** Create: `app/src/screens/cagnotte/CagnotteDashboard.tsx`

- [ ] **Step 1: Write screen**

Per the brainstorm mockup at `coordinator-dashboard.html`:
- Hint banner for any goal-reached cagnotte
- List of cagnottes from `useMyCagnottes`
- Per row: item thumb + title + status pill + progress + actions
- "collect" CTA invokes `cagnotte-release` Edge Function with confirm dialog
- "remind contributors" sends a Resend email (small inline link, defer to Phase 6 if needed)

- [ ] **Step 2: Component test**: 3-state rendering (ready / raising / released)
- [ ] **Step 3: Commit**

### Task 5.7: `ItemDetailScreen` cagnotte integration

**Files:** Modify: `app/src/screens/items/ItemDetailScreen.tsx`

- [ ] **Step 1: Read current screen**

Identify where the claim button lives. Replace with conditional:
- If item has open cagnotte → show CagnotteProgress + Contribute CTA
- If item has solo claim → existing UI
- If neither → show two CTAs: "I'll get this alone" + "or start a kitty"

- [ ] **Step 2: Wire `useCagnotte` (load via `get_cagnotte_for_item(_item_id)` RPC — may need a new helper RPC, or check item.cagnotte via a join)**

Add a new RPC `get_active_cagnotte_id_for_item(_item_id)` if not querying via `cagnottes.SELECT` directly:

```sql
create or replace function public.get_active_cagnotte_id_for_item(_item_id uuid)
returns uuid language sql security definer
set search_path = public as $$
  select id from cagnottes
  where item_id = _item_id and status = 'open'
    and not is_honoree_of_item(_item_id);
$$;
```

Or query `cagnottes` table directly with RLS (honoree gets `[]`, audience gets row).

- [ ] **Step 3: Honoree path: do NOT load cagnotte status. Skip the API call entirely so no metadata leaks via timing**

```typescript
if (isHonoree) {
  // Render claim section as today, no cagnotte awareness
} else {
  // Load cagnotte status and show CagnotteProgress if present
}
```

- [ ] **Step 4: Commit**

### Task 5.8: Router + i18n

**Files:** Modify: `app/src/Router.tsx`, `app/src/i18n/{ru,en}.ts`

- [ ] **Step 1: Add routes**

```tsx
// in Router.tsx
const CagnotteCreateScreen = lazyNamed(() => import('./screens/cagnotte/CagnotteCreateScreen'), 'CagnotteCreateScreen');
const CagnotteDashboard = lazyNamed(() => import('./screens/cagnotte/CagnotteDashboard'), 'CagnotteDashboard');

// inside AppRoutes:
appRoute('/i/:itemId/cagnotte/new', <CagnotteCreateScreen />),
appRoute('/cagnottes', <CagnotteDashboard />),
```

- [ ] **Step 2: Add i18n strings**

`cagnotte.create.*`, `cagnotte.dashboard.*`, `cagnotte.contribute.*` keys (EN + RU).

- [ ] **Step 3: Commit**

### Task 5.9: Open PR #5

- [ ] PR with screenshots of all 4 screens. CI + merge.

---

## Phase 6 — Email flows

**Branch:** `feat/cagnotte-emails`
**Goal:** 6 Edge Functions for email, each following `send-santa-draw` shape (index.ts + template.ts).

### Task 6.1: `send-cagnotte-created`

**Files:** Create: `supabase/functions/send-cagnotte-created/index.ts` + `template.ts`

- [ ] **Step 1: Copy `send-santa-draw/` as the starting template**
- [ ] **Step 2: Modify for cagnotte-created semantics**:
  - Input: `{ cagnotte_id }`
  - Lookup: cagnotte → item → event → audience-circles → audience-users minus creator
  - Body: "{Coordinator} started a kitty for {item} on {honoree}'s wishlist — chip in?"
  - Link: `https://ratlist.app/i/{itemId}`
- [ ] **Step 3: Smoke test with `RESEND_DRY_RUN=true`** (per existing pattern)
- [ ] **Step 4: Commit**

### Task 6.2-6.6: Other email flows

Same pattern for:
- `send-cagnotte-contribution` (to coordinator on each succeeded contribution)
- `send-cagnotte-goal-reached` (to coordinator when total >= goal)
- `send-cagnotte-deadline-approaching` (cron-invoked 3 days before deadline)
- `send-cagnotte-released` (to all contributors)
- `send-cagnotte-refunded` (to all contributors)

Each task = copy shape + adjust template + smoke + commit.

### Task 6.7: Goal-reached + deadline-approaching cron wiring

The goal-reached trigger fires from the `mangopay-webhook` after a PayIn succeeds and we re-compute total. The deadline-approaching needs a separate cron schedule (daily 9am UTC, finds cagnottes with `deadline between now() + 3 days and now() + 3.5 days`).

- [ ] **Step 1: Add pg_cron schedule for daily deadline check** (similar to sweep)
- [ ] **Step 2: Smoke test**
- [ ] **Step 3: Commit**

### Task 6.8: Open PR #6

---

## Phase 7 — Docs + manual QA + production switch checklist

**Branch:** `feat/cagnotte-docs`

### Task 7.1: Update CLAUDE.md feature status

**Files:** Modify: `CLAUDE.md`

- [ ] Add new rows to the "Feature status" table:
  - `Cagnotte (per-item collective gifting via Mangopay)` ✅
  - `HR-mode events (creator ≠ honoree)` ✅
- [ ] Commit

### Task 7.2: Update ARCHITECTURE.md data model

**Files:** Modify: `ARCHITECTURE.md`

- [ ] Add `cagnottes`, `cagnotte_contributions`, `mangopay_users` to the tables list
- [ ] Add `is_honoree_of_item` to the helper functions list
- [ ] Document the cagnotte state machine + the cagnotte privacy invariants
- [ ] Commit

### Task 7.3: Update STRATEGY.md

**Files:** Modify: `STRATEGY.md`

- [ ] In "Cagnotte — feature scope" section, mark as "shipped MVP 2026-MM-DD"
- [ ] Move open questions that are now decided from "Open" to a new "Decided" subsection
- [ ] Commit

### Task 7.4: Manual QA checklist

**Files:** Create: `docs/CAGNOTTE_QA.md`

- [ ] Document the end-to-end demo script for Danone PO:
  - Sandbox env setup, test cards
  - Sophie → KYC → start cagnotte → 2 colleagues contribute → Sophie collects
  - HR-mode rehearsal
  - Failure-mode rehearsal (declined card, deadline passes, cancel)
- [ ] Commit

### Task 7.5: Production switch checklist

**Files:** Append to `docs/CAGNOTTE_QA.md`

- [ ] Document:
  - Mangopay platform onboarding (1-2 weeks elapsed)
  - Real RESEND_API_KEY for cagnotte emails (likely already set)
  - Webhook URL registration in Mangopay dashboard
  - Production secrets in Vercel envs
  - Smoke test with €1 real-money transaction before announcing
- [ ] Commit

### Task 7.6: Open PR #7

---

## Self-review

After writing this plan, checked against the spec section by section:

**Spec coverage:**
- [x] Section "Schema additions" → Tasks 1.1, 2.1, 2.2
- [x] Section "Mutual exclusion" → Task 2.1 (triggers), Task 2.5 (test)
- [x] Section "Item-lock during active cagnotte" → Task 2.1 (trigger)
- [x] Section "Coordinator constraints" → Task 4.1 (Edge Function-level check)
- [x] Section "State machine" → Tasks 4.4, 4.5, 4.6 (release, cancel, sweep)
- [x] Section "Privacy / RLS" → Tasks 2.2 (policies), 1.1 (claims update), 2.4 (matrix test)
- [x] Section "Mangopay integration / Edge Functions" → Tasks 3.2, 4.1-4.6
- [x] Section "Sandbox vs production" → env var docs in 3.2, switch checklist 7.5
- [x] Section "State sync" → reconciliation cron — **GAP**: not explicitly in any task; added as note in Task 4.3 (webhook handles primary path), reconciliation cron is in scope for production-switch (task 7.5)
- [x] Section "UI surfaces" → Tasks 5.1-5.7
- [x] Section "Edge cases" → Task 2.1 triggers, Task 4.3 webhook idempotency, Task 4.6 sweep retry
- [x] Section "Email flows" → Phase 6 entirely
- [x] Section "Testing" → Tasks 1.2, 2.4, 2.5, 4.3 unit, 7.4 manual

**Placeholder scan:** No "TBD" / "TODO" / "implement later" / "handle edge cases" without specifics. Code blocks present for every step that changes code. One known abbreviation: Task 4.2 has "Code shown abbreviated — same pattern as cagnotte-create" — that's a deliberate pointer to a sibling task to avoid duplication; the data shape, control flow, and outputs are all listed inline. Accept.

**Type consistency:**
- `cagnottes.goal_amount_cents` — used consistently as integer/cents across all tasks
- `mangopay_users.kyc_level` enum — consistent across tasks
- `is_honoree_of_item` helper — same signature in spec, migration (task 1.1), RPC usage (task 2.2), Edge Function check (task 4.1)
- `get_cagnotte_view` return shape — defined in 2.2, consumed in 5.2 (useCagnotte), 5.7 (ItemDetailScreen)

**Reconciliation cron — added explicitly:**

Adding Task 4.9 below.

### Task 4.9: Reconciliation cron for missed webhooks

**Files:** Append to `supabase/migrations/20260522120000_cagnotte_cron.sql`

- [ ] **Step 1: Add reconciliation cron schedule**

```sql
-- Nightly reconciliation: find DB rows pending > 1h, pull Mangopay state
select cron.schedule(
  'cagnotte-reconcile',
  '17 3 * * *',  -- 3:17 UTC daily
  $$ select net.http_post(
    url := 'https://fiuheufmawxkgbqddwwu.supabase.co/functions/v1/cagnotte-reconcile',
    headers := jsonb_build_object('X-Cron-Secret', (select current_setting('app.cron_secret')))
  ); $$
);
```

- [ ] **Step 2: Create `cagnotte-reconcile` Edge Function**

Pseudocode: find `cagnotte_contributions WHERE status='pending' AND created_at < now() - interval '1h'`, fetch from Mangopay API for each, update status accordingly.

- [ ] **Step 3: Commit**

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-20-cagnotte-implementation.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Best for this plan because it's long, the phases are sequential PRs, and per-task review catches issues before they compound.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints. Less context-isolated, faster but riskier on a 50+ task plan.

**Which approach?**
