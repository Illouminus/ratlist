# Priority DnD Sections

> Brainstormed 2026-05-26 with Edouard following friend feedback on the same day.
> Replaces the 3-chip explicit priority selector — *as the only way to express
> priority after creation* — with **draggable item rows between three priority
> sections**. The chips stay in the create/edit form; the DnD is the new
> alternative path. Schema, the dot visual language, and the `items.priority`
> column are unchanged.

## TL;DR

- **List views become sectioned by priority** (•••, ••, •) across MyList,
  friend list (`/p/:userId`), public share (`/share/<token>`), and event
  detail (`/events/:id`).
- **MyList rows are draggable between sections.** Drop fires a single
  `UPDATE items SET priority = N WHERE id = ?` (RLS already permits
  owner-only). Friend / share / event sections are read-only.
- **No schema change.** `items.priority smallint not null default 2 check
  (priority between 1 and 3)` stays. The dot visual (`PriorityDots`),
  the `priority` field, the form chips — all unchanged.
- **Mobile activation: long-press 250ms.** Desktop activation: click-drag
  ≥5px. Keyboard: Space to grab, ↑/↓ to move, Space to drop, Esc to cancel.
- **Library: `@dnd-kit/core` + `@dnd-kit/sortable`** — chosen for React 19
  compat, built-in touch + keyboard sensors, ~10KB gzipped, and the only
  actively maintained option that isn't deprecated (RBDnD) or HTML5-only
  (react-dnd).
- **Optimistic UI + revert-on-error.** Existing realtime listener
  (`postgres_changes` on `items`) handles cross-device sync without new
  plumbing.

## Why this exists

Friend feedback (2026-05-26): *"было бы проще drag and drop чтобы ставить
приоритет."* On clarification, the meaning was: drag items between
priority levels in the list, rather than reopening the edit form to
change the chip selection.

The chip path stays useful at create-time (you know the priority as you're
adding the item). But for *adjusting* priority after the fact — "this
became more important since I added it" — opening the edit form, scrolling
to the priority field, picking a different chip, saving, navigating back
is a four-step interruption. Drag-between-sections collapses it to one
gesture.

This is a small change in the data model (zero) and a meaningful change
in the UX. It also unlocks a free side-benefit: by sectioning the list
visually, gift-givers see the priority signal *as structure*, not just as
a row marker that's easy to skim past.

## Decisions locked (brainstorming session)

1. **Drag means: move between three fixed priority levels** — not
   continuous ordering, not bucket-with-sub-order, not a slider widget.
   Plain section-to-section moves. Within a section, sort stays
   `created_at desc`.
2. **Sections apply to all four list views** — MyList (writable), friend
   list, public share, event detail (all read-only). Grid view in MyList
   (`ItemCard`) stays flat — sections don't fit a mosaic.
3. **Form chips stay as-is.** The 3-pill `PriorityChip` cluster in
   `ItemForm` is unchanged. DnD is the *additional* path after creation,
   not a replacement for the create-time choice.
4. **No schema migration.** `items.priority` keeps its 1/2/3 contract.
   Existing rows render straight into the new sections by their current
   value.

## UX details per screen

### MyList (`/`)

Layout when `view === 'list'` (mobile always; desktop opt-in via the
existing toggle):

```
┌────────────────────────────────────────────────────────┐
│ ••• Очень хочу                                  — 2    │
│ ─────────────────────────────────────────────────────  │
│  [photo] Книга Sapiens               Юваль · 1500₽   ⋮⋮ │
│  [photo] Походный термос             Zojirushi       ⋮⋮ │
│                                                        │
│ ••∘ Хочу                                        — 3    │
│ ─────────────────────────────────────────────────────  │
│  [photo] Кружка для эспрессо         Acme · 600₽     ⋮⋮ │
│  [photo] Виниловая пластинка         Radiohead        ⋮⋮ │
│  [photo] Подставка под книги         эстетика         ⋮⋮ │
│                                                        │
│ •∘∘ Если найдётся                               — 1    │
│ ─────────────────────────────────────────────────────  │
│  [photo] Носки шерстяные             если найдутся    ⋮⋮ │
└────────────────────────────────────────────────────────┘
```

