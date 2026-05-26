# Priority DnD Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Section MyList, friend list (`/p/:userId`), public share (`/share/<token>`), and event detail (`/events/:id`) by priority level (•••/••/•). Make MyList rows draggable between sections; drop fires a single `UPDATE items SET priority = N`. Schema, the `PriorityDots` visual, and the form chips are unchanged.

**Architecture:** Pure helper `groupByPriority(items)` returns a fixed 3-tuple of `{ level, items[] }`. A new `<PrioritySectionHeader>` renders the section title (dots + label + Caveat count + dashed hairline). `<ItemList>` gains a `mode` prop (`flat` / `sectioned` / `sectioned-dnd`). `sectioned-dnd` wraps each row in a `<SortableItemRow>` that uses `useSortable` from `@dnd-kit/sortable`. `MyListScreen` owns the `<DndContext>` with PointerSensor (distance 5px), TouchSensor (delay 250ms), KeyboardSensor — and a single `onDragEnd` handler that calls a new `useMyItems.updateItemPriority(id, level)` method with optimistic local update + revert-on-error. The three read-only screens (`PublicListScreen`, `FriendListScreen`, `EventDetailScreen`) get the same section grouping with `<PrioritySectionHeader>` but no `<DndContext>` and no `<SortableItemRow>`. i18n adds a new `priority.*` group for section labels and a11y announcements; existing `item.priorityLow/Mid/High` (used by form chips) is untouched.

**Tech Stack:** Vite + React 19 + TypeScript (strict, `noUncheckedIndexedAccess`), `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` (new deps). Vitest + React Testing Library + `@testing-library/user-event` for component tests. Existing Supabase realtime channel handles cross-device sync. Conventional commits (`test(area):`, `feat(area):`, `fix(area):`, `chore:`). Branch protection on `main` — direct push blocked. All work lands on one branch: continue on `docs/priority-dnd-sections-spec` (rename to `feat/priority-dnd-sections` before opening the PR).

**Spec reference:** [`docs/superpowers/specs/2026-05-26-priority-dnd-sections-design.md`](../specs/2026-05-26-priority-dnd-sections-design.md)

---

## TDD discipline — non-negotiable

For every component, hook method, helper:

1. **Write the failing test.** The test asserts the target behavior.
2. **Run it → MUST FAIL** with a recognisable error (function not defined / element not in DOM / mock not called).
3. **Commit the test** with `test(area):` prefix.
4. **Write the minimal implementation** to make the test pass.
5. **Run it → MUST PASS.**
6. **Commit the implementation** with `feat(area):` prefix.

Pure i18n string additions and dependency installs don't need a red commit — bundle them with the first task that consumes them.

---

## Phasing — single PR, internal phases

User requested one PR for the whole feature. Internal phases below are for cognitive structure and good commit history, not separate branches.

| Phase | Scope |
|---|---|
| **A** | Dependencies + pure helpers (`groupByPriority`, `PrioritySectionHeader`) + i18n |
| **B** | Data layer (`useMyItems.updateItemPriority`) |
| **C** | Sortable infrastructure (`SortableItemRow`, `<ItemList mode>` extension) |
| **D** | MyList wiring (DndContext, sensors, onDragEnd) |
| **E** | Read-only sectioning on three other screens |
| **F** | A11y announcements + integration test + manual smoke |

End of Phase F: rename branch, push, open PR.

> **Note on task numbering:** Task numbers 4 and 9 are intentionally
> skipped — work originally planned for those slots was consolidated
> into adjacent tasks (i18n into Task 3, MyList smoke into Task 8 step 7).
> All remaining numbers (1, 2, 3, 5, 6, 7, 8, 10–17) are stable; checkbox
> tracking and cross-references throughout the plan use these stable
> numbers. Execute in document order.

---

## File map

```
app/
├── package.json                                       [Task 1]   add deps
├── src/
│   ├── items/
│   │   ├── groupByPriority.ts                         [Task 2]   NEW pure helper
│   │   ├── __tests__/groupByPriority.test.ts          [Task 2]   NEW
│   │   ├── useMyItems.ts                              [Task 5]   + updateItemPriority
│   │   └── __tests__/useMyItems.test.tsx              [Task 5]   + updateItemPriority cases
│   ├── components/
│   │   ├── PrioritySectionHeader.tsx                  [Task 3]   NEW
│   │   └── __tests__/PrioritySectionHeader.test.tsx   [Task 3]   NEW
│   ├── screens/
│   │   ├── items/
│   │   │   ├── SortableItemRow.tsx                    [Task 6]   NEW
│   │   │   ├── __tests__/SortableItemRow.test.tsx     [Task 6]   NEW
│   │   │   ├── ItemList.tsx                           [Task 7]   + mode prop
│   │   │   ├── __tests__/ItemList.test.tsx            [Task 7]   + sectioned modes
│   │   │   └── MyListScreen.tsx                       [Task 8]   + DndContext + handler
│   │   ├── PublicListScreen.tsx                       [Task 10]  + sectioning (read-only)
│   │   ├── people/FriendListScreen.tsx                [Task 11]  + sectioning (read-only)
│   │   └── events/EventDetailScreen.tsx               [Task 12]  + sectioning (read-only)
│   └── i18n/
│       ├── ru.ts                                      [Task 4]   + priority.*
│       └── en.ts                                      [Task 4]   + priority.*
└── (vitest config — no changes)

supabase/tests/integration/
└── priority-update-rls.test.ts                        [Task 14]  NEW — explicit owner-only assert
```

---

## Phase A — Dependencies + helpers + i18n

### Task 1: Install dnd-kit

**Files:**
- Modify: `app/package.json`

- [ ] **Step 1: Install runtime deps**

Run from `app/`:
```bash
npm install @dnd-kit/core@^6.3.1 @dnd-kit/sortable@^10.0.0 @dnd-kit/utilities@^3.2.2
```

