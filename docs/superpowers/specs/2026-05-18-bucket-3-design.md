# Bucket 3 — Realtime debounce + a11y polish (design)

Date: 2026-05-18
Status: design, awaiting implementation plan
Predecessor: `docs/BUCKET_3_HANDOFF.md`
Audit source: 2026-05-17 full-project audit, tier 3 findings

## Goals

Close the three low-impact items from the 2026-05-17 audit's tier 3:

1. Tame realtime subscriptions in `useEvents.ts` so a burst of writes
   collapses into one `get_my_events` RPC call instead of one per
   `postgres_changes` event.
2. Add an accessible skip-link so keyboard users can bypass the
   sidebar / bottom-tab chrome on every route.
3. Record the prerender chunk follow-up (waits on Vite 9 / Rolldown)
   so it isn't lost.

## Non-goals

- Debouncing the other five hooks that subscribe to `postgres_changes`
  (`useGroups`, `useGroupMembers`, `useMyItems`, `useItem`,
  `useFriendList`). The audit flagged only `useEvents`. Same helper
  can be applied later if those hooks turn out to suffer from the
  same burst pattern.
- Server-side `filter:` on `postgres_changes` for events tables.
  Realtime's filter clause is single-column and static at subscribe
  time; the set of events the caller can see is correlated
  (`event_circles` → `group_members`) and changes when the user joins
  or leaves a group. A partial filter on `events.honoree_id` would
  only help own-event writes and would split the subscription logic
  in two channels with no real win. Debounce alone is enough.
- Upgrading Vite to 9 / switching to Rolldown to drop the
  ~10 KB-gzip `prerender-<hash>.js` chunk from the client bundle. The
  existing comment in `app/vite.config.ts` already documents the
  cost; we only add a tracker entry so the follow-up surfaces when
  Vite 9 ships.
- Anything in the "Open operational items" section of the bucket 3
  handoff (the 2026-05-24 `console.warn` removal, GitHub branch
  protection). Those have their own deadlines / owners.

## 1. Realtime debounce

### Where the bursts come from

`app/src/events/useEvents.ts:118-135` subscribes to `events`,
`event_circles`, and `event_items` with `event: '*'` and no filter.
Every change to any of those tables triggers `refresh()` which calls
the `get_my_events` RPC. Two write patterns produce bursts:

- Honoree editing an event in the detail screen: `updateEvent` writes
  to `events`, then `attachCircle` / `detachCircle` / `attachItem` /
  `detachItem` each fire a junction-table write. A single user action
  ("save") can be three to five RPC calls.
- Replication catch-up after a brief network blip — Supabase realtime
  may flush multiple change events in <100 ms.

At ~100 events per user this is wasteful; at higher counts it
becomes visible jank.

### Helper

`app/src/lib/debounce.ts`:

```ts
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  ms: number,
): { (...args: Args): void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const debounced = (...args: Args) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, ms);
  };
  debounced.cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return debounced;
}
```

Trailing debounce (not leading). `cancel()` is required so the
`useEffect` cleanup can drop the pending timer before
`removeChannel` — otherwise an unmount during the debounce window
leaves a stale `refresh()` to fire and `setFetched` on a freed hook.

### Integration in `useEvents.ts`

Inside the realtime `useEffect` (the second one, lines 118-135):

```ts
useEffect(() => {
  if (authStatus !== 'authenticated' || !user) return undefined;

  const trigger = debounce(() => {
    void refresh();
  }, 300);

  const channel = supabase
    .channel(`my-events:${user.id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, trigger)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'event_circles' }, trigger)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'event_items' }, trigger)
    .subscribe();

  return () => {
    trigger.cancel();
    void supabase.removeChannel(channel);
  };
}, [authStatus, user, refresh]);
```

### Why 300 ms

Midpoint of the audit's 200–500 ms range. Burst writes from the
honoree-edit pattern complete in ~50–150 ms; 300 ms collapses them
into one RPC call without visible delay. Lower would still split
some bursts; higher starts to feel sluggish when the user makes a
single edit and waits for the list to refresh.

### Tests

`app/src/lib/__tests__/debounce.test.ts` — Vitest with
`vi.useFakeTimers()`:

- three calls within 100 ms → `fn` called once after 300 ms.
- `cancel()` after first call → `fn` never runs.
- two calls with > 300 ms gap → `fn` runs twice.

`app/src/events/__tests__/useEvents.test.tsx` — mock the supabase
channel `.on(...)` callback registration, fire several callbacks
synchronously, advance timers by 300 ms, assert that `supabase.rpc`
was called once (not N times). Same shape as the existing
`useMyItems` test (`src/items/__tests__/useMyItems.test.tsx`); use
that as a template.

## 2. Skip-link

### Component

`app/src/components/SkipLink.tsx`:

```tsx
import { useI18n } from '../i18n';