Section header:
- Three dots (rendered via existing `<PriorityDots level>`)
- Label: `t('priority.sectionHigh' | 'Mid' | 'Low')`
- Caveat-font count: `— 2`, `— 3`, `— 1`
- Dashed hairline underneath (`var(--hair-strong)`, `border-bottom-style: dashed`)

Empty section behavior:
- **In MyList** (writable): the section header always renders for all
  three levels, even when empty — the user needs a drop target. The
  empty body shows a single Caveat-font placeholder («здесь пусто —
  перетащи сюда что-то»), color `var(--ink-3)`, italic, and accepts drops.
- **In friend / share / event views** (read-only): empty sections are
  hidden entirely (no header, no placeholder). A viewer doesn't need
  to see that the honoree happens to have nothing in •.

When `view === 'grid'` (desktop only): grid layout stays flat. No
sections, no DnD. The toggle to list view is the path to reorder.

### Friend list (`/p/:userId`)

Same section layout. No drag handles, no `useSortable`. Renders as plain
read-only structure. The friend's existing `PriorityDots` row marker
(currently shown only for non-default priorities — `FriendListScreen.tsx`
line 435-436) becomes redundant when the row is inside a labeled
section, but we keep it: the section header is the macro signal, the
inline dot is the micro reminder when the user has scrolled past the
header.

### Public share (`/share/<token>`)

Same as friend list — read-only sectioned. The `PublicListScreen` inline
row renderer (lines ~178-300) gets a section grouping pass around it.
This is the highest-stakes view: anonymous gift-givers, first-time
visitors, social-bot crawlers all hit this URL. Sectioning lifts the
priority signal from "subtle row dot" to "obvious page structure" for
the audience that most benefits from it.

### Event detail (`/events/:id`)

Honoree view (curated items list, rendered via `CuratedItemCard`):
sectioned read-only. Honoree edits priority by going to MyList and
dragging — not inside the event view. (The event view's job is curation
of *which* items, not their priorities.)

Guest view (read-only items list): sectioned read-only, same as friend
list.

## Mobile / desktop interaction

### Desktop
- Hover on a row in MyList → soft `⋮⋮` handle appears on the right
  edge, color `var(--ink-3)`
- Cursor: `grab` on row hover, `grabbing` while dragging
- Click + drag from anywhere on the row, ≥5px distance to activate
  (PointerSensor with `activationConstraint: { distance: 5 }`)
- The handle is decoration; the entire row is the drag surface

### Mobile
- The `⋮⋮` handle is always softly visible in MyList rows (no hover on
  touch — needs a permanent affordance)
- **Long-press 250ms** without movement activates drag (TouchSensor with
  `activationConstraint: { delay: 250, tolerance: 5 }`)
- If the finger moves before 250ms → normal scroll, no drag
- A tap (press <250ms then release) → normal navigation to item detail

### During drag (both)
- Dragged row: `opacity: 0.6`, `transform: scale(1.02)`, soft shadow
- Target section: dashed `var(--accent)` border + slightly warmer bg
- Other rows in target section animate to make space (dnd-kit handles
  via `useSortable` transform)
- The wrapping `<Link>` on each MyList row is suppressed while
  `isDragging`: we attach `onClickCapture={(e) => isDragging &&
  e.preventDefault()}` to the row anchor