(Pin to current stable majors. Check https://github.com/clauderic/dnd-kit/releases for newer if a maintenance update has landed.)

- [ ] **Step 2: Verify install**

```bash
cd app && grep -E '"@dnd-kit/' package.json
```
Expected: three lines with the three packages.

- [ ] **Step 3: Verify tsc still clean**

```bash
cd app && npx tsc -p tsconfig.app.json --noEmit
```
Expected: no output (success).

- [ ] **Step 4: Verify tests still pass**

```bash
cd app && npm test -- --run
```
Expected: all green, no new failures.

- [ ] **Step 5: Commit**

```bash
git add app/package.json app/package-lock.json
git commit -m "$(cat <<'EOF'
chore(deps): add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities

Foundation for the priority DnD sections feature. ~10KB gzipped, tree-shakeable,
built-in touch + keyboard sensors. Single React 19-compatible option still
maintained (RBDnD is deprecated, react-dnd is HTML5-only).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `groupByPriority` pure helper

**Files:**
- Create: `app/src/items/groupByPriority.ts`
- Create: `app/src/items/__tests__/groupByPriority.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/src/items/__tests__/groupByPriority.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { groupByPriority } from '../groupByPriority';

interface Stub { id: string; priority: number; }

describe('groupByPriority', () => {
  it('returns three sections in level order [1, 2, 3]', () => {
    const sections = groupByPriority<Stub>([]);
    expect(sections).toHaveLength(3);
    expect(sections[0]!.level).toBe(1);
    expect(sections[1]!.level).toBe(2);
    expect(sections[2]!.level).toBe(3);
  });

  it('returns empty buckets when input is empty', () => {
    const sections = groupByPriority<Stub>([]);
    expect(sections[0]!.items).toEqual([]);
    expect(sections[1]!.items).toEqual([]);
    expect(sections[2]!.items).toEqual([]);
  });

  it('buckets items by priority value', () => {
    const items: Stub[] = [
      { id: 'a', priority: 1 },
      { id: 'b', priority: 2 },
      { id: 'c', priority: 3 },
      { id: 'd', priority: 1 },
    ];
    const [high, mid, low] = groupByPriority(items);
    expect(high!.items.map((i) => i.id)).toEqual(['a', 'd']);
    expect(mid!.items.map((i) => i.id)).toEqual(['b']);
    expect(low!.items.map((i) => i.id)).toEqual(['c']);
  });

  it('preserves within-section order from input', () => {
    const items: Stub[] = [
      { id: '3', priority: 2 },
      { id: '1', priority: 2 },
      { id: '2', priority: 2 },
    ];
    const [, mid] = groupByPriority(items);
    expect(mid!.items.map((i) => i.id)).toEqual(['3', '1', '2']);
  });

  it('coerces out-of-range priority to level 2 (defensive)', () => {
    const items: Stub[] = [
      { id: 'x', priority: 0 },
      { id: 'y', priority: 7 },
    ];
    const [, mid] = groupByPriority(items);
    expect(mid!.items.map((i) => i.id)).toEqual(['x', 'y']);
  });
});
```

(`noUncheckedIndexedAccess` requires `!` on indexed access.)

- [ ] **Step 2: Run test to verify it fails**

```bash
cd app && npm test -- --run groupByPriority
```
Expected: FAIL with `Cannot find module '../groupByPriority'`.

- [ ] **Step 3: Commit the failing test**

```bash
git add app/src/items/__tests__/groupByPriority.test.ts
git commit -m "$(cat <<'EOF'
test(items): groupByPriority pure helper — three sections in [1,2,3] order

Bucketing by priority, preserving input order within each bucket, defensive
coercion of out-of-range values to level 2.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Write the implementation**

Create `app/src/items/groupByPriority.ts`:

```ts
/**
 * `groupByPriority` — bucket a list of items into three fixed sections by
 * priority level (1 = «очень хочу», 2 = «хочу», 3 = «если найдётся»). Returns
 * a deterministic 3-tuple in display order so callers can destructure as
 * `const [high, mid, low] = groupByPriority(items)` without worrying about
 * key ordering.
 *
 * Items keep their incoming order within each section — the caller is
 * responsible for sort (typically `created_at desc` upstream).
 *
 * Pure / no React / no side effects.
 */
export type PriorityLevel = 1 | 2 | 3;

export interface PrioritySection<T extends { priority: number }> {
  level: PriorityLevel;
  items: T[];
}

export function groupByPriority<T extends { priority: number }>(
  items: readonly T[],
): readonly [PrioritySection<T>, PrioritySection<T>, PrioritySection<T>] {
  const buckets: Record<PriorityLevel, T[]> = { 1: [], 2: [], 3: [] };
  for (const item of items) {
    // DB has a CHECK constraint guaranteeing 1..3, but the type system
    // can't see it through PostgrestResponse — coerce anything else to 2
    // (the DB default) so we never silently drop a row.
    const lvl: PriorityLevel = item.priority === 1 || item.priority === 3 ? item.priority : 2;
    buckets[lvl].push(item);
  }
  return [
    { level: 1, items: buckets[1] },
    { level: 2, items: buckets[2] },
    { level: 3, items: buckets[3] },
  ] as const;
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd app && npm test -- --run groupByPriority
```
Expected: 5 passing tests.

- [ ] **Step 6: Commit the implementation**

```bash
git add app/src/items/groupByPriority.ts
git commit -m "$(cat <<'EOF'
feat(items): groupByPriority pure helper

Pure function bucketing items into fixed [1,2,3] sections. Used by
sectioned list views in MyList, FriendList, PublicList, EventDetail.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `<PrioritySectionHeader>` component

**Files:**
- Create: `app/src/components/PrioritySectionHeader.tsx`
- Create: `app/src/components/__tests__/PrioritySectionHeader.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `app/src/components/__tests__/PrioritySectionHeader.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PrioritySectionHeader } from '../PrioritySectionHeader';
import { I18nProvider } from '../../i18n/I18nProvider';

function renderWithI18n(ui: React.ReactNode) {
  return render(<I18nProvider initialLang="ru">{ui}</I18nProvider>);
}

describe('<PrioritySectionHeader>', () => {
  it('renders the «Очень хочу» label and count for level 1', () => {
    renderWithI18n(<PrioritySectionHeader level={1} count={3} />);
    expect(screen.getByText('Очень хочу')).toBeInTheDocument();
    expect(screen.getByText('— 3')).toBeInTheDocument();
  });

  it('renders the «Хочу» label for level 2', () => {
    renderWithI18n(<PrioritySectionHeader level={2} count={0} />);
    expect(screen.getByText('Хочу')).toBeInTheDocument();
    expect(screen.getByText('— 0')).toBeInTheDocument();
  });

  it('renders the «Если найдётся» label for level 3', () => {
    renderWithI18n(<PrioritySectionHeader level={3} count={1} />);
    expect(screen.getByText('Если найдётся')).toBeInTheDocument();
  });
});
```

If `I18nProvider` doesn't accept `initialLang`, check `app/src/i18n/I18nProvider.tsx` for the actual prop name and adjust. (It exists per the codebase; the test wrapper is the standard pattern used in other component tests.)

- [ ] **Step 2: Run test to verify it fails**

```bash
cd app && npm test -- --run PrioritySectionHeader
```
Expected: FAIL with `Cannot find module '../PrioritySectionHeader'`.

- [ ] **Step 3: Commit the failing test**

```bash
git add app/src/components/__tests__/PrioritySectionHeader.test.tsx
git commit -m "$(cat <<'EOF'
test(components): PrioritySectionHeader renders label + count per level

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Write the i18n additions FIRST (test depends on them)**

Edit `app/src/i18n/ru.ts` — add a new `priority` group at top level (after the existing `item` group, before `friend`):

```ts
priority: {
  sectionHigh:      'Очень хочу',
  sectionMid:       'Хочу',
  sectionLow:       'Если найдётся',
  sectionEmptyHint: 'здесь пусто — перетащи сюда что-то',
  a11yGrabbed:      'Взято: {title}. Используй стрелки чтобы переместить.',
  a11yMovedTo:      'Перемещено в «{section}».',
  a11yDropped:      'Сохранено в «{section}».',
  a11yCanceled:     'Отменено.',
},
```

Edit `app/src/i18n/en.ts` — mirror the same shape:

```ts
priority: {
  sectionHigh:      'Really want',
  sectionMid:       'Want',
  sectionLow:       'If found',
  sectionEmptyHint: 'empty — drag something here',
  a11yGrabbed:      'Grabbed: {title}. Use arrows to move.',
  a11yMovedTo:      'Moved to "{section}".',
  a11yDropped:      'Saved to "{section}".',
  a11yCanceled:     'Cancelled.',
},
```

(Don't delete or rename existing `item.priorityLow/Mid/High` — those are still used by the form chips.)

- [ ] **Step 5: Write the component**

Create `app/src/components/PrioritySectionHeader.tsx`:

```tsx
/**
 * `<PrioritySectionHeader>` — the editorial-style section title above each
 * priority bucket in a sectioned item list. Layout:
 *
 *   ••• Очень хочу  — 3
 *   ─ ─ ─ ─ ─ ─ ─ ─
 *
 * Dots reuse the existing `<PriorityDots>` component so the visual language
 * stays in sync. Count is rendered in Caveat (marginalia font) so it reads
 * as a note rather than a counter.
 */
import { useI18n } from '../i18n/useI18n';
import { PriorityDots } from './PriorityDots';
import type { PriorityLevel } from '../items/groupByPriority';

const LABEL_KEYS: Record<PriorityLevel, string> = {
  1: 'priority.sectionHigh',
  2: 'priority.sectionMid',
  3: 'priority.sectionLow',
};

export interface PrioritySectionHeaderProps {
  level: PriorityLevel;
  count: number;
}

export function PrioritySectionHeader({ level, count }: PrioritySectionHeaderProps) {
  const { t } = useI18n();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 'var(--s-3)',
        padding: 'var(--s-4) 0 var(--s-2)',
        borderBottom: '1px dashed var(--hair-strong)',
        marginBottom: 'var(--s-2)',
      }}
    >
      <PriorityDots level={level} />
      <span
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: 0.08,
          textTransform: 'uppercase',
          color: 'var(--ink-2)',
        }}
      >
        {t(LABEL_KEYS[level])}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-hand)',
          fontSize: 16,
          fontWeight: 500,
          color: 'var(--ink-3)',
        }}
      >
        — {count}
      </span>
    </div>
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
cd app && npm test -- --run PrioritySectionHeader
```
Expected: 3 passing tests.

- [ ] **Step 7: Verify full suite still green**

```bash
cd app && npm test -- --run && npx tsc -p tsconfig.app.json --noEmit
```
Expected: all green.

- [ ] **Step 8: Commit i18n + component together**

```bash
git add app/src/i18n/ru.ts app/src/i18n/en.ts app/src/components/PrioritySectionHeader.tsx
git commit -m "$(cat <<'EOF'
feat(components): PrioritySectionHeader + priority.* i18n group

Editorial-style section header (dots + label + Caveat count + dashed
hairline) used by all sectioned list views. New i18n group covers section
labels and a11y announcements for the upcoming DnD interaction.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase B — Data layer

### Task 5: `useMyItems.updateItemPriority`

**Files:**
- Modify: `app/src/items/useMyItems.ts`
- Modify: `app/src/items/__tests__/useMyItems.test.tsx`

Background: the existing hook returns `{ query, refresh, createItem, updateItem, deleteItem, updateStatus }`. We're adding one more method. The mock pattern in the test file uses a chained mock — read the test file first to see the `chain` object and how prior `update` cases are written.

- [ ] **Step 1: Write the failing tests**

Add to the existing `app/src/items/__tests__/useMyItems.test.tsx`, inside the outer `describe('useMyItems', ...)` block (probably at the end, after the existing groups):