export function SkipLink() {
  const { t } = useI18n();
  return (
    <a className="skip-link" href="#main">
      {t('a11y.skipToMain')}
    </a>
  );
}
```

### Placement

In `App.tsx`, rendered before the router so it's the first focusable
element on every route, including the prerendered landing and legal
pages. Single instance — landing, login, share, authed routes all
share it.

### Target

Add `id="main"` to the `<main>` landmark:

- `app/src/components/AppLayout.tsx:23` — already has
  `<main className="app-main">`; add `id="main"`.
- `app/src/components/PaperLayout.tsx` — only when `as='main'`. Pass
  the id through the `Tag` element so pre-auth, public, legal, and
  share screens that render PaperLayout as the page's `<main>` also
  have the id. When `as='div'` (PaperLayout inside AppLayout), no id
  — AppLayout's `<main>` owns it.

No route renders both AppLayout and `PaperLayout as='main'`, so
there's no risk of two elements sharing `id="main"`.

### Styling

`app/src/styles/global.css`, accessibility section:

```css
.skip-link {
  position: absolute;
  top: 0;
  left: 0;
  padding: 0.5rem 1rem;
  background: var(--color-accent);
  color: var(--color-paper);
  text-decoration: none;
  font-weight: 600;
  border-radius: 0 0 4px 0;
  transform: translateY(-100%);
  transition: transform 0.15s ease;
  z-index: 1000;
}

.skip-link:focus {
  transform: translateY(0);
  outline: 2px solid var(--color-ink);
  outline-offset: 2px;
}
```

Hidden off-screen by transform (not `display: none` — would skip the
tab order). Slides in on `:focus`. Uses existing terracotta accent
on paper background so it matches the editorial vibe; outline on
focus is the ink color for WCAG contrast.

### i18n

New key `a11y.skipToMain`:

- `app/src/i18n/ru.ts` — "Перейти к содержимому"
- `app/src/i18n/en.ts` — "Skip to main content"

Both `Translation` shapes must agree (TypeScript will enforce). The
`a11y` namespace is new; nest the key under it so future a11y
strings have a home.

### Tests

`app/src/components/__tests__/SkipLink.test.tsx`:

- Renders with `href="#main"`.
- Text matches RU and EN copy when the i18n provider's locale is
  switched.
- Has class `skip-link` so the CSS rule applies.

No focus-state browser test — visual styling is covered by the CSS
rule, and Lighthouse / axe runs are a post-merge verification step
(see Verification section).

## 3. Prerender chunk tracker

No code change. Append a one-line entry to
`docs/BUCKET_3_HANDOFF.md` "Open operational items":

> - **Vite 9 / Rolldown lands**: drop the ~10 KB-gzip
>   `prerender-<hash>.js` chunk from the client bundle. The plugin's
>   `manualChunks` hook should start being honored for entry inputs;
>   verify the chunk is gone after upgrade. Comment in
>   `app/vite.config.ts` documents the current state.

CLAUDE.md untouched — its "Feature status" table is for shipped
work, and this is a future deferral better tracked next to the rest
of the bucket 3 punch list.

## Verification

After implementation:

- `npm test` (frontend) green.
- `npm run lint` clean — the `react-hooks/set-state-in-effect` rule
  still applies to `useEvents.ts`, must not regress.
- Manual: open `/events` in Chrome, run `npm run build && npm run
  preview`, fire DevTools "Application → Service Workers" updates,
  watch Network for `get_my_events` calls while attaching /
  detaching circles fast — should be one call per ~300 ms window,
  not one per write.
- Manual: keyboard-tab from a cold load of `/`, the skip-link
  should be the first focusable element and should reveal itself.
  Press Enter — focus jumps to the main content.
- Manual: Lighthouse a11y score on `/` should still be 100 (already
  is post Phase 1B).

## Commit plan

One PR, three atomic commits, in order:

1. `feat(lib): add debounce helper + apply to useEvents realtime` —
   `app/src/lib/debounce.ts`, debounce-helper test, useEvents change,
   useEvents test.
2. `feat(a11y): add skip-link to main content` — SkipLink component,
   App.tsx hookup, AppLayout / PaperLayout `id="main"` plumbing, CSS
   rule, two i18n entries, component test.
3. `docs: tracker for Vite 9 prerender chunk drop` — single line in
   `docs/BUCKET_3_HANDOFF.md`.

CI must stay green on each commit so the bisect surface is honest.

## File map

```
app/
  src/
    App.tsx                                 +SkipLink
    components/
      AppLayout.tsx                         id="main"
      PaperLayout.tsx                       conditional id="main"
      SkipLink.tsx                          NEW
      __tests__/
        SkipLink.test.tsx                   NEW
    events/
      useEvents.ts                          +debounce wiring
      __tests__/
        useEvents.test.tsx                  NEW
    i18n/
      ru.ts                                 +a11y.skipToMain
      en.ts                                 +a11y.skipToMain
    lib/
      debounce.ts                           NEW
      __tests__/
        debounce.test.ts                    NEW
    styles/
      global.css                            +.skip-link rules
docs/
  BUCKET_3_HANDOFF.md                       +Vite 9 tracker line
  superpowers/specs/
    2026-05-18-bucket-3-design.md           THIS FILE
```

## Open questions

None at design time. `app/src/events/__tests__/useEvents.test.tsx`
does not exist (`useEvent.test.tsx` does, but not the list hook);
the implementation creates it from the `useMyItems.test.tsx`
template. `app/src/lib/__tests__/` and
`app/src/components/__tests__/` directories don't exist yet either
— they're created on first test under the same `__tests__`-next-to-
source convention the rest of the codebase uses.