### Accessibility (free via dnd-kit's `KeyboardSensor`)
- Tab → focus on a row
- Space → grab; row visually lifts; `aria-pressed="true"`
- ↑ / ↓ → move between sections (announced via live region: "moved to
  Хочу, position 1 of 3")
- Space → drop (commits the update)
- Esc → cancel (no UPDATE fires)
- Screen reader announces level + position; we provide the
  `announcements` map to dnd-kit's `DndContext` using i18n strings

## Data layer

### `useMyItems.ts`

New method on the hook:

```ts
updateItemPriority: (
  itemId: string,
  priority: 1 | 2 | 3,
) => Promise<{ ok: true } | { error: string }>;
```

Implementation:
1. Optimistic update: `setItems(...)` shifts the row to the new section
   immediately
2. `supabase.from('items').update({ priority }).eq('id', itemId)`
3. On error: revert the local state, return `{ error: errorMessage }`
4. On success: return `{ ok: true }`. The realtime subscription will
   also receive the UPDATE and refetch — the data matches what we
   already have, so the refetch is a no-op. (Pre-existing debounce on
   the realtime listener prevents burst churn.)

The hook follows the established pattern: pure async fetcher, setState
only in `.then()` callbacks.

### Pure helper: `groupByPriority`

```ts
// app/src/items/groupByPriority.ts
export type PriorityLevel = 1 | 2 | 3;

export interface PrioritySection<T extends { priority: number }> {
  level: PriorityLevel;
  items: T[];
}

export function groupByPriority<T extends { priority: number }>(
  items: readonly T[],
): readonly [PrioritySection<T>, PrioritySection<T>, PrioritySection<T>];
```

Returns a fixed-shape 3-tuple in display order [1, 2, 3]. Pure, no React.
Items keep their incoming order within each section (which is `created_at
desc` for the existing list paths).

### Schema, RLS, realtime
**Unchanged.** No migration, no new RPC, no new RLS policy. The
`items.priority` UPDATE is already permitted under the existing
owner-only RLS rule. Realtime `postgres_changes` already fires for it.

## Components

### `<PrioritySectionHeader level count />`
New tiny component in `app/src/components/`. Renders:
- `<PriorityDots level={level}>` (existing)
- Label via `t('priority.sectionHigh' | 'sectionMid' | 'sectionLow')`
- Caveat-font count `— ${count}` (Caveat is already loaded for marginalia
  rats and elsewhere)
- Dashed `border-bottom` hairline

### `<SortableItemRow itemId onPriorityChange children />`
New component in `app/src/screens/items/`. Wraps the existing MyList row
JSX in a `useSortable` hook from `@dnd-kit/sortable`. Exposes
`isDragging`, applies transform style, suppresses link clicks while
dragging.

Only used in MyList. The other three screens render plain (non-sortable)
section bodies.

### `ItemList.tsx` modifications
Add a `mode` prop: `'flat' | 'sectioned' | 'sectioned-dnd'`.
- `'flat'`: today's behavior (currently it has no other mode)
- `'sectioned'`: groups items into 3 sections, renders 3 headers, no drag
- `'sectioned-dnd'`: same + wraps each row in `SortableItemRow` and the
  whole list in `DndContext` + `SortableContext`

Default to `'flat'` for backwards compat. `MyListScreen` passes
`'sectioned-dnd'`.

### Other screens
- `PublicListScreen.tsx`, `FriendListScreen.tsx`, `EventDetailScreen.tsx`
  each get a single `groupByPriority(items)` call before their existing
  `.map()` and an extra wrapping `<PrioritySectionHeader>` around each
  section's items. The row JSX inside is untouched.

## i18n

`app/src/i18n/ru.ts` + `app/src/i18n/en.ts` — additions under a new
`priority` group. Russian values shown; English mirrors the same keys.

```ts
priority: {
  sectionHigh:        'Очень хочу',
  sectionMid:         'Хочу',
  sectionLow:         'Если найдётся',
  sectionEmptyHint:   'здесь пусто — перетащи сюда что-то',
  a11yGrabbed:        'Взято: {title}. Используй стрелки чтобы переместить.',
  a11yMovedTo:        'Перемещено в «{section}».',
  a11yDropped:        'Сохранено в «{section}».',
  a11yCanceled:       'Отменено.',
}
```

English equivalents: `Really want / Want / If found / empty — drag
something here / Grabbed: {title}. Use arrows to move. / Moved to
"{section}". / Saved to "{section}". / Cancelled.`

Existing `item.priorityHigh`, `item.priorityMid`, `item.priorityLow`
(used by `PriorityChip` in the form) stay where they are — different
context (form chip label) takes the longer phrasing "очень хочу" /
"хочу" / "если найдётся", section labels use the title-case forms.

## Tests (TDD — test commit then feat commit, as enforced project-wide)

1. `groupByPriority.test.ts` — pure function: empty input, all-one-level,
   all-three-levels, items keep within-section order
2. `useMyItems.test.tsx` — `updateItemPriority` happy path + error path +
   optimistic revert verified by intermediate state assert
3. `PrioritySectionHeader.test.tsx` — renders dots + label + count
4. `SortableItemRow.test.tsx` — applies transform style when isDragging,
   suppresses link click during drag (verified via React Testing Library
   `userEvent` + fake DnD events from `@dnd-kit/test-utils` if needed,
   else manual dispatch)
5. `MyListScreen.test.tsx` — three section headers visible, dropping an
   item via simulated DnD calls `updateItemPriority` with correct
   `(id, newPriority)`, optimistic UI flips before promise resolves
6. `FriendListScreen.test.tsx`, `PublicListScreen.test.tsx`,
   `EventDetailScreen.test.tsx` — sections render, zero draggable
   handles in the DOM (assert `[data-testid="drag-handle"]` count = 0)
7. Integration: `priority UPDATE` via owner JWT succeeds, via non-owner
   JWT denied. (Already implied by existing RLS; add an explicit assert
   in the priority-DnD test to lock it.)

Re-run the privacy invariant suite (`events-link-privacy.test.ts` etc.)
after — sectioning the rendering doesn't change RLS but verify nothing
regressed.

## Risks / unknowns

1. **Link-row click suppression while dragging.** Each MyList row is
   wrapped in `<Link to="/i/:itemId">`. dnd-kit's PointerSensor with a
   distance constraint normally suppresses clicks on drag end, but
   browser variance exists (Safari iOS especially). Acceptance test:
   drag a row, drop, do NOT navigate to item detail. If this leaks, add
   `onClickCapture={(e) => isDragging && e.preventDefault()}` on the
   inner anchor.
2. **iOS Safari touch-action.** Need `touch-action: manipulation` on
   rows to prevent double-tap zoom; `touch-action: none` while dragging
   to prevent scroll-while-drag. Apply via inline style toggled on
   `isDragging`.
3. **Realtime echo.** Same-user multi-device: a UPDATE on device A
   triggers a refetch on device A via its own subscription. The refetch
   returns identical data — wasted bytes, not a bug. Existing debounce
   absorbs bursts. Optimization (track in-flight update IDs to skip own
   echoes) is explicitly out of scope.
4. **Grid view + sectioning.** Sections deliberately don't apply to
   `ItemGrid` (mosaic). Mobile users always see list (and therefore
   sections); desktop users on grid keep flat. Documented intentional —
   not a missing feature.
5. **Empty MyList.** If the user has zero items, the existing empty
   state shows. Section headers don't render — we don't show three
   empty sections to a brand-new user.

## Out of scope

- Continuous ordering / arbitrary sort within priority levels
- Per-event or per-circle priority override (one global priority value
  per item, full stop)
- Removing form chips or hiding them under "Advanced"
- Reordering by long-press on grid cards (`ItemCard`)
- Drag-from-grid-to-list affordances
- Bulk-edit ("select 3 items, move all to •••")
- Undo toast for the priority change (current toast system can show a
  generic success; explicit undo is extra plumbing for a low-risk
  operation — punted to a future iteration if anyone asks)

## Acceptance checklist (smoke before merging)

Per the post-link-first deploy discipline rules in `CLAUDE.md`:

- [ ] Mobile: long-press → drag → drop → priority changes; tap → opens item detail; finger-slide → scrolls list
- [ ] Desktop: hover shows handle; click-drag → drop → priority changes; click → opens item detail
- [ ] Keyboard: Tab/Space/↑↓/Space full cycle works; screen reader announces moves (test with VoiceOver)
- [ ] Cross-device: drag on phone → desktop tab updates within 1s via realtime
- [ ] Friend / share / event views: sections render, NO drag affordance visible, priority correctly bucketed
- [ ] Empty section in MyList shows Caveat placeholder + accepts drops
- [ ] Privacy invariant suite passes unchanged
- [ ] All four list-rendering screens lint-clean, type-clean, test-green
- [ ] Lighthouse perf delta ≤ +5KB JS gzipped (dnd-kit is ~10KB but it's
      lazy-loaded only on MyList — measure on `/share/<token>` to confirm
      no regression on the marketing path)