```tsx
describe('updateItemPriority', () => {
  beforeEach(() => {
    // The hook mock is reset in the outer beforeEach; we additionally
    // need a clean update mock for the priority-specific assertions.
    chain.update.mockReset();
    chain.eq.mockReset();
    chain.update.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
  });

  it('updates priority and returns ok on success', async () => {
    stubAuthUser('user-1');
    chain.select.mockResolvedValueOnce({ data: [], error: null });
    chain.update.mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    });

    const { result } = renderHook(() => useMyItems());
    await waitFor(() => expect(result.current.query.status).toBe('ready'));

    let outcome: { ok: true } | { error: string } | undefined;
    await act(async () => {
      outcome = await result.current.updateItemPriority('item-1', 3);
    });

    expect(outcome).toEqual({ ok: true });
    expect(mockSupabase.from).toHaveBeenCalledWith('items');
    expect(chain.update).toHaveBeenCalledWith({ priority: 3 });
  });

  it('returns an error string when the UPDATE fails', async () => {
    stubAuthUser('user-1');
    chain.select.mockResolvedValueOnce({ data: [], error: null });
    chain.update.mockReturnValue({
      eq: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'permission denied', code: '42501' },
      }),
    });

    const { result } = renderHook(() => useMyItems());
    await waitFor(() => expect(result.current.query.status).toBe('ready'));

    let outcome: { ok: true } | { error: string } | undefined;
    await act(async () => {
      outcome = await result.current.updateItemPriority('item-1', 1);
    });

    expect(outcome).toHaveProperty('error');
    // Specific error mapping comes from lib/errors.ts; just assert non-empty.
    expect((outcome as { error: string }).error.length).toBeGreaterThan(0);
  });

  it('optimistically updates local items, then keeps them on success', async () => {
    stubAuthUser('user-1');
    chain.select.mockResolvedValueOnce({
      data: [
        { id: 'item-1', owner_id: 'user-1', title: 'X', priority: 2,
          item_groups: [], event_items: [] },
      ],
      error: null,
    });
    chain.update.mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    });

    const { result } = renderHook(() => useMyItems());
    await waitFor(() => expect(result.current.query.status).toBe('ready'));

    await act(async () => {
      await result.current.updateItemPriority('item-1', 1);
    });

    const items = result.current.query.status === 'ready' ? result.current.query.items : [];
    const updated = items.find((i) => i.id === 'item-1');
    expect(updated?.priority).toBe(1);
  });

  it('reverts local state when the UPDATE fails', async () => {
    stubAuthUser('user-1');
    chain.select.mockResolvedValueOnce({
      data: [
        { id: 'item-1', owner_id: 'user-1', title: 'X', priority: 2,
          item_groups: [], event_items: [] },
      ],
      error: null,
    });
    chain.update.mockReturnValue({
      eq: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'boom', code: 'XXXXX' },
      }),
    });

    const { result } = renderHook(() => useMyItems());
    await waitFor(() => expect(result.current.query.status).toBe('ready'));

    await act(async () => {
      await result.current.updateItemPriority('item-1', 1);
    });

    const items = result.current.query.status === 'ready' ? result.current.query.items : [];
    const reverted = items.find((i) => i.id === 'item-1');
    expect(reverted?.priority).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd app && npm test -- --run useMyItems
```
Expected: FAIL — the existing tests pass, the four new ones fail with `result.current.updateItemPriority is not a function`.

- [ ] **Step 3: Commit the failing tests**

```bash
git add app/src/items/__tests__/useMyItems.test.tsx
git commit -m "$(cat <<'EOF'
test(items): useMyItems.updateItemPriority — happy + error + optimistic revert

Locks the contract: UPDATE fires with { priority: N }, returns ok on success
and an error string on failure, optimistically updates local state, and
reverts the local state on UPDATE error.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Extend the hook**

In `app/src/items/useMyItems.ts`:

1. Extend the `UseMyItemsResult` interface (around line 48-60):

```ts
export interface UseMyItemsResult {
  query: ItemsQuery;
  refresh: () => Promise<void>;
  createItem: (input: CreateItemInput) => Promise<{ item: MyItem } | { error: string }>;
  updateItem: (id: string, input: CreateItemInput) => Promise<{ item: MyItem } | { error: string }>;
  deleteItem: (itemId: string) => Promise<{ ok: true } | { error: string }>;
  updateStatus: (itemId: string, status: ItemStatus) => Promise<{ ok: true } | { error: string }>;
  /**
   * Change an item's priority level. Optimistically updates the local
   * cache, then issues the UPDATE. Reverts the cache on server error.
   */
  updateItemPriority: (itemId: string, priority: 1 | 2 | 3) => Promise<{ ok: true } | { error: string }>;
}
```

2. Inside `useMyItems()`, after the existing `updateStatus` method, add (following the existing pattern of `useCallback` + optimistic update where applicable):

```ts
const updateItemPriority = useCallback(
  async (itemId: string, priority: 1 | 2 | 3): Promise<{ ok: true } | { error: string }> => {
    // Snapshot the prior value so we can revert if the UPDATE fails.
    let priorPriority: 1 | 2 | 3 | null = null;
    setState((prev) => {
      if (prev.kind !== 'loaded') return prev;
      const items = prev.items.map((i) => {
        if (i.id !== itemId) return i;
        priorPriority = (i.priority === 1 || i.priority === 3 ? i.priority : 2) as 1 | 2 | 3;
        return { ...i, priority };
      });
      return { ...prev, items };
    });

    const { error } = await supabase
      .from('items')
      .update({ priority })
      .eq('id', itemId);

    if (error) {
      // Revert the optimistic change.
      if (priorPriority !== null) {
        const snapshot = priorPriority;
        setState((prev) => {
          if (prev.kind !== 'loaded') return prev;
          const items = prev.items.map((i) =>
            i.id === itemId ? { ...i, priority: snapshot } : i,
          );
          return { ...prev, items };
        });
      }
      return { error: errorMessageFromUnknown(error) };
    }

    track('item_priority_changed', { from: priorPriority ?? 'unknown', to: priority });
    return { ok: true };
  },
  [],
);
```

Then add it to the returned object:

```ts
return useMemo(
  () => ({
    query,
    refresh,
    createItem,
    updateItem,
    deleteItem,
    updateStatus,
    updateItemPriority,
  }),
  [query, refresh, createItem, updateItem, deleteItem, updateStatus, updateItemPriority],
);
```

If the hook doesn't already import `errors.ts`'s helper for mapping unknown errors, add the import. The exact import name is in `app/src/lib/errors.ts` — typically `errorMessage` or `errorMessageFromUnknown`. Read the existing imports in `useMyItems.ts` first to follow the file's convention; if no such import exists, use the canonical pattern (`return { error: error.message ?? 'Unknown error' }`).

- [ ] **Step 5: Run test to verify it passes**

```bash
cd app && npm test -- --run useMyItems
```
Expected: all tests in `useMyItems.test.tsx` pass.

- [ ] **Step 6: tsc + full suite**

```bash
cd app && npx tsc -p tsconfig.app.json --noEmit && npm test -- --run
```
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add app/src/items/useMyItems.ts
git commit -m "$(cat <<'EOF'
feat(items): useMyItems.updateItemPriority

New method on the hook. Optimistic local update, single UPDATE round-trip
against `items.priority`, reverts the local cache on server error.

RLS already permits owner-only UPDATE (no policy change needed). The
existing realtime subscription will refetch on the broadcast — harmless
no-op since optimistic data matches.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase C — Sortable infrastructure

### Task 6: `<SortableItemRow>` component

**Files:**
- Create: `app/src/screens/items/SortableItemRow.tsx`
- Create: `app/src/screens/items/__tests__/SortableItemRow.test.tsx`

This component wraps a single row's children in `useSortable`. It's intentionally generic — the children are passed in by the parent (`<ItemList>`), so the row's visual is controlled by whichever screen renders the list. The component's only job is to attach the sortable behavior and DOM props.

- [ ] **Step 1: Write the failing test**

Create `app/src/screens/items/__tests__/SortableItemRow.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { SortableItemRow } from '../SortableItemRow';

function renderInDnd(ui: React.ReactNode, ids: string[]) {
  return render(
    <DndContext>
      <SortableContext items={ids}>{ui}</SortableContext>
    </DndContext>,
  );
}

