# Event Detail Redesign

> Brainstormed 2026-05-26 with Edouard following his prod-smoke feedback
> on `/events/:id`. The page felt "так себе" visually: a dead audience
> section left over from the M2 circles model, a heavyweight share-link
> block dominating the top, a 2-column card grid that left empty space
> when a priority section had a single item, and broken-looking striped
> placeholders for items without photos.

## TL;DR

Four changes, one PR:

1. **Delete `AudienceSection`.** It's dead UI — `useEvent` already
   hard-codes `audience: []` per the link-first events redesign
   (2026-05-24). The component still rendered the "+ круг" picker but
   couldn't do anything useful since `event_circles` was dropped.
2. **Replace the share-link block** with a single inline mono-meta line
   under the event title: `«ссылка для гостей · скопировать ↗ · позвать
   друзей →»`. Honoree-only. The big "post-create celebration" share
   card on `?share=1` stays as a separate one-time block.
3. **Reorganise items into a hero-plus-tiles layout.** The first item
   of each priority section becomes a horizontal `200px × auto` hero
   (large photo + meta column with full untruncated note). Remaining
   items in the same section become compact 1:1 tiles in a
   `repeat(auto-fill, minmax(140px, 1fr))` grid below.
4. **Replace striped placeholder with a friendly sitting rat holding
   a sign.** New `withRat` + `signText` props on `PhotoPlaceholder`
   (and pass-through on `ItemPhoto`). Default sign text comes from new
   i18n key `placeholder.noPhoto` («без фото» / «no photo»). Opt-in
   per call site — only large-enough surfaces show the rat.

## Why this exists

Friend feedback on prod: «тебе не кажется что в плане стилистики и
визуально страница event выглядит как минимум так себе». Concrete
issues observed:

- The «КТО ВИДИТ + круг» row is meaningless — the underlying
  `event_circles` table was dropped during link-first events
  (2026-05-24), but the UI block was never removed.
- The share-link textbox + two large buttons block sits above the
  event title, making the share affordance compete with the event
  itself for attention.
- The 2-column grid (`minmax(220px, 1fr)`) gives a single-item
  priority section a half-empty row.
- The striped-hatch placeholder looks like a broken image — not the
  friendly, hand-drawn vibe the rest of the app has.
- Items in a curated event already display owner notes (added
  2026-05-26), but in the hero card position the note gets clamped to
  2 lines — losing the personality on the most prominent item.

## Decisions locked (brainstorming session)

1. **Visual priority: guest discovery + claim.** Hero photos drive
   the page. Honoree controls (× remove, edit, invite) are quieter —
   hover-only on desktop, opacity-dimmed on touch.
2. **Hero card per section is mandatory.** If a section has 1 item,
   that item is the hero. If it has 5 items, item 1 is hero and items
   2-5 are tiles. The hero/tile split mirrors the priority semantic:
   the most important item gets the most space.
3. **Inline meta-line for share, not a card.** No URL textbox surfaced
   by default — only actions. The URL is only copied to clipboard via
   the copy action. (Users who want to see the URL can still find it
   via DevTools or by inspecting the email invite.)
4. **Rat-with-sign is opt-in via prop, not a global default.** Tiny
   placeholders (MyList list-view row thumbnail, friend list row,
   public share row, form edit cover preview) keep the quiet
   watercolor look; large placeholders (event hero, event tile, item
   detail main image, MyList grid card) get the rat.
5. **Empty event state also gets a rat.** Standalone `<SittingRat
   sign signText={...}/>` next to the empty copy — bonus polish, not
   a separate placeholder concern.

## UX details per surface

### Page top (honoree mode)

```
←  К СПИСКУ СОБЫТИЙ

ДР · 29 МАЯ 2026 Г.                           ПРАВИТЬ
29 грустных годиков Эда

ССЫЛКА ДЛЯ ГОСТЕЙ · СКОПИРОВАТЬ ↗ · ПОЗВАТЬ ДРУЗЕЙ →
```

- The `← К СПИСКУ СОБЫТИЙ` back link stays at the top, mono-meta.
- Eyebrow line: kind + date, mono-meta, `var(--ink-3)`.
- Title in `display-italic` (Newsreader italic, `var(--display-l)`).
- Inline share-actions line: three mono-meta phrases separated by
  ` · ` middots. The first is a passive label (ink-3 colour); the
  second and third are clickable terracotta actions.
  - «СКОПИРОВАТЬ ↗» writes `https://ratlist.app/event/<token>` to
    clipboard via `navigator.clipboard.writeText(...)`, fires
    toast `events.share.copied` («ссылка скопирована»).
  - «ПОЗВАТЬ ДРУЗЕЙ →» opens the existing `<InviteFromPeopleModal>`
    that's already mounted on the page.