describe('<SortableItemRow>', () => {
  it('renders its children', () => {
    renderInDnd(
      <SortableItemRow id="item-1">
        <div>hello row</div>
      </SortableItemRow>,
      ['item-1'],
    );
    expect(screen.getByText('hello row')).toBeInTheDocument();
  });

  it('exposes a drag handle as a data attribute', () => {
    renderInDnd(
      <SortableItemRow id="item-1">
        <div>row body</div>
      </SortableItemRow>,
      ['item-1'],
    );
    expect(screen.getByTestId('drag-handle')).toBeInTheDocument();
  });

  it('marks the row with role and aria attributes for keyboard a11y', () => {
    renderInDnd(
      <SortableItemRow id="item-1">
        <div>row</div>
      </SortableItemRow>,
      ['item-1'],
    );
    const handle = screen.getByTestId('drag-handle');
    expect(handle).toHaveAttribute('aria-label');
    expect(handle).toHaveAttribute('tabIndex');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd app && npm test -- --run SortableItemRow
```
Expected: FAIL with `Cannot find module '../SortableItemRow'`.

- [ ] **Step 3: Commit the failing test**

```bash
git add app/src/screens/items/__tests__/SortableItemRow.test.tsx
git commit -m "$(cat <<'EOF'
test(items): SortableItemRow — renders children, exposes drag handle + a11y attrs

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Write the implementation**

Create `app/src/screens/items/SortableItemRow.tsx`:

```tsx
/**
 * `<SortableItemRow>` — wraps a single list row in `useSortable` so it can
 * be picked up and dropped into a different priority section. The row's
 * visual is whatever the caller renders as children — we only attach the
 * sortable behavior and the keyboard-accessible drag handle.
 *
 * The handle (⋮⋮) sits absolutely-positioned to the right of the row so
 * the row's existing layout doesn't need to know about it. It's
 * keyboard-focusable (tabIndex 0); pressing Space on it grabs the row.
 *
 * While dragging, the row's children get a soft scale + opacity dim, and
 * link clicks inside are suppressed via `pointer-events: none` so the
 * underlying `<Link>` doesn't navigate when the user releases the drag.
 */
import { type ReactNode } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useI18n } from '../../i18n/useI18n';

export interface SortableItemRowProps {
  /** Stable unique ID for the sortable system — typically `item.id`. */
  id: string;
  /** Row content (photo, body, etc.) rendered as-is. */
  children: ReactNode;
}

export function SortableItemRow({ id, children }: SortableItemRowProps) {
  const { t } = useI18n();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{
        position: 'relative',
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        // `touch-action: none` while dragging prevents the browser from
        // hijacking the gesture for scroll. Idle, `manipulation` keeps tap
        // working without the 300ms iOS Safari delay.
        touchAction: isDragging ? 'none' : 'manipulation',
      }}
    >
      <div
        style={{
          // Suppress link clicks inside the row while a drag is in progress
          // so dropping on the same row doesn't navigate to item detail.
          pointerEvents: isDragging ? 'none' : 'auto',
        }}
      >
        {children}
      </div>
      <button
        type="button"
        data-testid="drag-handle"
        aria-label={t('priority.a11yGrabbed', { title: id })}
        tabIndex={0}
        {...attributes}
        {...listeners}
        style={{
          position: 'absolute',
          top: '50%',
          right: 'var(--s-2)',
          transform: 'translateY(-50%)',
          width: 24,
          height: 24,
          border: 'none',
          background: 'transparent',
          color: 'var(--ink-3)',
          fontSize: 14,
          lineHeight: 1,
          cursor: 'grab',
          opacity: 0.6,
          padding: 0,
        }}
      >
        ⋮⋮
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd app && npm test -- --run SortableItemRow
```
Expected: 3 passing tests.

- [ ] **Step 6: tsc check**

```bash
cd app && npx tsc -p tsconfig.app.json --noEmit
```
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add app/src/screens/items/SortableItemRow.tsx
git commit -m "$(cat <<'EOF'
feat(items): SortableItemRow — useSortable wrapper with keyboard-accessible handle

Wraps row children with @dnd-kit/sortable. Drag handle ⋮⋮ is button-typed,
keyboard-focusable, exposes aria-label. touch-action toggles between
manipulation (idle) and none (dragging) so iOS Safari scroll vs drag
disambiguates cleanly.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Extend `<ItemList>` with `mode` prop

**Files:**
- Modify: `app/src/screens/items/ItemList.tsx`
- Create: `app/src/screens/items/__tests__/ItemList.test.tsx` (if it doesn't already exist; otherwise extend)

Read `app/src/screens/items/ItemList.tsx` end-to-end first to understand the row JSX. The change introduces a `mode` prop with three values; in `'flat'` mode the existing behavior is unchanged.

- [ ] **Step 1: Write the failing test**

Create `app/src/screens/items/__tests__/ItemList.test.tsx` (or append to existing):

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '../../../i18n/I18nProvider';
import { ItemList } from '../ItemList';
import type { MyItem } from '../../../items/useMyItems';

function mkItem(overrides: Partial<MyItem> & { id: string }): MyItem {
  return {
    id: overrides.id,
    owner_id: 'user-1',
    title: overrides.title ?? `Item ${overrides.id}`,
    maker: null,
    url: null,
    price_text: null,
    occasion: 'anytime',
    priority: overrides.priority ?? 2,
    status: 'open',
    note: null,
    cover_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    group_ids: [],
    event_ids: [],
    ...overrides,
  } as MyItem;
}

function renderList(node: React.ReactNode) {
  return render(
    <MemoryRouter>
      <I18nProvider initialLang="ru">{node}</I18nProvider>
    </MemoryRouter>,
  );
}

describe('<ItemList mode>', () => {
  const items: MyItem[] = [
    mkItem({ id: 'a', priority: 1, title: 'Книга' }),
    mkItem({ id: 'b', priority: 2, title: 'Кружка' }),
    mkItem({ id: 'c', priority: 3, title: 'Носки' }),
  ];

  it('mode="flat" renders items without section headers (current default behavior)', () => {
    renderList(<ItemList items={items} mode="flat" />);
    expect(screen.queryByText('Очень хочу')).not.toBeInTheDocument();
    expect(screen.getByText('Книга')).toBeInTheDocument();
    expect(screen.getByText('Кружка')).toBeInTheDocument();
    expect(screen.getByText('Носки')).toBeInTheDocument();
  });

  it('mode="sectioned" renders three section headers with the items grouped', () => {
    renderList(<ItemList items={items} mode="sectioned" />);
    expect(screen.getByText('Очень хочу')).toBeInTheDocument();
    expect(screen.getByText('Хочу')).toBeInTheDocument();
    expect(screen.getByText('Если найдётся')).toBeInTheDocument();
    expect(screen.getByText('Книга')).toBeInTheDocument();
  });

  it('mode="sectioned" with read-only data renders zero drag handles', () => {
    renderList(<ItemList items={items} mode="sectioned" />);
    expect(screen.queryAllByTestId('drag-handle')).toHaveLength(0);
  });

  it('mode="sectioned-dnd" renders a drag handle per item', () => {
    renderList(
      <ItemList items={items} mode="sectioned-dnd" onPriorityChange={vi.fn()} />,
    );
    expect(screen.queryAllByTestId('drag-handle')).toHaveLength(3);
  });

  it('mode="sectioned-dnd" hides empty section bodies but still shows headers (drop targets)', () => {
    const onlyMid: MyItem[] = [mkItem({ id: 'b', priority: 2, title: 'Кружка' })];
    renderList(
      <ItemList items={onlyMid} mode="sectioned-dnd" onPriorityChange={vi.fn()} />,
    );
    // All three headers visible
    expect(screen.getByText('Очень хочу')).toBeInTheDocument();
    expect(screen.getByText('Хочу')).toBeInTheDocument();
    expect(screen.getByText('Если найдётся')).toBeInTheDocument();
    // Empty-bucket placeholder shown for the two empty sections
    expect(screen.queryAllByText('здесь пусто — перетащи сюда что-то')).toHaveLength(2);
  });

  it('mode="sectioned" hides empty sections entirely (read-only)', () => {
    const onlyMid: MyItem[] = [mkItem({ id: 'b', priority: 2 })];
    renderList(<ItemList items={onlyMid} mode="sectioned" />);
    expect(screen.queryByText('Очень хочу')).not.toBeInTheDocument();
    expect(screen.getByText('Хочу')).toBeInTheDocument();
    expect(screen.queryByText('Если найдётся')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd app && npm test -- --run ItemList
```
Expected: FAIL — `mode` prop doesn't exist, headers don't render.

- [ ] **Step 3: Commit the failing test**

```bash
git add app/src/screens/items/__tests__/ItemList.test.tsx
git commit -m "$(cat <<'EOF'
test(items): ItemList — flat | sectioned | sectioned-dnd modes

Locks the contract: flat == today's behavior, sectioned == grouped read-only
(empty sections hidden), sectioned-dnd == grouped + drag handles + empty
sections kept as drop targets with placeholder.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Modify `ItemList.tsx`**

The component file already has a default-export pattern. Add the new `mode` prop and split the render path. Rough shape (adapt to the actual current structure of `ItemList.tsx`):

```tsx
import { DndContext, PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { groupByPriority, type PriorityLevel } from '../../items/groupByPriority';
import { PrioritySectionHeader } from '../../components/PrioritySectionHeader';
import { SortableItemRow } from './SortableItemRow';
import { useI18n } from '../../i18n/useI18n';

export type ItemListMode = 'flat' | 'sectioned' | 'sectioned-dnd';

export interface ItemListProps {
  items: MyItem[];
  mode?: ItemListMode;
  /** Required when mode='sectioned-dnd'. Called with (itemId, newLevel) on drop. */
  onPriorityChange?: (itemId: string, level: PriorityLevel) => void;
}

export function ItemList({ items, mode = 'flat', onPriorityChange }: ItemListProps) {
  if (mode === 'flat') {
    return <FlatList items={items} />;
  }
  if (mode === 'sectioned') {
    return <SectionedList items={items} editable={false} />;
  }
  return <SectionedList items={items} editable={true} onPriorityChange={onPriorityChange} />;
}

/** Today's render path — extracted unchanged. */
function FlatList({ items }: { items: MyItem[] }) {
  // ...the existing JSX from ItemList, moved verbatim into this sub-component.
  // No behavioral changes.
}

interface SectionedListProps {
  items: MyItem[];
  editable: boolean;
  onPriorityChange?: (itemId: string, level: PriorityLevel) => void;
}

function SectionedList({ items, editable, onPriorityChange }: SectionedListProps) {
  const { t } = useI18n();
  const sections = groupByPriority(items);

  if (!editable) {
    // Read-only: skip empty sections entirely.
    return (
      <div>
        {sections.map((section) =>
          section.items.length === 0 ? null : (
            <section key={section.level}>
              <PrioritySectionHeader level={section.level} count={section.items.length} />
              {section.items.map((item) => (
                <ItemRow key={item.id} item={item} />
              ))}
            </section>
          ),
        )}
      </div>
    );
  }

  // Editable (sectioned-dnd): always render all 3 headers as drop targets;
  // empty sections show the Caveat placeholder.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event;
    if (!over) return;
    const overId = String(over.id);
    // The drop target ID encodes the priority: rows have item IDs;
    // empty-section drop zones have `section-${level}` IDs.
    let newLevel: PriorityLevel | null = null;
    if (overId.startsWith('section-')) {
      const lvl = Number(overId.slice('section-'.length)) as PriorityLevel;
      newLevel = lvl === 1 || lvl === 3 ? lvl : 2;
    } else {
      // Dropped on another item — adopt that item's section.
      const targetItem = items.find((i) => i.id === overId);
      if (targetItem) {
        newLevel = (targetItem.priority === 1 || targetItem.priority === 3
          ? targetItem.priority
          : 2) as PriorityLevel;
      }
    }
    if (newLevel === null) return;
    const activeItem = items.find((i) => i.id === String(active.id));
    if (!activeItem) return;
    const currentLevel = activeItem.priority === 1 || activeItem.priority === 3
      ? activeItem.priority
      : 2;
    if (currentLevel === newLevel) return;
    onPriorityChange?.(String(active.id), newLevel);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      {sections.map((section) => (
        <section key={section.level}>
          <PrioritySectionHeader level={section.level} count={section.items.length} />
          <SortableContext
            items={section.items.length > 0
              ? section.items.map((i) => i.id)
              : [`section-${section.level}`]}
            strategy={verticalListSortingStrategy}
          >
            {section.items.length === 0 ? (
              <EmptySectionDropZone level={section.level} placeholder={t('priority.sectionEmptyHint')} />
            ) : (
              section.items.map((item) => (
                <SortableItemRow key={item.id} id={item.id}>
                  <ItemRow item={item} />
                </SortableItemRow>
              ))
            )}
          </SortableContext>
        </section>
      ))}
    </DndContext>
  );
}

function EmptySectionDropZone({ level, placeholder }: { level: PriorityLevel; placeholder: string }) {
  // Use a sortable wrapper with the section-level id so onDragEnd can recognise the drop.
  const { setNodeRef, isOver } = useSortable({ id: `section-${level}` });
  return (
    <div
      ref={setNodeRef}
      style={{
        padding: 'var(--s-3) var(--s-2)',
        fontFamily: 'var(--font-hand)',
        fontSize: 14,
        fontStyle: 'italic',
        color: 'var(--ink-3)',
        background: isOver ? 'var(--accent-soft)' : 'transparent',
        border: isOver ? '1px dashed var(--accent)' : '1px dashed transparent',
        transition: 'background 120ms ease, border-color 120ms ease',
      }}
    >
      {placeholder}
    </div>
  );
}
```

(`ItemRow` is the existing row-render JSX — extract it into a small function or inline component if not already separate. Keep its visual identical to today's `ItemList` output.)

- [ ] **Step 5: Run test to verify it passes**

```bash
cd app && npm test -- --run ItemList
```
Expected: 6 passing tests.

- [ ] **Step 6: tsc + full suite**

```bash
cd app && npx tsc -p tsconfig.app.json --noEmit && npm test -- --run
```
Expected: clean. Existing screens that import `<ItemList>` keep working because `mode` defaults to `'flat'`.

- [ ] **Step 7: Commit**

```bash
git add app/src/screens/items/ItemList.tsx
git commit -m "$(cat <<'EOF'
feat(items): ItemList — mode='flat' | 'sectioned' | 'sectioned-dnd'

Default 'flat' = existing behavior, unchanged. 'sectioned' groups by
priority for read-only views (empty sections hidden). 'sectioned-dnd'
adds DndContext + sensors + sortable rows + always-visible section
headers (including empty drop zones with placeholder).

Drop semantics: section-${level} ID for empty-zone drops, item ID for
on-row drops (adopts target row's section).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase D — MyList wiring

### Task 8: MyListScreen passes `sectioned-dnd` + handler

**Files:**
- Modify: `app/src/screens/items/MyListScreen.tsx`
- Modify: `app/src/screens/items/__tests__/MyListScreen.test.tsx` (or `app/src/screens/__tests__/MyListScreen.test.tsx` — search for the existing file)

- [ ] **Step 1: Locate the existing MyListScreen test file**

```bash
find /Users/edouard/dev/wishlist/app/src -name "MyListScreen.test.*"
```

Use whichever path exists. If none exists, create `app/src/screens/items/__tests__/MyListScreen.test.tsx`.

- [ ] **Step 2: Write the failing test**

Add (or create) a test covering the priority-change wiring:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '../../../i18n/I18nProvider';

const updateItemPriority = vi.fn();

vi.mock('../../../items/useMyItems', () => ({
  useMyItems: () => ({
    query: {
      status: 'ready',
      items: [
        { id: 'a', owner_id: 'u', title: 'Книга', priority: 2, occasion: 'anytime',
          status: 'open', maker: null, url: null, price_text: null, note: null,
          cover_url: null, created_at: '', updated_at: '', group_ids: [], event_ids: [] },
      ],
      error: null,
    },
    refresh: vi.fn(),
    createItem: vi.fn(),
    updateItem: vi.fn(),
    deleteItem: vi.fn(),
    updateStatus: vi.fn(),
    updateItemPriority,
  }),
}));

vi.mock('../../../groups/useGroups', () => ({
  useGroups: () => ({ query: { status: 'ready', groups: [] } }),
}));

import { MyListScreen } from '../MyListScreen';

describe('<MyListScreen> priority DnD wiring', () => {
  beforeEach(() => updateItemPriority.mockClear());

  it('renders sectioned-dnd ItemList with three section headers on mobile', () => {
    // Mock window width to mobile (the existing isMobile hook).
    Object.defineProperty(window, 'innerWidth', { value: 400, writable: true });
    window.dispatchEvent(new Event('resize'));

    render(
      <MemoryRouter>
        <I18nProvider initialLang="ru">
          <MyListScreen />
        </I18nProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText('Очень хочу')).toBeInTheDocument();
    expect(screen.getByText('Хочу')).toBeInTheDocument();
    expect(screen.getByText('Если найдётся')).toBeInTheDocument();
  });

  it('calls updateItemPriority when ItemList fires onPriorityChange', async () => {
    // We test the integration by simulating the keyboard DnD path —
    // that's @dnd-kit-supported and doesn't need mocked pointer events.
    Object.defineProperty(window, 'innerWidth', { value: 400, writable: true });
    window.dispatchEvent(new Event('resize'));

    render(
      <MemoryRouter>
        <I18nProvider initialLang="ru">
          <MyListScreen />
        </I18nProvider>
      </MemoryRouter>,
    );

    const handle = screen.getByTestId('drag-handle');
    handle.focus();
    await userEvent.keyboard(' ');     // grab
    await userEvent.keyboard('{ArrowUp}'); // move toward "Очень хочу"
    await userEvent.keyboard(' ');     // drop

    expect(updateItemPriority).toHaveBeenCalled();
    const [itemId, newLevel] = updateItemPriority.mock.calls[0]!;
    expect(itemId).toBe('a');
    expect(newLevel).toBe(1);
  });
});
```

If the keyboard path proves flaky in vitest's jsdom (it sometimes is — dnd-kit's keyboard sensor uses `requestAnimationFrame`), fall back to directly invoking the handler: render `<ItemList mode="sectioned-dnd" onPriorityChange={spy} />` outside `MyListScreen` and dispatch a synthetic `DragEndEvent` via `act`. Document the fallback in a comment. The intent of the test is the wiring (the handler is called with the right args), not the gesture.

- [ ] **Step 3: Run test to verify it fails**

```bash
cd app && npm test -- --run MyListScreen
```
Expected: FAIL — section headers not in DOM, handler not wired.

- [ ] **Step 4: Commit the failing test**

```bash
git add app/src/screens/items/__tests__/MyListScreen.test.tsx
git commit -m "$(cat <<'EOF'
test(items): MyListScreen wires updateItemPriority into ItemList sectioned-dnd mode

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Modify `MyListScreen.tsx`**

In the render path where the existing `<ItemList items={filteredItems} />` lives, change to:

```tsx
<ItemList
  items={filteredItems}
  mode="sectioned-dnd"
  onPriorityChange={async (itemId, level) => {
    const result = await updateItemPriority(itemId, level);
    if ('error' in result) {
      toast(result.error);
    }
  }}
/>
```

Where:
- `updateItemPriority` comes from `useMyItems()` — destructure it from the hook
- `toast` comes from the existing `useToast()` hook (check `app/src/components/Toast.tsx` for the actual API; might be `showToast` or similar)

Grid view (`effectiveView === 'grid'`) stays unchanged — it uses `<ItemGrid>`, not `<ItemList>`.

- [ ] **Step 6: Run test to verify it passes**

```bash
cd app && npm test -- --run MyListScreen
```
Expected: both new tests pass.

- [ ] **Step 7: Manual smoke (the executor doesn't get to skip this)**

Run the app locally:
```bash
cd app && npm run dev
```
Then in browser:
- Open MyList on desktop (http://localhost:5173)
- Confirm: three section headers visible, items grouped correctly, hover shows drag handle
- Drag an item from one section to another via mouse → priority updates
- Refresh → priority persists
- Open Mobile DevTools (touch emulation) → long-press → drag works
- Tap-without-long-press → navigates to item detail (existing link behavior)

Don't claim this task done until the smoke passes. If the link click fires after a drop, that's the "Risks/unknowns #1" from the spec — apply the `onClickCapture` fix mentioned there.

- [ ] **Step 8: Commit**

```bash
git add app/src/screens/items/MyListScreen.tsx
git commit -m "$(cat <<'EOF'
feat(items): MyListScreen — wire sectioned-dnd mode + priority update handler

Drop fires updateItemPriority through the existing hook; on error, the
optimistic UI reverts and a toast surfaces the mapped message. Grid view
unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase E — Read-only sectioning on three screens

For each of these three screens, the change is the same shape:

1. `import { groupByPriority } from '../../items/groupByPriority';`
2. `import { PrioritySectionHeader } from '../../components/PrioritySectionHeader';`
3. Wrap the existing `.map((item) => ...)` with a section-loop that calls `groupByPriority(items)` first.
4. Skip empty sections entirely (read-only behavior — match the `sectioned` mode of `<ItemList>`).
5. Existing row JSX inside the loop is unchanged.

Each gets its own task with TDD so we have separable commits and individual regression coverage.

---

### Task 10: `PublicListScreen` sectioning

**Files:**
- Modify: `app/src/screens/PublicListScreen.tsx`
- Create/modify: `app/src/screens/__tests__/PublicListScreen.test.tsx` (search for existing first)

- [ ] **Step 1: Locate or create the test file**

```bash
find /Users/edouard/dev/wishlist/app/src -name "PublicListScreen.test.*"
```

- [ ] **Step 2: Write the failing test**

Add (or create):

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { I18nProvider } from '../../i18n/I18nProvider';

// Stub the public-list data hook — replace the path with the actual hook
// used by PublicListScreen (search for `from '../../...'` imports in the file).
vi.mock('../../lib/supabase', () => ({ supabase: {} }));
vi.mock('../../items/usePublicList', () => ({
  usePublicList: () => ({
    status: 'ready',
    items: [
      { id: 'a', priority: 1, title: 'Книга',  occasion: 'anytime', cover_url: null, /* ... */ },
      { id: 'b', priority: 2, title: 'Кружка', occasion: 'anytime', cover_url: null, /* ... */ },
    ],
    owner: { display_name: 'Мышка' },
    error: null,
  }),
}));

import { PublicListScreen } from '../PublicListScreen';

describe('<PublicListScreen> sectioning', () => {
  it('renders section headers grouping items by priority', () => {
    render(
      <MemoryRouter initialEntries={['/share/abcd']}>
        <I18nProvider initialLang="ru">
          <Routes><Route path="/share/:token" element={<PublicListScreen />} /></Routes>
        </I18nProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText('Очень хочу')).toBeInTheDocument();
    expect(screen.getByText('Хочу')).toBeInTheDocument();
    expect(screen.queryByText('Если найдётся')).not.toBeInTheDocument();
    expect(screen.getByText('Книга')).toBeInTheDocument();
    expect(screen.getByText('Кружка')).toBeInTheDocument();
  });

  it('renders zero drag handles (read-only view)', () => {
    render(
      <MemoryRouter initialEntries={['/share/abcd']}>
        <I18nProvider initialLang="ru">
          <Routes><Route path="/share/:token" element={<PublicListScreen />} /></Routes>
        </I18nProvider>
      </MemoryRouter>,
    );
    expect(screen.queryAllByTestId('drag-handle')).toHaveLength(0);
  });
});
```

(Adjust the data-hook mock to match what `PublicListScreen` actually imports — read the file's import list first. The item shape stub may need more fields; copy from an existing test fixture or from the file's TS types.)

- [ ] **Step 3: Run, FAIL, commit**

```bash
cd app && npm test -- --run PublicListScreen
git add app/src/screens/__tests__/PublicListScreen.test.tsx
git commit -m "$(cat <<'EOF'
test(share): PublicListScreen sections items by priority, no drag handles

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Modify `PublicListScreen.tsx`**

Find the `items.map((item, i) => ...)` (around line 178 per the explore notes). Replace with:

```tsx
{groupByPriority(items).map((section) =>
  section.items.length === 0 ? null : (
    <section key={section.level}>
      <PrioritySectionHeader level={section.level} count={section.items.length} />
      {section.items.map((item, i) => (
        // ... existing row JSX, unchanged ...
      ))}
    </section>
  ),
)}
```

Add the two imports at the top of the file.

- [ ] **Step 5: Verify the test passes + full suite still green**

```bash
cd app && npm test -- --run && npx tsc -p tsconfig.app.json --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add app/src/screens/PublicListScreen.tsx
git commit -m "$(cat <<'EOF'
feat(share): section PublicListScreen items by priority (read-only)

Wraps the existing row map with groupByPriority + PrioritySectionHeader.
Empty sections hidden. Row JSX unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: `FriendListScreen` sectioning

**Files:**
- Modify: `app/src/screens/people/FriendListScreen.tsx`
- Create/modify: `app/src/screens/people/__tests__/FriendListScreen.test.tsx`

Same shape as Task 10:

- [ ] **Step 1: Locate / create test file**

```bash
find /Users/edouard/dev/wishlist/app/src -name "FriendListScreen.test.*"
```

- [ ] **Step 2: Write failing test** (mirrors Task 10's tests; adjust the hook mock to whatever `FriendListScreen` consumes — `useFriendList` per the file map)

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { I18nProvider } from '../../../i18n/I18nProvider';

vi.mock('../../../lib/supabase', () => ({ supabase: {} }));
vi.mock('../../../people/useFriendList', () => ({
  useFriendList: () => ({
    status: 'ready',
    items: [
      { id: 'a', priority: 1, title: 'Книга',  occasion: 'anytime', cover_url: null,
        owner_id: 'friend', maker: null, url: null, price_text: null, note: null,
        status: 'open', created_at: '', updated_at: '' },
      { id: 'c', priority: 3, title: 'Носки', occasion: 'anytime', cover_url: null,
        owner_id: 'friend', maker: null, url: null, price_text: null, note: null,
        status: 'open', created_at: '', updated_at: '' },
    ],
    profile: { display_name: 'Друг', id: 'friend' },
    error: null,
  }),
}));

import { FriendListScreen } from '../FriendListScreen';

describe('<FriendListScreen> sectioning', () => {
  it('groups items by priority with section headers', () => {
    render(
      <MemoryRouter initialEntries={['/p/friend']}>
        <I18nProvider initialLang="ru">
          <Routes><Route path="/p/:userId" element={<FriendListScreen />} /></Routes>
        </I18nProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText('Очень хочу')).toBeInTheDocument();
    expect(screen.getByText('Если найдётся')).toBeInTheDocument();
    expect(screen.queryByText('Хочу')).not.toBeInTheDocument(); // empty, hidden
  });

  it('renders no drag handles', () => {
    render(
      <MemoryRouter initialEntries={['/p/friend']}>
        <I18nProvider initialLang="ru">
          <Routes><Route path="/p/:userId" element={<FriendListScreen />} /></Routes>
        </I18nProvider>
      </MemoryRouter>,
    );
    expect(screen.queryAllByTestId('drag-handle')).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run, FAIL, commit**

```bash
cd app && npm test -- --run FriendListScreen
git add app/src/screens/people/__tests__/FriendListScreen.test.tsx
git commit -m "$(cat <<'EOF'
test(people): FriendListScreen sections items by priority

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Modify `FriendListScreen.tsx`**

Add the two imports at the top of the file:

```tsx
import { groupByPriority } from '../../items/groupByPriority';
import { PrioritySectionHeader } from '../../components/PrioritySectionHeader';
```

Find the `items.map((item, i) => ...)` block around line 275. Replace it with:

```tsx
{groupByPriority(items).map((section) =>
  section.items.length === 0 ? null : (
    <section key={section.level}>
      <PrioritySectionHeader level={section.level} count={section.items.length} />
      {section.items.map((item, i) => (
        // ... existing row JSX from the original map, unchanged ...
      ))}
    </section>
  ),
)}
```

The "existing row JSX" is whatever sits in the body of the current `.map` callback (roughly lines 275–450 of the file). Copy it verbatim into the inner map; do not rewrite it.

Important: the existing inline row already renders `<PriorityDots>` (lines 432-436) only when `item.priority !== 2`. Keep that as-is — the spec says we keep the inline marker as a micro-reminder for users who've scrolled past the section header.

- [ ] **Step 5: Verify**

```bash
cd app && npm test -- --run && npx tsc -p tsconfig.app.json --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add app/src/screens/people/FriendListScreen.tsx
git commit -m "$(cat <<'EOF'
feat(people): section FriendListScreen items by priority (read-only)

Inline PriorityDots marker on rows kept as a scroll-past reminder.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: `EventDetailScreen` sectioning

**Files:**
- Modify: `app/src/screens/events/EventDetailScreen.tsx`
- Modify: `app/src/screens/events/__tests__/EventDetailScreen.test.tsx`

The screen renders curated items via `CuratedItemCard` in two modes (honoree-editing and guest-viewing). Both paths share the same `items.map((it) => <CuratedItemCard ... />)` block — sectioning happens once around that map.

The curated-item shape is `{ item_id, item: { priority, ... }, added_at, ... }` — the `priority` lives on `it.item.priority`, not on `it.priority`. The helper expects `.priority` directly, so the integration uses `it.item.priority` projected into a temporary shape before grouping.

- [ ] **Step 1: Read the existing test file**

Read `app/src/screens/events/__tests__/EventDetailScreen.test.tsx` end-to-end first. Identify:
- The `stubEventLoad` (or equivalent) helper used to seed `useEvent`'s return value
- How curated `items` are shaped in the existing mocks
- The wrapper component (likely `MemoryRouter` + `I18nProvider` + an auth provider stub)

Copy the existing wrapper boilerplate verbatim into the new test block.

- [ ] **Step 2: Write the failing tests**

Append to the existing describe block (or create a new top-level describe):

```tsx
describe('<EventDetailScreen> sectioning', () => {
  // Reuse the same wrapper + stub helpers as the existing tests in this file.
  // The two stubs below use the imagined shape — match them to whatever
  // stubEventLoad/stubEventItems your file already defines.

  function curated(id: string, priority: 1 | 2 | 3, title: string) {
    return {
      item_id: id,
      added_at: '2026-05-26T00:00:00Z',
      item: {
        id, priority, title,
        owner_id: 'honoree', occasion: 'anytime',
        maker: null, url: null, price_text: null, note: null,
        cover_url: null, status: 'open',
        created_at: '', updated_at: '',
      },
    };
  }

  it('honoree view: sections curated items by priority with no drag handles', () => {
    stubEventLoad({
      event: { id: 'evt-1', title: 'ДР', my_status: 'honoree', share_token: 'tok' },
      items: [
        curated('a', 1, 'Книга'),
        curated('b', 2, 'Кружка'),
      ],
    });

    renderEventDetail('/events/evt-1');

    expect(screen.getByText('Очень хочу')).toBeInTheDocument();
    expect(screen.getByText('Хочу')).toBeInTheDocument();
    // Level 3 has no items → empty section hidden in read-only paths
    expect(screen.queryByText('Если найдётся')).not.toBeInTheDocument();
    expect(screen.getByText('Книга')).toBeInTheDocument();
    expect(screen.getByText('Кружка')).toBeInTheDocument();
    // EventDetail is never DnD — assert zero drag handles
    expect(screen.queryAllByTestId('drag-handle')).toHaveLength(0);
  });

  it('guest view: sections curated items read-only', () => {
    stubEventLoad({
      event: { id: 'evt-1', title: 'ДР', my_status: 'active', share_token: 'tok' },
      items: [
        curated('a', 1, 'Книга'),
        curated('c', 3, 'Носки'),
      ],
    });

    renderEventDetail('/events/evt-1');

    expect(screen.getByText('Очень хочу')).toBeInTheDocument();
    expect(screen.getByText('Если найдётся')).toBeInTheDocument();
    expect(screen.queryByText('Хочу')).not.toBeInTheDocument(); // empty, hidden
    expect(screen.queryAllByTestId('drag-handle')).toHaveLength(0);
  });
});
```

If the existing test file's `stubEventLoad` doesn't accept `items` directly, look for whatever helper feeds the curated-items query (e.g. `stubEventItemsQuery(...)`) and call that instead. The two tests are what matters — the stub mechanics adapt to whatever the file already does.

- [ ] **Step 3: Run, FAIL, commit**

```bash
cd app && npm test -- --run EventDetailScreen
```
Expected: FAIL — section headers not in the DOM.

```bash
git add app/src/screens/events/__tests__/EventDetailScreen.test.tsx
git commit -m "$(cat <<'EOF'
test(events): EventDetailScreen sections curated items by priority

Asserts honoree + guest both render section headers, empty sections
hidden, zero drag handles (event view is never DnD).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Modify `EventDetailScreen.tsx`**

Add the two imports at the top of the file:

```tsx
import { groupByPriority } from '../../items/groupByPriority';
import { PrioritySectionHeader } from '../../components/PrioritySectionHeader';
```

Find the `items.map((it) => <CuratedItemCard ... />)` block (around line 625 per the explore notes). Replace it with:

```tsx
{groupByPriority(
  items.map((it) => ({ ...it, priority: it.item.priority })),
).map((section) =>
  section.items.length === 0 ? null : (
    <section key={section.level}>
      <PrioritySectionHeader level={section.level} count={section.items.length} />
      {section.items.map((it) => (
        <CuratedItemCard
          /* ...all the existing props on CuratedItemCard, unchanged... */
          key={it.item_id}
          {/* exact prop signature matches the prior call site — copy it verbatim */}
        />
      ))}
    </section>
  ),
)}
```

Important: the `it` inside the inner `.map` still has the full curated shape (we only added `priority` to it via spread), so all `<CuratedItemCard>` props that read `it.item.*` continue to work. No prop changes on `<CuratedItemCard>`.

If the parent uses `items.length === 0` for an empty-state branch, that check stays exactly where it is — the sectioning only wraps the non-empty rendering path.

- [ ] **Step 5: Run, PASS**

```bash
cd app && npm test -- --run EventDetailScreen && npx tsc -p tsconfig.app.json --noEmit
```
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add app/src/screens/events/EventDetailScreen.tsx
git commit -m "$(cat <<'EOF'
feat(events): section EventDetailScreen curated items by priority (read-only)

Wraps the existing CuratedItemCard map with groupByPriority +
PrioritySectionHeader. Empty sections hidden. CuratedItemCard props
unchanged. Applies to both honoree-editing and guest-viewing paths
(neither is ever DnD — event view is read-only for priority).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase F — A11y + integration test + smoke

### Task 13: Live-region announcements + accessibility polish

**Files:**
- Modify: `app/src/screens/items/ItemList.tsx`

dnd-kit's `<DndContext>` accepts an `accessibility.announcements` prop. Wire it in the `sectioned-dnd` path so screen readers narrate moves with our i18n strings.

- [ ] **Step 1: Add a test asserting an announcement region exists**

In the existing `ItemList.test.tsx`:

```tsx
it('mode="sectioned-dnd" mounts an aria-live announcement region', () => {
  renderList(<ItemList items={items} mode="sectioned-dnd" onPriorityChange={vi.fn()} />);
  const live = document.querySelector('[role="status"][aria-live]');
  expect(live).toBeInTheDocument();
});
```

(dnd-kit mounts the live region automatically when announcements are passed.)

- [ ] **Step 2: Commit test, run, FAIL**

If the existing implementation already passes `accessibility={...}` to DndContext, this test may pass without changes — in that case skip the impl change and just commit the additional regression coverage. Most likely it fails because we didn't wire announcements yet.

- [ ] **Step 3: Wire announcements**

In `SectionedList` (the editable branch in `ItemList.tsx`):

```tsx
const { t } = useI18n();

const announcements = {
  onDragStart({ active }: { active: { id: string } }) {
    const item = items.find((i) => i.id === String(active.id));
    return t('priority.a11yGrabbed', { title: item?.title ?? String(active.id) });
  },
  onDragOver({ over }: { over?: { id: string } | null }) {
    if (!over) return undefined;
    const overId = String(over.id);
    const lvl = overId.startsWith('section-')
      ? Number(overId.slice('section-'.length))
      : items.find((i) => i.id === overId)?.priority;
    const sectionLabel = lvl === 1 ? t('priority.sectionHigh')
                       : lvl === 3 ? t('priority.sectionLow')
                                   : t('priority.sectionMid');
    return t('priority.a11yMovedTo', { section: sectionLabel });
  },
  onDragEnd({ over }: { over?: { id: string } | null }) {
    if (!over) return t('priority.a11yCanceled');
    const overId = String(over.id);
    const lvl = overId.startsWith('section-')
      ? Number(overId.slice('section-'.length))
      : items.find((i) => i.id === overId)?.priority;
    const sectionLabel = lvl === 1 ? t('priority.sectionHigh')
                       : lvl === 3 ? t('priority.sectionLow')
                                   : t('priority.sectionMid');
    return t('priority.a11yDropped', { section: sectionLabel });
  },
  onDragCancel() { return t('priority.a11yCanceled'); },
};

return (
  <DndContext
    sensors={sensors}
    onDragEnd={handleDragEnd}
    accessibility={{ announcements }}
  >
    {/* ... */}
  </DndContext>
);
```

- [ ] **Step 4: Run, PASS, commit**

```bash
cd app && npm test -- --run ItemList
git add app/src/screens/items/ItemList.tsx app/src/screens/items/__tests__/ItemList.test.tsx
git commit -m "$(cat <<'EOF'
feat(a11y): wire dnd-kit announcements through priority.* i18n keys

Screen readers narrate grab/move/drop/cancel with localised strings.
Live region is mounted by DndContext when announcements are passed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: Integration test — owner-only priority UPDATE

**Files:**
- Create: `supabase/tests/integration/priority-update-rls.test.ts`

This locks the privacy contract explicitly. The existing RLS already permits owner UPDATE and rejects non-owner UPDATE — we add a test so a future regression doesn't silently break it.

- [ ] **Step 1: Write the test**

Create `supabase/tests/integration/priority-update-rls.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { seedFresh, makeUserClient, ownerClient } from './helpers/seed';

describe('items.priority UPDATE RLS', () => {
  beforeEach(async () => { await seedFresh(); });

  it('owner can update their own item priority', async () => {
    const alice = await makeUserClient('alice@test');
    const { data: created, error: createErr } = await alice
      .from('items')
      .insert({ title: 'Test', priority: 2, occasion: 'anytime' })
      .select('id')
      .single();
    expect(createErr).toBeNull();
    expect(created).not.toBeNull();

    const { error: updateErr } = await alice
      .from('items')
      .update({ priority: 1 })
      .eq('id', created!.id);
    expect(updateErr).toBeNull();

    const { data: after } = await alice
      .from('items')
      .select('priority')
      .eq('id', created!.id)
      .single();
    expect(after?.priority).toBe(1);
  });

  it('non-owner cannot update someone else\'s item priority', async () => {
    const alice = await makeUserClient('alice@test');
    const bob = await makeUserClient('bob@test');

    const { data: created } = await alice
      .from('items')
      .insert({ title: 'Test', priority: 2, occasion: 'anytime' })
      .select('id')
      .single();

    // Bob tries to update Alice's item — should silently no-op under RLS
    // (PostgREST returns no rows for unauthorised UPDATEs by default).
    const { data: updated } = await bob
      .from('items')
      .update({ priority: 1 })
      .eq('id', created!.id)
      .select();
    expect(updated).toEqual([]);

    // Confirm Alice's item is unchanged.
    const { data: after } = await alice
      .from('items')
      .select('priority')
      .eq('id', created!.id)
      .single();
    expect(after?.priority).toBe(2);
  });
});
```

Adapt `makeUserClient`, `seedFresh`, and the RLS-empty-update assertion to match the helpers used in existing integration tests (search `supabase/tests/integration/helpers/`).

- [ ] **Step 2: Run**

```bash
eval "$(supabase status --output env | sed 's/^/export /')"
cd supabase/tests/integration && npm test -- priority-update-rls
```
Expected: both tests pass (because RLS is already correct — this just locks it).

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/integration/priority-update-rls.test.ts
git commit -m "$(cat <<'EOF'
test(privacy): items.priority UPDATE — owner allowed, non-owner blocked

Locks the existing RLS contract so a future regression on items policies
doesn't silently grant cross-owner priority writes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: Run full validation suite

- [ ] **Step 1: All frontend tests**

```bash
cd app && npm test -- --run
```
Expected: all green.

- [ ] **Step 2: tsc strict**

```bash
cd app && npx tsc -p tsconfig.app.json --noEmit
```
Expected: no output.

- [ ] **Step 3: Lint**

```bash
cd app && npm run lint
```
Expected: clean.

- [ ] **Step 4: Production build (dry run for Vercel)**

```bash
cd app && npm run build
```
Expected: build succeeds; check the chunk-size diff in the output. The dnd-kit chunks should land in the lazy-loaded MyList bundle, NOT in the prerender entry. If the prerender entry grew by ≥10KB, something is wrong — fix by moving the imports to a lazy boundary.

- [ ] **Step 5: Integration suite**

```bash
eval "$(supabase status --output env | sed 's/^/export /')"
cd supabase/tests/integration && npm test
```
Expected: all green, including the new `priority-update-rls.test.ts` and the unchanged `events-link-privacy.test.ts` (privacy invariant).

- [ ] **Step 6: Edge functions tests (in case sectioning touched anything)**

```bash
cd app && npm run test:edge
```
Expected: clean. (Shouldn't be impacted — sanity check.)

---

### Task 16: Manual smoke per the spec's acceptance checklist

Per CLAUDE.md "Testing & deploy discipline" rule 5 — tests passing ≠ feature working. Walk the actual user flows in `npm run dev`.

- [ ] **Mobile (touch emulation in Chrome DevTools, iPhone 14 viewport):**
  - [ ] Long-press a row → it lifts; drag to another section → drops; priority updates
  - [ ] Tap (no long-press) → navigates to item detail
  - [ ] Finger-slide on a row that's NOT held → list scrolls

- [ ] **Desktop:**
  - [ ] Hover on a row → ⋮⋮ handle appears
  - [ ] Click-drag a row to another section → drops; priority updates
  - [ ] Click without drag → navigates to item detail

- [ ] **Keyboard (a11y):**
  - [ ] Tab to a row's handle → it focuses (visible focus ring)
  - [ ] Space → row "lifts"
  - [ ] ↑/↓ → moves between sections; VoiceOver/NVDA announces each move
  - [ ] Space → drops; announcement reads "Сохранено в «...»."
  - [ ] Esc mid-drag → cancels; nothing changes; announcement reads "Отменено."

- [ ] **Cross-device realtime:**
  - [ ] Open the same account in two browsers (one regular, one incognito)
  - [ ] Move a row in browser A → browser B reflects within 1 second (no refresh needed)

- [ ] **Read-only views:**
  - [ ] Visit `/share/<your-token>` in incognito → sections visible, no handles, no drag possible
  - [ ] Visit `/p/<friend-userId>` while logged in as someone else → same: read-only sections
  - [ ] Open an event you're a guest of → same: read-only sections

- [ ] **Empty MyList:**
  - [ ] Create a fresh test account → MyList shows existing empty state (no section headers, no placeholders)

- [ ] **Privacy invariant:**
  - [ ] As friend, claim an item → as owner, refresh MyList → confirm claim doesn't leak (rerun the existing `events-link-privacy.test.ts` is automated; this manual step is double-check)

If any step fails, do NOT commit a fix as "smoke done" — fix the bug, re-test, then check the box.

---

### Task 17: Rename branch + push + open PR

- [ ] **Step 1: Rename branch**

```bash
git branch -m docs/priority-dnd-sections-spec feat/priority-dnd-sections
```

- [ ] **Step 2: Push**

```bash
git push -u origin feat/priority-dnd-sections
```

- [ ] **Step 3: Open PR via gh**

```bash
gh pr create --title "feat: priority DnD between sections in all list views" --body "$(cat <<'EOF'
## Summary

- Sections all four list views (MyList, friend, share, event detail) by priority level (•••/••/•)
- Makes MyList rows draggable between sections — drop updates `items.priority` via a single owner-only UPDATE
- No schema migration; `items.priority smallint 1..3` unchanged; form chips unchanged
- New dep: `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` (~10KB gzipped, lazy on MyList)

Spec: [`docs/superpowers/specs/2026-05-26-priority-dnd-sections-design.md`](docs/superpowers/specs/2026-05-26-priority-dnd-sections-design.md)
Plan: [`docs/superpowers/plans/2026-05-26-priority-dnd-sections.md`](docs/superpowers/plans/2026-05-26-priority-dnd-sections.md)

## Test plan

- [x] Unit: `groupByPriority`, `PrioritySectionHeader`, `SortableItemRow`
- [x] Component: `<ItemList mode>` (flat/sectioned/sectioned-dnd), MyListScreen DnD wiring, PublicList/FriendList/EventDetail section assertions
- [x] Integration: `priority-update-rls.test.ts` (owner-only UPDATE)
- [x] tsc strict, lint, prod build (no chunk-size regression on share path)
- [x] Manual smoke per spec acceptance checklist (mobile long-press, desktop click-drag, keyboard a11y, cross-device realtime, read-only views, empty state, privacy invariant)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Drop the PR URL in the chat for the human to review**

Done. Wait for review + CI green before merging.

---

## Definition of Done

All checkboxes above ticked, all five validation suites green, manual smoke clean, PR open with green CI. Then — and only then — say "ready to merge" in the PR thread.