### Page top (guest mode)

```
←  К СПИСКУ СОБЫТИЙ

ДР · 29 МАЯ 2026 Г.
29 грустных годиков Эда
```

Same shape as honoree but with no inline share line and no «ПРАВИТЬ»
link. Guests don't have a share affordance — they're the ones using
the link, not handing it out. Note is rendered exactly as today
(below title, when present, `var(--ink-2)` 15px).

### Post-create celebration card

The existing `<ShareCard>` (shown when `?share=1` is in the URL right
after event creation) stays unchanged. It's a one-time onboarding
moment, not a permanent UI element, so it doesn't compete with the
inline share-meta line — the user only sees one or the other in
practice.

### Items section — hero card

For the first item in each priority section:

```
┌─────────────┬────────────────────────────────────────────────────┐
│             │ Rossignol Experience 82 Ti                         │
│   photo     │ ROSSIGNOL · SKI                                    │
│   200px     │ €760                                               │
│   4:3       │                                                    │
│             │ À chaque virage, sur tous les terrains. D'un bout  │
│             │ à l'autre de la montagne. Le ski qui ouvre tous    │
│             │ les itinéraires.                                   │
└─────────────┴────────────────────────────────────────────────────┘
```

- CSS grid `grid-template-columns: 200px 1fr` with `gap: var(--s-5)`.
- Photo `aspect-ratio: 4/3`, 200px wide → 150px tall.
- Photo container: same as today (`<ItemPhoto>`), but now passing
  `withRat={true}` for the placeholder branch.
- × remove button (honoree): absolute top-right of photo, `var(--ink-3)`,
  opacity 0 → 1 on hover. Size 22px (circle, `rgba(43,38,32,0.6)`
  background with white ×). On touch devices: opacity 0.4 always.
- Meta column:
  - Title: Newsreader italic, 22px, weight 500, `var(--ink)`, line-height 1.15.
    Margin 0 top.
  - Brand line: mono-meta (11px uppercase, `var(--ink-3)`,
    letter-spacing 0.06em). Format: `{maker}{maker && kind ? ' · ' : ''}{kind}`.
    Conditional — if no maker AND no event kind, skip the line entirely.
  - Price: Newsreader italic, 15px, `var(--accent)`, top margin `var(--s-2)`.
    Skip when null/empty.
  - Note: Public Sans body, 13px, `var(--ink-2)`, line-height 1.5, top
    margin `var(--s-3)`. **NO clamp** — full text visible. Max-width
    constrained naturally by column width.
  - Guest claim control: `<ClaimControl ... />` (existing) below note
    with `marginTop: var(--s-3)`.

### Items section — tiles

For items 2..N in each priority section:

- Grid: `repeat(auto-fill, minmax(140px, 1fr))` with `gap: var(--s-4)`.
- Each tile:
  - Photo: `aspect-ratio: 1/1` (square), `<ItemPhoto withRat />`.
  - × remove (honoree, hover-only).
  - Title: Public Sans 12px weight 500, margin-top 6px, line-clamp 2.
  - Price: Newsreader italic 12px terracotta, margin-top 2px.
  - **No brand, no note** on the tile — click into item detail for
    those. Tiles are previews; the hero carries the full info.
  - Guest: NO claim control on tile. Tiles in guest mode link to
    `/i/:itemId` where claim happens. (This is a deviation from the
    current behavior where every card carries claim; documented as a
    deliberate trade for visual cleanliness. We'll re-evaluate if
    guests complain it's an extra tap.)

### Items section — mobile (`< 768px`)

- Hero: photo stacks above meta in single column. Photo full-width,
  `aspect-ratio: 4/3`, meta below.
- Tiles: `repeat(auto-fill, minmax(120px, 1fr))` (2 per row typically).

### Items section — section header

Unchanged from current `<PrioritySectionHeader>`. Still dotted hairline
underline + dots + label + Caveat count.

### Empty event state

When `items.length === 0`:

```
┌────────────────────────────────────────┐
│                                        │
│           [sitting rat 80px            │
│            with sign «empty»]          │
│                                        │
│   крысёнок ещё ничего не выбрал        │
│                                        │
│      + добавить из своего списка       │   ← honoree only
│                                        │
└────────────────────────────────────────┘
```

- Centered `<SittingRat size={80} sign signText={t('events.emptySign')} />`.
- Below it: `t('events.noItemsHonoree')` for honoree, `events.noItemsGuest`
  for guest (existing keys).
- Honoree gets a terracotta-bordered ghost button «+ добавить из своего
  списка» that opens the existing item picker.

## Component changes

### `<PhotoPlaceholder>` extensions

New props (both optional, default keeps current behavior):

```ts
interface PhotoPlaceholderProps {
  // existing — unchanged:
  wash?: string;
  height?: number;
  aspectRatio?: string;
  label?: string;
  style?: CSSProperties;

  // new:
  /** Show the SittingRat with a sign in the wash centre. Default false. */
  withRat?: boolean;
  /** Override the sign text. Defaults to t('placeholder.noPhoto') when
   *  withRat is true and this prop is omitted. */
  signText?: string;
}
```

Implementation:
- When `withRat={true}`, render `<SittingRat>` absolutely centered
  inside the wash. Size scales with the container:
  `size = Math.min(80, containerHeight * 0.45)` via inline style if
  `height` is set; otherwise default `size={60}` and accept that very
  tall placeholders waste space. (Acceptable trade — most call sites
  hit aspect-ratio + parent-width sizing where 60 looks right.)
- `signText` prop: when undefined and `withRat=true`, the component
  calls `useI18n()` and renders `t('placeholder.noPhoto')` on the sign.
  When provided, the literal string is used. (This means
  `PhotoPlaceholder` becomes coupled to the i18n provider — match this
  in the test setup.)
- `<RatDefs>` must be mounted somewhere in the tree (already required
  for any rat use; AppLayout already does this).

### `<ItemPhoto>` pass-through

```ts
interface ItemPhotoProps {
  // existing:
  coverUrl: string | null;
  height?: number;
  aspectRatio?: string;
  alt?: string;
  style?: CSSProperties;

  // new:
  withRat?: boolean;
  signText?: string;
}
```

When `coverUrl === null`, pass `withRat` and `signText` through to
`<PhotoPlaceholder>`. When `coverUrl` is set, ignore them (real image
renders, no rat needed).

### `<HeroCuratedItem>` new file

Lives at `app/src/screens/events/HeroCuratedItem.tsx`. Renders a
single curated-item entry in hero format (200px photo + meta column).
Inputs:

```ts
interface HeroCuratedItemProps {
  entry: { item_id: string; item: CuratedItem; claims: EventClaim[] };
  isHonoree: boolean;
  myUserId: string | null;
  onDetach: () => void;
  onClaim: () => void;
  onRelease: () => void;
}
```

Reuses `<ItemPhoto withRat />`, `<ClaimControl>`, etc.

### `<TileCuratedItem>` new file

Lives at `app/src/screens/events/TileCuratedItem.tsx`. Renders a single
curated-item entry in compact 1:1 tile format. Same props shape as
`<HeroCuratedItem>`. No claim button (guests click through to detail
page).

### `<EventDetailScreen>` major refactor

- Delete `AudienceSection` component definition.
- Delete `<AudienceSection ... />` render.
- Delete `attachCircle` / `detachCircle` from the destructure of
  `useEvent()`.
- Delete `import { useGroups }`.
- Header: combine current `HonoreeHeader`/`GuestHeader` with the new
  inline share-meta line. Cleanest path: keep both header components
  but add the share-meta line as a sibling JSX block immediately
  after `<HonoreeHeader>`.
- Items section: rewrite the `groupByPriority().map(section => ...)`
  to use `<HeroCuratedItem>` for `section.items[0]` and a grid of
  `<TileCuratedItem>` for `section.items.slice(1)`.
- Empty state: centered rat with sign + caption.
- `<CoordinatorPanel>` keeps participant-list functionality but its
  internal share-block is deleted (the new inline meta line replaces it).
  The panel renders only the participants list + «пригласить из людей»
  button below the header.

### `useEvent` cleanup

In `app/src/events/useEvent.ts`:

- Remove `attachCircle` and `detachCircle` from `UseEventResult`.
- Remove their implementations (`useCallback` blocks).
- Remove `audience: EventAudienceCircle[]` from the query shape.
- Remove `EventAudienceCircle` type export (consumers checked — only
  `EventDetailScreen` uses it, and it's gone after this change).

## i18n

Additions to `app/src/i18n/ru.ts` (and mirror to `en.ts`):

```ts
events: {
  // existing keys stay
  share: {
    // existing share.copied / share.copy / share.invite stay (used by ShareCard)
    linkLabel: 'ссылка для гостей',      // EN: 'share link'
    copyShort: 'скопировать ↗',          // EN: 'copy ↗'
    inviteShort: 'позвать друзей →',     // EN: 'invite friends →'
  },
  emptySign: 'empty',                    // EN: 'empty' (Caveat label inside the rat's sign on empty event)
  // existing noItemsHonoree / noItemsGuest stay
},
placeholder: {                            // new top-level group
  noPhoto: 'без фото',                   // EN: 'no photo'
},
```

Deletions:
- `events.audienceLabel`, `events.audienceEmpty`, `events.addCircle`,
  `events.collapse`, `events.removeCircle` — only `AudienceSection`
  used them. Confirmed via grep before deleting.

## Tests (TDD — test commit before impl commit, per project discipline)

### New: `app/src/components/__tests__/PhotoPlaceholder.test.tsx`

1. Renders without rat by default (`withRat` omitted) — no `[data-testid="sitting-rat"]` in DOM
2. With `withRat={true}` and no `signText` → sign reads `t('placeholder.noPhoto')` → in RU locale: «без фото»
3. With `withRat={true}` and explicit `signText="hello"` → sign reads literal «hello»

### Modified: `app/src/screens/events/__tests__/EventDetailScreen.test.tsx`

Delete:
- All assertions referencing «круг», `addCircle`, `audienceLabel`

Add:
- Honoree mode: «ссылка для гостей» visible in DOM
- Guest mode: «ссылка для гостей» NOT in DOM (`screen.queryByText(...) === null`)
- Click «скопировать ↗» → `navigator.clipboard.writeText` called with correct URL (mock the API in the test)
- Click «позвать друзей →» → `InviteFromPeopleModal` opens (rendered with its existing testid or visible state)
- Priority section with 1 item: renders 1 hero (find by class/testid), 0 tiles
- Priority section with 3 items: 1 hero + 2 tiles
- Item without cover_url in hero position: rat is rendered (`getByTestId('sitting-rat')` finds it)

### Modified: `app/src/events/__tests__/useEvent.test.tsx`

- Delete `attachCircle` / `detachCircle` test cases
- Delete `audience` shape assertions

## Risks / unknowns

1. **`navigator.clipboard.writeText` in tests.** Need to mock the API
   in setup. Existing code may already mock it for ShareCard tests —
   reuse the pattern.
2. **`<PhotoPlaceholder>` becoming i18n-dependent.** Existing tests
   that render it (if any) won't wrap with I18nProvider when
   `withRat=false`. The lookup is conditional — only fires when
   `withRat && !signText`. Default behavior unchanged.
3. **Rat sizing at small `<PhotoPlaceholder>` heights.** When a
   call site doesn't pass `height` and the parent gives the placeholder
   a tiny height (say, 40px), the rat at `size=60` will overflow.
   Mitigation: clamp `size` to half the parent height when measurable,
   else trust the call site to opt out via `withRat={false}`. We're
   only opting in on surfaces ≥ 120px tall, so this is theoretical.
4. **Guest tile loses claim affordance.** Guests can no longer claim
   from the tile view — they have to click into item detail. This is
   a deliberate trade. If feedback says it's an extra tap, restore
   claim-on-tile in a follow-up.

## Out of scope

- `EventLandingScreen` (anon `/event/<token>`) layout — keeps its
  existing grid-mosaic. The rat placeholder propagates there via the
  `withRat` opt-in on its `<ItemPhoto>`, but the layout doesn't change.
- `FriendListScreen`, `PublicListScreen`, `MyListScreen` items
  rendering — no changes. Their row thumbnails are too small for the
  rat treatment; they keep the quiet watercolor.
- `<ShareCard>` (post-create celebration on `?share=1`) — unchanged.
- Drag-and-drop on event detail — never enabled here, no change.
- Claim flow, claim privacy, RLS, RPCs — no change.
- Mobile-specific gesture changes — current touch behavior preserved.

## Acceptance checklist (smoke before merging)

- [ ] Honoree desktop: see inline share + edit; click «скопировать» →
  toast «ссылка скопирована»; click «позвать друзей» → modal opens
- [ ] Honoree mobile (touch emulation): same flows work; × on photo
  is always slightly visible (opacity 0.4) since no hover
- [ ] Guest desktop: no inline share line; claim button visible only on
  hero card; clicking tile navigates to `/i/:itemId`
- [ ] Item without cover_url on hero: rat with sign «без фото» visible
  inside watercolor; switch to EN locale → sign reads «no photo»
- [ ] Item without cover_url on tile: same behavior, rat scaled down
- [ ] Priority section with 1 item: only hero, no tiles section
- [ ] Priority section with multiple items: 1 hero + tiles grid below
- [ ] Empty event (`items.length === 0`): centered rat + caption
- [ ] No «круг»/«КТО ВИДИТ» text anywhere in the rendered DOM
- [ ] tsc strict + eslint + 148+ tests still passing
- [ ] Prod build clean on Node 22+, no chunk-size regression on
  marketing path (event-screens are lazy-loaded — main path unaffected)
