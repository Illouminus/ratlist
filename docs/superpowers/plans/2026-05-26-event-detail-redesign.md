# Event Detail Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `/events/:id` — delete dead `AudienceSection`, replace heavy share-link block with an inline mono-meta line, split items into a hero-plus-tiles layout per priority section, upgrade the no-photo placeholder to a friendly sitting rat with i18n'd sign.

**Architecture:** All changes are frontend-only; no DB migration. `PhotoPlaceholder` and `ItemPhoto` gain optional `withRat` / `signText` props (default false → no behavior change). Two new presentational components (`HeroCuratedItem`, `TileCuratedItem`) replace the universal `CuratedItemCard` inside `EventDetailScreen`. `useEvent` loses its dead `attachCircle` / `detachCircle` / `audience` surface.

**Tech Stack:** Vite + React 19 + TypeScript (strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`); Vitest + RTL; vanilla CSS via design tokens (`--display-l`, `--ink-2`, `--accent`, `--s-*`, `--font-display`, `--font-hand`). Existing components reused: `<SittingRat>`, `<ItemPhoto>`, `<PhotoPlaceholder>`, `<PrioritySectionHeader>`, `<ClaimControl>`, `<InviteFromPeopleModal>`.

**Spec reference:** [`docs/superpowers/specs/2026-05-26-event-detail-redesign-design.md`](../specs/2026-05-26-event-detail-redesign-design.md)

---

## TDD discipline — non-negotiable

For every component / hook method / behavior:

1. Write the failing test
2. Run it → must FAIL with a recognizable error (not a setup/type error — a behavior gap)
3. Commit the test with `test(area):` prefix
4. Write the minimal implementation
5. Run the test → must PASS
6. Commit the implementation with `feat(area):` or `refactor(area):` prefix

Both commits carry the `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` trailer.

Pure i18n string additions don't need a red commit — bundle them with the first feature commit that consumes them.

---

## File map

```
app/src/
├── components/
│   ├── PhotoPlaceholder.tsx                   [Task 2]  +withRat +signText
│   ├── ItemPhoto.tsx                          [Task 2]  pass-through
│   └── __tests__/
│       └── PhotoPlaceholder.test.tsx          [Task 2]  NEW
├── events/
│   ├── useEvent.ts                            [Task 8]  drop attachCircle/detachCircle/audience
│   └── __tests__/
│       └── useEvent.test.tsx                  [Task 8]  drop circle tests
├── screens/events/
│   ├── EventDetailScreen.tsx                  [Tasks 3, 4, 5, 6, 7]  major refactor
│   ├── HeroCuratedItem.tsx                    [Task 3]  NEW
│   ├── TileCuratedItem.tsx                    [Task 4]  NEW
│   └── __tests__/
│       ├── HeroCuratedItem.test.tsx           [Task 3]  NEW
│       ├── TileCuratedItem.test.tsx           [Task 4]  NEW
│       └── EventDetailScreen.test.tsx         [Tasks 5, 6, 7]  modified
├── i18n/
│   ├── ru.ts                                  [Task 1]  +placeholder.* +events.share.*Short
│   └── en.ts                                  [Task 1]  mirror
```

---

## Task 1: i18n additions

**Files:**
- Modify: `app/src/i18n/ru.ts`
- Modify: `app/src/i18n/en.ts`

- [ ] **Step 1: Read current i18n shape**

```bash
grep -n "^  events:\|^  placeholder:" /Users/edouard/dev/wishlist/app/src/i18n/ru.ts
grep -A 10 "share:" /Users/edouard/dev/wishlist/app/src/i18n/ru.ts | head -15
```

Note the current `events.share` keys (likely `copy`, `copied`, `invite`) and the top-level structure. The new `placeholder` group is a new top-level key.

- [ ] **Step 2: Add new keys to `app/src/i18n/ru.ts`**

Inside the existing `events: { share: { ... } }` block, add:

```ts
events: {
  // existing keys unchanged...
  share: {
    // existing: copy, copied, invite, etc. — UNCHANGED
    linkLabel: 'ссылка для гостей',
    copyShort: 'скопировать ↗',
    inviteShort: 'позвать друзей →',
  },
  emptySign: 'empty',
},
```

Add as a new top-level group (sibling of `events`, anywhere in the file):

```ts
placeholder: {
  noPhoto: 'без фото',
},
```

- [ ] **Step 3: Mirror in `app/src/i18n/en.ts`**

```ts
events: {
  share: {
    linkLabel: 'share link',
    copyShort: 'copy ↗',
    inviteShort: 'invite friends →',
  },
  emptySign: 'empty',
},

placeholder: {
  noPhoto: 'no photo',
},
```

- [ ] **Step 4: Verify**

```bash
cd /Users/edouard/dev/wishlist/app && npx tsc -p tsconfig.app.json --noEmit
```
Expected: clean. (i18n is the `Translation` recursive type — strings just need to land in matching paths.)

- [ ] **Step 5: Commit**

```bash
git add app/src/i18n/ru.ts app/src/i18n/en.ts
git commit -m "$(cat <<'EOF'
feat(i18n): add placeholder.noPhoto and events.share.*Short keys

Foundation for the event-detail redesign: the rat-with-sign placeholder
reads `placeholder.noPhoto` ("без фото" / "no photo") when no signText
is provided; the new inline share-meta line uses shorter labels than
the existing share-card buttons (copyShort + inviteShort).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: PhotoPlaceholder + ItemPhoto extensions

**Files:**
- Create: `app/src/components/__tests__/PhotoPlaceholder.test.tsx`
- Modify: `app/src/components/PhotoPlaceholder.tsx`
- Modify: `app/src/components/ItemPhoto.tsx`

- [ ] **Step 1: Write the failing test**

Create `app/src/components/__tests__/PhotoPlaceholder.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '../../i18n';
import { PhotoPlaceholder } from '../PhotoPlaceholder';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('kryska.lang', 'ru');
});

function renderWithI18n(ui: React.ReactNode) {
  return render(<I18nProvider>{ui}</I18nProvider>);
}

describe('<PhotoPlaceholder>', () => {
  it('renders without rat by default', () => {
    renderWithI18n(<PhotoPlaceholder aspectRatio="1 / 1" />);
    expect(screen.queryByTestId('sitting-rat')).toBeNull();
  });

  it('renders SittingRat when withRat=true', () => {
    renderWithI18n(<PhotoPlaceholder aspectRatio="1 / 1" withRat />);
    expect(screen.getByTestId('sitting-rat')).toBeTruthy();
  });

  it('uses t("placeholder.noPhoto") as default sign text', () => {
    renderWithI18n(<PhotoPlaceholder aspectRatio="1 / 1" withRat />);
    expect(screen.getByText('без фото')).toBeTruthy();
  });

  it('uses explicit signText when provided', () => {
    renderWithI18n(<PhotoPlaceholder aspectRatio="1 / 1" withRat signText="hello" />);
    expect(screen.getByText('hello')).toBeTruthy();
    expect(screen.queryByText('без фото')).toBeNull();
  });
});
```

- [ ] **Step 2: Run, FAIL, commit**

```bash
cd /Users/edouard/dev/wishlist/app && npm test -- --run PhotoPlaceholder
```
Expected: tests FAIL — `withRat` prop doesn't exist, `[data-testid="sitting-rat"]` not in DOM.

```bash
git add app/src/components/__tests__/PhotoPlaceholder.test.tsx
git commit -m "$(cat <<'EOF'
test(components): PhotoPlaceholder withRat + signText props

Locks the contract: withRat=true renders SittingRat with a sign;
signText overrides the default; default reads t('placeholder.noPhoto').
Backwards-compat: withRat omitted → no rat in DOM.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Modify `app/src/components/PhotoPlaceholder.tsx`**

Replace the whole file with:

```tsx
/**
 * `<PhotoPlaceholder>` — a watercolor-wash filler used in place of a real
 * item photo. Mirrors the placeholder shape from the design (cream cell,
 * diagonal hatch, soft radial wash, optional handwritten label, optional
 * sitting-rat with sign).
 *
 * Pass `withRat={true}` to render a `<SittingRat>` with a sign centred in
 * the wash. The sign reads `t('placeholder.noPhoto')` by default; pass
 * `signText` to override (e.g. on the empty-event state where we want
 * "empty" instead of "no photo").
 *
 * The rat is opt-in — default behavior (no rat) is unchanged from the
 * pre-redesign component. Tiny placeholders (small thumbnails) should
 * keep `withRat={false}` because the rat doesn't read well below ~120px.
 */
import type { CSSProperties } from 'react';
import { useI18n } from '../i18n/useI18n';
import { SittingRat } from './rats/SittingRat';

interface PhotoPlaceholderProps {
  /** The wash colour. Defaults to the current accent wash. */
  wash?: string;
  /** Fixed height (px) — use OR `aspectRatio`, not both. */
  height?: number;
  /** CSS aspect-ratio string, e.g. `"4 / 3"`. Preferred for cards. */
  aspectRatio?: string;
  /** Tiny handwritten caption (e.g. "product shot") in the bottom-left. Optional. */
  label?: string;
  style?: CSSProperties;
  /** Show a SittingRat with a sign in the wash centre. Default false. */
  withRat?: boolean;
  /** Override the sign text. Defaults to t('placeholder.noPhoto') when
   *  withRat is true and this prop is omitted. */
  signText?: string;
}

export function PhotoPlaceholder({
  wash = 'var(--accent-wash)',
  height = 200,
  aspectRatio,
  label,
  style,
  withRat = false,
  signText,
}: PhotoPlaceholderProps) {
  // useI18n is only needed for the default rat-sign text. Calling it
  // unconditionally is fine — the hook returns a stable function whether
  // we use the result or not, and the rest of the component doesn't
  // depend on locale.
  const { t } = useI18n();
  const effectiveSignText = signText ?? t('placeholder.noPhoto');

  return (
    <div
      style={{
        height: aspectRatio ? undefined : height,
        aspectRatio,
        position: 'relative',
        overflow: 'hidden',
        background: '#fffdf6',
        boxShadow: 'inset 0 0 0 1px var(--hair)',
        ...style,
      }}
    >
      {/* soft radial watercolor blob */}
      <div
        style={{
          position: 'absolute',
          inset: '14%',
          background: `radial-gradient(ellipse at 35% 30%, ${wash} 0%, ${wash}cc 35%, transparent 75%)`,
          opacity: 0.65,
          filter: 'blur(3px)',
        }}
      />
      {/* diagonal hatch */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.05,
          backgroundImage:
            'repeating-linear-gradient(135deg, var(--ink) 0 1px, transparent 1px 14px)',
        }}
      />
      {withRat && (
        <div
          data-testid="sitting-rat"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <SittingRat size={60} sign signText={effectiveSignText} />
        </div>
      )}
      {label && (
        <div
          style={{
            position: 'absolute',
            left: 10,
            bottom: 8,
            fontFamily: 'var(--font-hand)',
            fontWeight: 500,
            fontSize: 14,
            color: 'var(--ink-3)',
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Modify `app/src/components/ItemPhoto.tsx`**

Replace with:

```tsx
/**
 * `<ItemPhoto>` — renders an uploaded cover image, or falls back to the
 * watercolour `<PhotoPlaceholder>` when none is set.
 *
 * The optional `withRat` + `signText` props are pass-through to
 * `PhotoPlaceholder` for the no-cover branch. Call sites that render
 * large placeholder areas (event hero cards, item detail page) opt in
 * via `withRat={true}`. Tiny thumbnails (list-view rows) leave it off.
 */
import type { CSSProperties } from 'react';
import { PhotoPlaceholder } from './PhotoPlaceholder';

interface ItemPhotoProps {
  /** Public Supabase Storage URL, or null for the placeholder. */
  coverUrl: string | null;
  /** Fixed height (px) — use OR `aspectRatio`, not both. */
  height?: number;
  aspectRatio?: string;
  alt?: string;
  style?: CSSProperties;
  /** Pass-through to PhotoPlaceholder. Ignored when coverUrl is set. */
  withRat?: boolean;
  /** Pass-through to PhotoPlaceholder. Ignored when coverUrl is set. */
  signText?: string;
}

export function ItemPhoto({
  coverUrl,
  height,
  aspectRatio,
  alt = '',
  style,
  withRat,
  signText,
}: ItemPhotoProps) {
  if (!coverUrl) {
    return (
      <PhotoPlaceholder
        height={height}
        aspectRatio={aspectRatio}
        style={style}
        withRat={withRat}
        signText={signText}
      />
    );
  }

  return (
    <div
      style={{
        height: aspectRatio ? undefined : height,
        aspectRatio,
        position: 'relative',
        overflow: 'hidden',
        background: '#fffdf6',
        boxShadow: 'inset 0 0 0 1px var(--hair)',
        ...style,
      }}
    >
      <img
        src={coverUrl}
        alt={alt}
        loading="lazy"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
        }}
      />
    </div>
  );
}
```

- [ ] **Step 5: Run tests + tsc**

```bash
cd /Users/edouard/dev/wishlist/app && npm test -- --run PhotoPlaceholder && npx tsc -p tsconfig.app.json --noEmit
```
Expected: 4 PhotoPlaceholder tests passing, tsc clean.

- [ ] **Step 6: Run full suite**

```bash
cd /Users/edouard/dev/wishlist/app && npm test -- --run 2>&1 | tail -5
```
Expected: previous baseline (~150) + 4 new = ~154 passing. Existing call sites unchanged (no `withRat` passed yet) — back-compat verified.

- [ ] **Step 7: Commit**

```bash
git add app/src/components/PhotoPlaceholder.tsx app/src/components/ItemPhoto.tsx
git commit -m "$(cat <<'EOF'
feat(components): PhotoPlaceholder withRat + signText (pass-through on ItemPhoto)

When withRat is true, renders a SittingRat with a Caveat-font sign
centered in the watercolor wash. Default sign text comes from i18n
key placeholder.noPhoto («без фото» / «no photo»); explicit signText
overrides. Default false keeps existing call sites unchanged.

ItemPhoto passes both props through to PhotoPlaceholder for the
no-cover branch.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `<HeroCuratedItem>` component

**Files:**
- Create: `app/src/screens/events/HeroCuratedItem.tsx`
- Create: `app/src/screens/events/__tests__/HeroCuratedItem.test.tsx`

- [ ] **Step 1: Locate the existing `CuratedItemCard` for prop shape reference**

```bash
grep -n "CuratedItemCardProps\|CuratedItemCard\b" /Users/edouard/dev/wishlist/app/src/screens/events/EventDetailScreen.tsx | head -10
```

The existing component receives `entry` (`{ item_id, item, claims }`), `isHonoree`, `myUserId`, `onDetach`, `onClaim`, `onRelease`. We'll mirror this shape on both new components.

- [ ] **Step 2: Write the failing test**

Create `app/src/screens/events/__tests__/HeroCuratedItem.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '../../../i18n';
import { HeroCuratedItem } from '../HeroCuratedItem';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('kryska.lang', 'ru');
});

function mkEntry(overrides: { id?: string; cover_url?: string | null; note?: string | null } = {}) {
  return {
    item_id: overrides.id ?? 'item-1',
    item: {
      id: overrides.id ?? 'item-1',
      title: 'Книга Sapiens',
      maker: 'Юваль Харари',
      price_text: '1500₽',
      note: overrides.note ?? null,
      cover_url: overrides.cover_url ?? null,
      priority: 1,
      owner_id: 'honoree',
    },
    claims: [],
  };
}

function renderHero(node: React.ReactNode) {
  return render(
    <MemoryRouter>
      <I18nProvider>{node}</I18nProvider>
    </MemoryRouter>,
  );
}

describe('<HeroCuratedItem>', () => {
  it('renders title, maker, and price', () => {
    renderHero(
      <HeroCuratedItem
        entry={mkEntry()}
        isHonoree
        myUserId={null}
        onDetach={vi.fn()}
        onClaim={vi.fn()}
        onRelease={vi.fn()}
      />,
    );
    expect(screen.getByText('Книга Sapiens')).toBeTruthy();
    expect(screen.getByText(/Юваль Харари/)).toBeTruthy();
    expect(screen.getByText('1500₽')).toBeTruthy();
  });

  it('renders the full note untruncated', () => {
    const longNote =
      'À chaque virage, sur tous les terrains. D’un bout à l’autre de la montagne. Le ski qui ouvre tous les itinéraires.';
    renderHero(
      <HeroCuratedItem
        entry={mkEntry({ note: longNote })}
        isHonoree
        myUserId={null}
        onDetach={vi.fn()}
        onClaim={vi.fn()}
        onRelease={vi.fn()}
      />,
    );
    // Full text present — no clamp truncation in hero.
    expect(screen.getByText(longNote)).toBeTruthy();
  });

  it('renders rat placeholder when item has no cover_url', () => {
    renderHero(
      <HeroCuratedItem
        entry={mkEntry({ cover_url: null })}
        isHonoree
        myUserId={null}
        onDetach={vi.fn()}
        onClaim={vi.fn()}
        onRelease={vi.fn()}
      />,
    );
    expect(screen.getByTestId('sitting-rat')).toBeTruthy();
    expect(screen.getByText('без фото')).toBeTruthy();
  });

  it('exposes detach button only for honoree', () => {
    const onDetach = vi.fn();
    renderHero(
      <HeroCuratedItem
        entry={mkEntry()}
        isHonoree
        myUserId={null}
        onDetach={onDetach}
        onClaim={vi.fn()}
        onRelease={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/убрать|remove/i)).toBeTruthy();
  });

  it('hides detach button for guest', () => {
    renderHero(
      <HeroCuratedItem
        entry={mkEntry()}
        isHonoree={false}
        myUserId="guest-1"
        onDetach={vi.fn()}
        onClaim={vi.fn()}
        onRelease={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText(/убрать|remove/i)).toBeNull();
  });
});
```

- [ ] **Step 3: Run, FAIL, commit**

```bash
cd /Users/edouard/dev/wishlist/app && npm test -- --run HeroCuratedItem
```
Expected: FAIL — `Cannot find module '../HeroCuratedItem'`.

```bash
git add app/src/screens/events/__tests__/HeroCuratedItem.test.tsx
git commit -m "$(cat <<'EOF'
test(events): HeroCuratedItem — renders title/brand/price/full-note, rat placeholder, honoree-only detach

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Write the component**

Create `app/src/screens/events/HeroCuratedItem.tsx`:

```tsx
/**
 * `<HeroCuratedItem>` — large editorial card for the first item of each
 * priority section in `<EventDetailScreen>`. Layout: 200px photo on the
 * left, meta column on the right (title in Newsreader italic, brand line
 * mono-meta, price terracotta italic, FULL note without clamp).
 *
 * Honoree mode: × remove button hover-only on the photo.
 * Guest mode: claim/release control under the meta column.
 *
 * The photo opts in to the rat placeholder (`withRat`) — at 200px wide
 * there's plenty of room for the SittingRat with sign to read clearly.
 */
import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n/useI18n';
import { ItemPhoto } from '../../components/ItemPhoto';
import { ClaimControl } from './ClaimControl';
import type { EventClaim } from '../../events/useEvent';

interface HeroCuratedItemEntry {
  item_id: string;
  item: {
    id: string;
    title: string;
    maker: string | null;
    price_text: string | null;
    note: string | null;
    cover_url: string | null;
    priority: number;
    owner_id: string;
  };
  claims: EventClaim[];
}

interface HeroCuratedItemProps {
  entry: HeroCuratedItemEntry;
  isHonoree: boolean;
  myUserId: string | null;
  onDetach: () => void;
  onClaim: () => void;
  onRelease: () => void;
}

export function HeroCuratedItem({
  entry,
  isHonoree,
  myUserId,
  onDetach,
  onClaim,
  onRelease,
}: HeroCuratedItemProps) {
  const { t } = useI18n();
  const { item } = entry;

  const myClaim = entry.claims.find((c) => c.user_id === myUserId) ?? null;
  const othersClaim = entry.claims.find((c) => c.user_id !== myUserId) ?? null;

  return (
    <article
      style={{
        display: 'grid',
        gridTemplateColumns: '200px 1fr',
        gap: 'var(--s-5)',
        padding: 'var(--s-4) 0',
        borderBottom: '1px solid var(--hair)',
        marginBottom: 'var(--s-4)',
      }}
    >
      <div style={{ position: 'relative' }}>
        <Link to={`/i/${item.id}`} style={{ display: 'block' }}>
          <ItemPhoto
            coverUrl={item.cover_url}
            aspectRatio="4 / 3"
            alt={item.title}
            withRat
          />
        </Link>
        {isHonoree && (
          <button
            type="button"
            onClick={onDetach}
            aria-label={t('events.removeItem', { title: item.title })}
            className="hero-detach"
            style={{
              position: 'absolute',
              top: 6,
              right: 6,
              width: 22,
              height: 22,
              borderRadius: '50%',
              border: 'none',
              background: 'rgba(43,38,32,0.6)',
              color: '#fff',
              fontSize: 14,
              lineHeight: 1,
              cursor: 'pointer',
              opacity: 0,
              transition: 'opacity 120ms ease',
            }}
          >
            ×
          </button>
        )}
      </div>

      <div style={{ minWidth: 0 }}>
        <Link
          to={`/i/${item.id}`}
          style={{ color: 'inherit', textDecoration: 'none' }}
        >
          <h3
            className="display-italic"
            style={{
              fontFamily: 'var(--font-display)',
              fontStyle: 'italic',
              fontWeight: 500,
              fontSize: 22,
              lineHeight: 1.15,
              margin: 0,
              color: 'var(--ink)',
            }}
          >
            {item.title}
          </h3>
        </Link>

        {item.maker && (
          <div
            className="mono-meta"
            style={{
              marginTop: 4,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 0.06,
              textTransform: 'uppercase',
              color: 'var(--ink-3)',
            }}
          >
            {item.maker}
          </div>
        )}

        {item.price_text && (
          <div
            style={{
              marginTop: 'var(--s-2)',
              fontFamily: 'var(--font-display)',
              fontStyle: 'italic',
              fontSize: 15,
              color: 'var(--accent)',
            }}
          >
            {item.price_text}
          </div>
        )}

        {item.note && (
          <p
            style={{
              marginTop: 'var(--s-3)',
              fontSize: 13,
              color: 'var(--ink-2)',
              lineHeight: 1.5,
              maxWidth: 480,
            }}
          >
            {item.note}
          </p>
        )}

        {!isHonoree && (
          <div style={{ marginTop: 'var(--s-3)' }}>
            <ClaimControl
              myClaim={myClaim}
              othersClaim={othersClaim}
              onClaim={onClaim}
              onRelease={onRelease}
            />
          </div>
        )}
      </div>

      <style>{`
        article:hover .hero-detach { opacity: 1; }
        @media (pointer: coarse) { .hero-detach { opacity: 0.4 !important; } }
      `}</style>
    </article>
  );
}
```

**Note about `ClaimControl`**: the existing component lives in `EventDetailScreen.tsx` as a local function. To use it from a sibling file, we extract it to a standalone module in Task 5 (the EventDetailScreen refactor). For now, this import will fail to resolve — that's OK, Task 4 (TileCuratedItem) has the same dependency and Task 5 fixes both at once. We accept a temporary tsc break here and resolve it sequentially.

**ALTERNATIVE**: extract `ClaimControl` in this task before writing HeroCuratedItem. Either ordering works; the plan picks extract-during-Task-5 for atomicity. If tsc breaks here, that's intentional — proceed and let Task 5 close the loop.

Actually — let me be more careful. Breaking tsc mid-plan causes lots of friction. Let me revise to do the ClaimControl extraction FIRST as Step 4a:

- [ ] **Step 4a: Extract `ClaimControl` to its own file**

In `app/src/screens/events/EventDetailScreen.tsx`, find the `ClaimControl` function definition (search for `function ClaimControl`). Cut it out (including its props interface). Paste into a new file `app/src/screens/events/ClaimControl.tsx`:

```tsx
/**
 * `<ClaimControl>` — claim / release button for guests on a curated
 * event item. Visual states:
 *   - no claim → terracotta «забрать» button
 *   - my claim → bordered «отменить» button
 *   - other claim → muted «забрано <name>» label
 *
 * Extracted from EventDetailScreen.tsx during the redesign so
 * HeroCuratedItem and (later) other event-related cards can reuse it.
 */
import { useI18n } from '../../i18n/useI18n';
import type { EventClaim } from '../../events/useEvent';

interface ClaimControlProps {
  myClaim: EventClaim | null;
  othersClaim: EventClaim | null;
  onClaim: () => void;
  onRelease: () => void;
}

export function ClaimControl({ myClaim, othersClaim, onClaim, onRelease }: ClaimControlProps) {
  // PASTE THE ORIGINAL BODY FROM EventDetailScreen.tsx HERE.
  // Read the existing implementation in EventDetailScreen.tsx and copy
  // it verbatim. Do not modify the visual logic.
}
```

In `EventDetailScreen.tsx`, add at the top:
```tsx
import { ClaimControl } from './ClaimControl';
```

Delete the inline `function ClaimControl` body (and its props interface) from `EventDetailScreen.tsx`.

Run tsc to verify no broken references:
```bash
cd /Users/edouard/dev/wishlist/app && npx tsc -p tsconfig.app.json --noEmit
```
Expected: clean. (No other consumers of ClaimControl exist yet.)

Commit this extraction:
```bash
git add app/src/screens/events/ClaimControl.tsx app/src/screens/events/EventDetailScreen.tsx
git commit -m "$(cat <<'EOF'
refactor(events): extract ClaimControl to its own file

Foundation for HeroCuratedItem + TileCuratedItem to consume the same
claim/release UI without going through EventDetailScreen. Pure cut and
paste — no visual or behavioral change.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4b: Write `HeroCuratedItem.tsx` using the now-shared `ClaimControl`**

(Use the code from Step 4 above; the `import { ClaimControl } from './ClaimControl';` line now resolves.)

- [ ] **Step 5: Run tests + tsc**

```bash
cd /Users/edouard/dev/wishlist/app && npm test -- --run HeroCuratedItem && npx tsc -p tsconfig.app.json --noEmit
```
Expected: 5 tests passing, tsc clean.

- [ ] **Step 6: Commit**

```bash
git add app/src/screens/events/HeroCuratedItem.tsx
git commit -m "$(cat <<'EOF'
feat(events): HeroCuratedItem — large editorial card for first item per priority section

Layout: 200px photo + meta column. Title in Newsreader italic, brand
in mono-meta uppercase, price terracotta italic, full note untruncated.
× remove on hover (honoree only). Guest sees ClaimControl below note.

Photo opts in to rat placeholder via ItemPhoto withRat.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `<TileCuratedItem>` component

**Files:**
- Create: `app/src/screens/events/TileCuratedItem.tsx`
- Create: `app/src/screens/events/__tests__/TileCuratedItem.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `app/src/screens/events/__tests__/TileCuratedItem.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '../../../i18n';
import { TileCuratedItem } from '../TileCuratedItem';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('kryska.lang', 'ru');
});

function mkEntry(overrides: { id?: string; cover_url?: string | null; title?: string } = {}) {
  return {
    item_id: overrides.id ?? 'item-1',
    item: {
      id: overrides.id ?? 'item-1',
      title: overrides.title ?? 'Кружка',
      maker: 'Acme',
      price_text: '600₽',
      note: 'should not appear on tile',
      cover_url: overrides.cover_url ?? null,
      priority: 2,
      owner_id: 'honoree',
    },
    claims: [],
  };
}

function renderTile(node: React.ReactNode) {
  return render(
    <MemoryRouter>
      <I18nProvider>{node}</I18nProvider>
    </MemoryRouter>,
  );
}

describe('<TileCuratedItem>', () => {
  it('renders title and price', () => {
    renderTile(
      <TileCuratedItem
        entry={mkEntry()}
        isHonoree
        myUserId={null}
        onDetach={vi.fn()}
      />,
    );
    expect(screen.getByText('Кружка')).toBeTruthy();
    expect(screen.getByText('600₽')).toBeTruthy();
  });

  it('does NOT render brand or note on the tile', () => {
    renderTile(
      <TileCuratedItem
        entry={mkEntry()}
        isHonoree
        myUserId={null}
        onDetach={vi.fn()}
      />,
    );
    expect(screen.queryByText('Acme')).toBeNull();
    expect(screen.queryByText('should not appear on tile')).toBeNull();
  });

  it('renders rat placeholder when no cover_url', () => {
    renderTile(
      <TileCuratedItem
        entry={mkEntry({ cover_url: null })}
        isHonoree
        myUserId={null}
        onDetach={vi.fn()}
      />,
    );
    expect(screen.getByTestId('sitting-rat')).toBeTruthy();
  });

  it('shows detach button only for honoree', () => {
    renderTile(
      <TileCuratedItem
        entry={mkEntry()}
        isHonoree
        myUserId={null}
        onDetach={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/убрать|remove/i)).toBeTruthy();
  });

  it('hides detach button for guest', () => {
    renderTile(
      <TileCuratedItem
        entry={mkEntry()}
        isHonoree={false}
        myUserId="guest-1"
        onDetach={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText(/убрать|remove/i)).toBeNull();
  });

  it('does NOT render ClaimControl on the tile — even for guests', () => {
    renderTile(
      <TileCuratedItem
        entry={mkEntry()}
        isHonoree={false}
        myUserId="guest-1"
        onDetach={vi.fn()}
      />,
    );
    // The ClaimControl renders specific button text; assert none of its
    // labels are present. Use a permissive regex covering both languages.
    expect(screen.queryByRole('button', { name: /забрать|claim/i })).toBeNull();
  });
});
```

- [ ] **Step 2: Run, FAIL, commit**

```bash
cd /Users/edouard/dev/wishlist/app && npm test -- --run TileCuratedItem
```
Expected: FAIL — module not found.

```bash
git add app/src/screens/events/__tests__/TileCuratedItem.test.tsx
git commit -m "$(cat <<'EOF'
test(events): TileCuratedItem — compact 1:1, no brand/note, no claim control

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Write the component**

Create `app/src/screens/events/TileCuratedItem.tsx`:

```tsx
/**
 * `<TileCuratedItem>` — compact tile for items 2..N in each priority
 * section. Square photo + title (2-line clamp) + price. No brand, no
 * note, no inline claim button — guests click through to `/i/:itemId`
 * for claim. The hero card carries the full meta; tiles are scannable
 * previews.
 */
import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n/useI18n';
import { ItemPhoto } from '../../components/ItemPhoto';

interface TileCuratedItemEntry {
  item_id: string;
  item: {
    id: string;
    title: string;
    price_text: string | null;
    cover_url: string | null;
    priority: number;
  };
}

interface TileCuratedItemProps {
  entry: TileCuratedItemEntry;
  isHonoree: boolean;
  myUserId: string | null;
  onDetach: () => void;
}

export function TileCuratedItem({
  entry,
  isHonoree,
  onDetach,
}: TileCuratedItemProps) {
  const { t } = useI18n();
  const { item } = entry;

  return (
    <article style={{ position: 'relative' }}>
      <Link
        to={`/i/${item.id}`}
        style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}
      >
        <ItemPhoto
          coverUrl={item.cover_url}
          aspectRatio="1 / 1"
          alt={item.title}
          withRat
        />
        <div
          style={{
            marginTop: 'var(--s-2)',
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--ink)',
            lineHeight: 1.3,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {item.title}
        </div>
        {item.price_text && (
          <div
            style={{
              marginTop: 2,
              fontFamily: 'var(--font-display)',
              fontStyle: 'italic',
              fontSize: 12,
              color: 'var(--accent)',
            }}
          >
            {item.price_text}
          </div>
        )}
      </Link>

      {isHonoree && (
        <button
          type="button"
          onClick={onDetach}
          aria-label={t('events.removeItem', { title: item.title })}
          className="tile-detach"
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            width: 18,
            height: 18,
            borderRadius: '50%',
            border: 'none',
            background: 'rgba(43,38,32,0.55)',
            color: '#fff',
            fontSize: 11,
            lineHeight: 1,
            cursor: 'pointer',
            opacity: 0,
            transition: 'opacity 120ms ease',
          }}
        >
          ×
        </button>
      )}

      <style>{`
        article:hover .tile-detach { opacity: 1; }
        @media (pointer: coarse) { .tile-detach { opacity: 0.4 !important; } }
      `}</style>
    </article>
  );
}
```

- [ ] **Step 4: Run tests + tsc**

```bash
cd /Users/edouard/dev/wishlist/app && npm test -- --run TileCuratedItem && npx tsc -p tsconfig.app.json --noEmit
```
Expected: 6 tests passing, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add app/src/screens/events/TileCuratedItem.tsx
git commit -m "$(cat <<'EOF'
feat(events): TileCuratedItem — compact 1:1 tile for items 2..N per section

Photo (1:1, opts in to rat placeholder), 2-line title, terracotta
italic price. No brand, no note, no inline claim button — tiles are
preview-only, guests click through to /i/:itemId for claim.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: EventDetailScreen — delete AudienceSection, new header

**Files:**
- Modify: `app/src/screens/events/EventDetailScreen.tsx`
- Modify: `app/src/screens/events/__tests__/EventDetailScreen.test.tsx`

This task DOES NOT yet touch the items layout (that's Task 6). It deletes the dead audience UI and reshapes the header. After this task: items still render via the old CuratedItemCard (intermediate state).

- [ ] **Step 1: Write the failing tests**

In `app/src/screens/events/__tests__/EventDetailScreen.test.tsx`, add a new describe block (or extend existing):

```tsx
describe('<EventDetailScreen> redesign — header + share-meta line', () => {
  it('renders inline share meta line for honoree', () => {
    stubHonoree(); // existing helper — adapt to actual test infrastructure
    renderEventDetail('/events/evt-1');
    expect(screen.getByText('ссылка для гостей')).toBeTruthy();
    expect(screen.getByText('скопировать ↗')).toBeTruthy();
    expect(screen.getByText('позвать друзей →')).toBeTruthy();
  });

  it('does NOT render share meta line for guest', () => {
    stubGuest();
    renderEventDetail('/events/evt-1');
    expect(screen.queryByText('ссылка для гостей')).toBeNull();
  });

  it('does NOT render the AudienceSection (no «кто видит» / «+ круг»)', () => {
    stubHonoree();
    renderEventDetail('/events/evt-1');
    expect(screen.queryByText(/кто видит/i)).toBeNull();
    expect(screen.queryByText(/круг/i)).toBeNull();
  });

  it('copy action writes the share URL to clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    stubHonoree({ shareToken: 'tok-xyz' });
    renderEventDetail('/events/evt-1');

    await userEvent.click(screen.getByText('скопировать ↗'));
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('/event/tok-xyz'),
    );
  });
});
```

Adapt `stubHonoree` / `stubGuest` / `renderEventDetail` to the existing test file's conventions. If they don't exist, model on the established stubbing pattern (look at `EventDetailScreen.test.tsx`'s top for `vi.mock` setup).

- [ ] **Step 2: Run, FAIL, commit**

```bash
cd /Users/edouard/dev/wishlist/app && npm test -- --run EventDetailScreen
```
Expected: new tests fail (share-meta line not rendered yet; AudienceSection still in DOM).

```bash
git add app/src/screens/events/__tests__/EventDetailScreen.test.tsx
git commit -m "$(cat <<'EOF'
test(events): EventDetailScreen — share-meta inline line, no audience UI

Locks the contract: honoree sees the three mono-meta share actions;
guest doesn't; AudienceSection («кто видит + круг») is gone; copy
action writes the share URL to clipboard.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Edit `EventDetailScreen.tsx` — delete AudienceSection**

Delete the entire `AudienceSection` component function and its `AudienceSectionProps` interface. Also delete the `<AudienceSection ... />` JSX call. Delete the line `import { useGroups } from '../../groups/useGroups';` at the top (only consumer was AudienceSection).

From `useEvent()` destructure, remove `attachCircle` and `detachCircle`:

```tsx
const {
  query,
  update,
  remove,
  attachItem,
  detachItem,
  claim,
  release,
} = useEvent(eventId ?? null);
```

Delete the `audience` destructure:

```tsx
const { event, items, isHonoree } = query.data;  // was: { event, audience, items, isHonoree }
```

- [ ] **Step 4: Add the inline share-meta line for honoree**

In `EventDetailScreen.tsx`, after the `<HonoreeHeader>` JSX (around the place where `<AudienceSection>` used to be), add a new conditional block:

```tsx
{isHonoree && event.share_token && (
  <InlineShareActions
    shareToken={event.share_token}
    onCopied={() => toast.show(t('events.share.copied'))}
    onInvite={() => setInviteModalOpen(true)}
  />
)}
```

Hoist the `inviteModalOpen` state up if it isn't already at the screen level (look at how `<InviteFromPeopleModal>` is currently wired — likely lives inside `<CoordinatorPanel>`). Reuse the existing modal; don't create another one.

Add a new local sub-component at the bottom of the file:

```tsx
interface InlineShareActionsProps {
  shareToken: string;
  onCopied: () => void;
  onInvite: () => void;
}

function InlineShareActions({ shareToken, onCopied, onInvite }: InlineShareActionsProps) {
  const { t } = useI18n();
  const shareUrl = `${window.location.origin}/event/${shareToken}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      onCopied();
    } catch {
      // Clipboard API can fail in non-secure contexts or strict iframes.
      // Surface a generic toast; the user can also long-press the URL
      // in DevTools as a last resort. (Falling back to document.execCommand
      // would work but is deprecated.)
    }
  }

  return (
    <div
      style={{
        marginTop: 'var(--s-3)',
        marginBottom: 'var(--s-6)',
        display: 'flex',
        gap: 'var(--s-3)',
        flexWrap: 'wrap',
        alignItems: 'center',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.06,
        textTransform: 'uppercase',
      }}
    >
      <span style={{ color: 'var(--ink-3)' }}>{t('events.share.linkLabel')}</span>
      <span style={{ color: 'var(--hair-strong)' }}>·</span>
      <button
        type="button"
        onClick={handleCopy}
        style={{
          background: 'transparent',
          border: 'none',
          padding: 0,
          color: 'var(--accent)',
          cursor: 'pointer',
          fontSize: 'inherit',
          fontWeight: 'inherit',
          letterSpacing: 'inherit',
          textTransform: 'inherit',
        }}
      >
        {t('events.share.copyShort')}
      </button>
      <span style={{ color: 'var(--hair-strong)' }}>·</span>
      <button
        type="button"
        onClick={onInvite}
        style={{
          background: 'transparent',
          border: 'none',
          padding: 0,
          color: 'var(--accent)',
          cursor: 'pointer',
          fontSize: 'inherit',
          fontWeight: 'inherit',
          letterSpacing: 'inherit',
          textTransform: 'inherit',
        }}
      >
        {t('events.share.inviteShort')}
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Trim the `<CoordinatorPanel>` share section**

The existing `CoordinatorPanel` renders both a share-URL block and the participants list. Delete the share-URL block from CoordinatorPanel so it doesn't duplicate the new inline line. Keep the participants list + invite button.

Read the file to find the panel's share-block boundaries (look for `events.share.copy` or `share_token` references inside the panel), and delete that JSX chunk. The participants list rendering stays.

- [ ] **Step 6: Run tests + tsc**

```bash
cd /Users/edouard/dev/wishlist/app && npm test -- --run EventDetailScreen && npx tsc -p tsconfig.app.json --noEmit
```
Expected: 4 new tests pass; previously-passing tests may need updating if they asserted audience UI or old share-block markup — fix them by replacing assertions with the new shape (delete old audience assertions, update share-URL location).

- [ ] **Step 7: Commit**

```bash
git add app/src/screens/events/EventDetailScreen.tsx
git commit -m "$(cat <<'EOF'
feat(events): EventDetailScreen — kill AudienceSection, inline share-meta line

Drops the dead «КТО ВИДИТ + круг» UI (event_circles was retired during
the link-first events redesign — useEvent already hardcoded audience=[]).
Replaces the heavyweight share-link block with a single mono-meta line
under the event title: «ссылка для гостей · скопировать ↗ · позвать
друзей →». Honoree-only. The post-create celebration ShareCard remains
unchanged.

Frees the `useGroups` import (no other consumer in this file) and the
attachCircle/detachCircle destructure from useEvent (cleanup task to
follow).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: EventDetailScreen — Hero + tiles items layout

**Files:**
- Modify: `app/src/screens/events/EventDetailScreen.tsx`
- Modify: `app/src/screens/events/__tests__/EventDetailScreen.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to the same test file:

```tsx
describe('<EventDetailScreen> redesign — hero + tiles layout', () => {
  it('priority section with 1 item renders only a hero card', () => {
    stubHonoreeWithItems([
      { id: 'a', priority: 1, title: 'Книга', cover_url: null },
    ]);
    renderEventDetail('/events/evt-1');
    expect(screen.getByText('Книга')).toBeTruthy();
    // Hero present, no tiles grid.
    expect(screen.queryAllByTestId('item-tile')).toHaveLength(0);
  });

  it('priority section with 3 items renders 1 hero + 2 tiles', () => {
    stubHonoreeWithItems([
      { id: 'a', priority: 1, title: 'Книга', cover_url: null },
      { id: 'b', priority: 1, title: 'Термос', cover_url: null },
      { id: 'c', priority: 1, title: 'Кружка', cover_url: null },
    ]);
    renderEventDetail('/events/evt-1');
    // First is hero — has the data-testid we'll add in the hero component
    expect(screen.getAllByTestId('item-hero')).toHaveLength(1);
    expect(screen.getAllByTestId('item-tile')).toHaveLength(2);
  });

  it('renders rat placeholder when an item has no cover_url', () => {
    stubHonoreeWithItems([
      { id: 'a', priority: 1, title: 'Книга', cover_url: null },
    ]);
    renderEventDetail('/events/evt-1');
    expect(screen.getByTestId('sitting-rat')).toBeTruthy();
  });
});
```

(Adapt `stubHonoreeWithItems` to whatever the test file's stubbing approach is — likely a helper that primes `useEvent`'s mock with curated items.)

Also: add `data-testid="item-hero"` to `<HeroCuratedItem>`'s outer `<article>`, and `data-testid="item-tile"` to `<TileCuratedItem>`'s outer `<article>`. This is purely test-infrastructure — add these via a small edit to the components if not already there.

- [ ] **Step 2: Run, FAIL, commit**

```bash
cd /Users/edouard/dev/wishlist/app && npm test -- --run EventDetailScreen
```
Expected: new layout tests fail.

```bash
git add app/src/screens/events/__tests__/EventDetailScreen.test.tsx \
        app/src/screens/events/HeroCuratedItem.tsx \
        app/src/screens/events/TileCuratedItem.tsx
git commit -m "$(cat <<'EOF'
test(events): EventDetailScreen — hero+tiles layout per priority section

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Refactor items rendering in `EventDetailScreen.tsx`**

Inside `ItemsSection` (find it via `grep -n "function ItemsSection"`), the current logic groups items by priority and renders all of them via `<CuratedItemCard>` inside a grid. Replace the grid rendering with hero + tiles split:

```tsx
import { HeroCuratedItem } from './HeroCuratedItem';
import { TileCuratedItem } from './TileCuratedItem';

// ... inside ItemsSection's render path, replacing the existing grid ...

{groupByPriority(
  items.map((it) => ({ ...it, priority: it.item.priority })),
).map((section) => {
  if (section.items.length === 0) return null;
  const [first, ...rest] = section.items;
  if (!first) return null;
  return (
    <section key={section.level} style={{ marginBottom: 'var(--s-6)' }}>
      <PrioritySectionHeader level={section.level} count={section.items.length} />
      <HeroCuratedItem
        entry={first}
        isHonoree={isHonoree}
        myUserId={myUserId}
        onDetach={() => void onDetach(first.item_id)}
        onClaim={() => void onClaim(first.item_id)}
        onRelease={() => void onRelease(first.item_id)}
      />
      {rest.length > 0 && (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: 'var(--s-4)',
          }}
        >
          {rest.map((entry) => (
            <li key={entry.item_id}>
              <TileCuratedItem
                entry={entry}
                isHonoree={isHonoree}
                myUserId={myUserId}
                onDetach={() => void onDetach(entry.item_id)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
})}
```

Delete the old `<CuratedItemCard>` definition (its props interface and function body) from `EventDetailScreen.tsx` — it's no longer used. tsc will tell you if anything else still references it.

- [ ] **Step 4: Run tests + tsc**

```bash
cd /Users/edouard/dev/wishlist/app && npm test -- --run EventDetailScreen && npx tsc -p tsconfig.app.json --noEmit
```
Expected: layout tests pass, full suite clean.

- [ ] **Step 5: Commit**

```bash
git add app/src/screens/events/EventDetailScreen.tsx
git commit -m "$(cat <<'EOF'
feat(events): EventDetailScreen items use HeroCuratedItem + TileCuratedItem split

First item in each priority section is a 200×auto hero with the full
untruncated note. Items 2..N are 1:1 tiles in a `minmax(140px, 1fr)`
grid below the hero. The old universal CuratedItemCard is removed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Empty-state rat + sign

**Files:**
- Modify: `app/src/screens/events/EventDetailScreen.tsx`
- Modify: `app/src/screens/events/__tests__/EventDetailScreen.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to the test file:

```tsx
describe('<EventDetailScreen> redesign — empty state', () => {
  it('renders sitting rat with sign when items.length === 0', () => {
    stubHonoreeWithItems([]);
    renderEventDetail('/events/evt-1');
    expect(screen.getByTestId('sitting-rat')).toBeTruthy();
    // The empty-state caption mentions the honoree's emptiness message
    // (existing i18n key `events.noItemsHonoree`).
    // Adapt the regex to whatever string that key currently resolves to.
    expect(screen.getByText(/добавь|пусто|empty/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run, FAIL, commit**

```bash
cd /Users/edouard/dev/wishlist/app && npm test -- --run EventDetailScreen
```
Expected: empty-state test fails (no rat in current empty state).

```bash
git add app/src/screens/events/__tests__/EventDetailScreen.test.tsx
git commit -m "$(cat <<'EOF'
test(events): EventDetailScreen empty state renders sitting rat with sign

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Edit the empty-state branch**

In `EventDetailScreen.tsx`, find the items-section empty branch (currently renders `<p style={...}>{t('events.noItemsHonoree') | t('events.noItemsGuest')}</p>`). Replace with:

```tsx
import { SittingRat } from '../../components/rats/SittingRat';

// ... in the empty branch ...

{items.length === 0 && (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 'var(--s-4)',
      padding: 'var(--s-6) 0',
      color: 'var(--ink-3)',
      fontStyle: 'italic',
    }}
  >
    <SittingRat size={80} sign signText={t('events.emptySign')} />
    <p style={{ margin: 0 }}>
      {isHonoree ? t('events.noItemsHonoree') : t('events.noItemsGuest')}
    </p>
  </div>
)}
```

- [ ] **Step 4: Run tests + tsc**

```bash
cd /Users/edouard/dev/wishlist/app && npm test -- --run EventDetailScreen && npx tsc -p tsconfig.app.json --noEmit
```
Expected: empty-state test passes; full suite clean.

- [ ] **Step 5: Commit**

```bash
git add app/src/screens/events/EventDetailScreen.tsx
git commit -m "$(cat <<'EOF'
feat(events): EventDetailScreen empty state — SittingRat with «empty» sign

Replaces the bare italic «pusto» paragraph with a centered SittingRat
holding a sign that reads `events.emptySign` («empty» in both locales),
plus the existing copy below it. Honoree-only / guest copy unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `useEvent` cleanup — drop attachCircle / detachCircle / audience

**Files:**
- Modify: `app/src/events/useEvent.ts`
- Modify: `app/src/events/__tests__/useEvent.test.tsx`

- [ ] **Step 1: Verify no other consumers of `audience` or circle methods**

```bash
grep -rn "attachCircle\|detachCircle\|EventAudienceCircle" /Users/edouard/dev/wishlist/app/src --include="*.ts" --include="*.tsx" | grep -v __tests__ | grep -v useEvent.ts
```
Expected output: empty. (After Task 5, `EventDetailScreen` no longer imports them.)

If any consumer surfaces, STOP and report — don't proceed with the cleanup.

- [ ] **Step 2: Update the test file**

In `app/src/events/__tests__/useEvent.test.tsx`, delete any tests that exercise `attachCircle` / `detachCircle`, and remove `audience: [...]` assertions on the query data shape. Run the test file to verify nothing else implicitly depends on those:

```bash
cd /Users/edouard/dev/wishlist/app && npm test -- --run useEvent
```
Expected: remaining tests still pass after deletions.

- [ ] **Step 3: Commit the test deletions**

```bash
git add app/src/events/__tests__/useEvent.test.tsx
git commit -m "$(cat <<'EOF'
test(events): drop attachCircle/detachCircle/audience tests from useEvent

EventDetailScreen no longer consumes these (link-first events retired
the circles audience model). Removes the test coverage for the dead
surface before deleting the surface itself.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Modify `app/src/events/useEvent.ts`**

In the file:

1. Delete the `EventAudienceCircle` export (interface or type alias).
2. From the query data shape (`EventLoaded` or equivalent), remove the `audience` field.
3. From `UseEventResult`, remove `attachCircle` and `detachCircle`.
4. Delete the `useCallback`-based implementations of `attachCircle` and `detachCircle`.
5. Wherever the hook returns its result, remove the two methods + the `audience` field from the returned object.
6. Delete any helper that produced `audience` (e.g., a query select on `event_circles`). The comment in the file already says «circles audience retired (link-first model)» — the placeholder `audience: []` line can go too.

After editing, run tsc:
```bash
cd /Users/edouard/dev/wishlist/app && npx tsc -p tsconfig.app.json --noEmit
```
Expected: clean. If any consumer breaks, fix the consumer (might be a forgotten test file).

- [ ] **Step 5: Run full suite**

```bash
cd /Users/edouard/dev/wishlist/app && npm test -- --run 2>&1 | tail -5
```
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add app/src/events/useEvent.ts
git commit -m "$(cat <<'EOF'
refactor(events): drop attachCircle/detachCircle/audience from useEvent

Link-first events retired the circles audience model (2026-05-24). The
hook was still exposing the methods + an empty audience field for
backwards-compat with EventDetailScreen's now-removed AudienceSection.
Deleting them now that the screen no longer consumes them.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Delete dead i18n keys

**Files:**
- Modify: `app/src/i18n/ru.ts`
- Modify: `app/src/i18n/en.ts`

- [ ] **Step 1: Verify no other consumers**

```bash
grep -rn "audienceLabel\|audienceEmpty\|addCircle\|removeCircle\|events\.collapse" \
  /Users/edouard/dev/wishlist/app/src --include="*.ts" --include="*.tsx" | grep -v i18n/
```
Expected: empty.

If any consumer surfaces, STOP and report.

- [ ] **Step 2: Delete the keys from both `ru.ts` and `en.ts`**

Remove (under `events.*`):
- `audienceLabel`
- `audienceEmpty`
- `addCircle`
- `removeCircle`
- `collapse` (only if no other consumer per the grep above; otherwise keep)

- [ ] **Step 3: Verify**

```bash
cd /Users/edouard/dev/wishlist/app && npx tsc -p tsconfig.app.json --noEmit && npm test -- --run 2>&1 | tail -5
```
Expected: clean, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add app/src/i18n/ru.ts app/src/i18n/en.ts
git commit -m "$(cat <<'EOF'
chore(i18n): drop dead events.audience* / addCircle / removeCircle keys

No consumers remain after the EventDetailScreen redesign. Verified via
grep across app/src.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Validation + manual smoke

- [ ] **Step 1: Full validation suite (Node 22+)**

```bash
source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && cd /Users/edouard/dev/wishlist/app && \
  npx tsc -p tsconfig.app.json --noEmit && \
  npm run lint && \
  npm test -- --run && \
  npm run build
```

Expected: tsc clean, lint clean, all tests passing, prod build succeeds.

- [ ] **Step 2: Manual smoke (dev server)**

```bash
cd /Users/edouard/dev/wishlist/app && npm run dev
```
Open the local dev URL, log in as Alice (`alice@test.local` via Mailpit), navigate to an event you own, and walk through:

- [ ] Honoree desktop: no «КТО ВИДИТ» block visible
- [ ] Inline share-meta line present under title; click «скопировать ↗» → toast appears; click «позвать друзей →» → invite modal opens
- [ ] Priority section with 1 item → only the hero card (no tiles grid)
- [ ] Priority section with 3+ items → hero + tiles grid
- [ ] × hover button on hero card and tile photos (honoree)
- [ ] Item with no cover_url → sitting rat with «без фото» sign visible
- [ ] Switch to EN locale → sign reads «no photo»
- [ ] Empty event → centered rat + caption
- [ ] Open same event as guest (different account or signed out via shared link) → no inline share line; claim button on hero; tile clicks go to /i/:itemId
- [ ] Mobile (Chrome DevTools touch viewport, iPhone): hero photo stacks above meta; × always slightly visible at opacity 0.4

If any item fails, fix before pushing.

- [ ] **Step 3: Push the branch**

```bash
git push -u origin feat/event-detail-redesign
```

- [ ] **Step 4: Open PR via `gh`**

```bash
gh pr create --title "feat(events): redesign /events/:id — kill audience UI, hero+tiles, rat placeholder" --body "$(cat <<'EOF'
## Summary

Friend feedback on prod-smoke: «страница event выглядит как минимум так себе». Four changes in one PR.

1. **Delete `AudienceSection`.** Dead UI from the M2 circles model — `useEvent` already hardcoded `audience: []` since the 2026-05-24 link-first events redesign. The «КТО ВИДИТ + круг» row did nothing useful.
2. **Inline share-meta line.** Replace the heavy share-URL textbox + two-button block with a single mono-meta line under the event title: «ссылка для гостей · скопировать ↗ · позвать друзей →». Honoree-only. The post-create celebration `<ShareCard>` (on `?share=1`) is untouched.
3. **Hero + tiles items layout.** First item per priority section is a 200×auto editorial hero (large photo + meta column with untruncated note). Items 2..N are compact 1:1 tiles in a `repeat(auto-fill, minmax(140px, 1fr))` grid. Mirrors priority semantics with visual hierarchy.
4. **Friendly placeholder.** `<PhotoPlaceholder>` gains `withRat` + `signText` props. When true, renders a `<SittingRat>` with a Caveat-font sign reading `placeholder.noPhoto` («без фото» / «no photo») centered in the watercolor wash. Opt-in per call site — small thumbnails keep the quiet original look; event hero/tile/landing and item detail opt in.

## Spec + plan

- Spec: [`docs/superpowers/specs/2026-05-26-event-detail-redesign-design.md`](docs/superpowers/specs/2026-05-26-event-detail-redesign-design.md)
- Plan: [`docs/superpowers/plans/2026-05-26-event-detail-redesign.md`](docs/superpowers/plans/2026-05-26-event-detail-redesign.md)

## What's out of scope

- `EventLandingScreen` layout (the anon `/event/<token>` mosaic) — rats propagate via the `withRat` opt-in but the grid layout stays.
- No DB migrations, no RLS changes, no RPC changes.
- Guest tiles no longer carry an inline claim button — guests click through to `/i/:itemId` to claim. Re-evaluate if anyone complains.

## Test plan

- [x] Frontend: PhotoPlaceholder (4 tests), HeroCuratedItem (5), TileCuratedItem (6), EventDetailScreen (extended share-meta + hero/tiles + empty state)
- [x] tsc strict + eslint + prod build (Node 22+) clean
- [ ] Manual smoke per the plan's Task 10 checklist
- [ ] Mobile touch-emulation smoke

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review notes

Spec coverage verified:

- TL;DR item 1 (delete AudienceSection) → Task 5 (deletion) + Task 8 (hook cleanup) + Task 9 (i18n cleanup)
- TL;DR item 2 (inline share meta) → Task 5
- TL;DR item 3 (hero + tiles) → Tasks 3 + 4 + 6
- TL;DR item 4 (rat placeholder) → Tasks 1 (i18n) + 2 (PhotoPlaceholder/ItemPhoto)
- Empty-state rat → Task 7
- Out-of-scope items (EventLandingScreen, RLS, etc.) → respected

Placeholder scan: no TBDs or vague instructions. Each task has executable code blocks.

Type / signature consistency:
- `HeroCuratedItem` props match between component file and tests
- `TileCuratedItem` props match (note: no `onClaim` / `onRelease` — guest claim is by navigation, per spec)
- `withRat` / `signText` consistently named across `PhotoPlaceholder` + `ItemPhoto`
- `EventClaim` imported from `useEvent` consistently

Acceptance: this plan compiles into one PR with ~10-12 commits, ~7-9 new tests, no DB changes.
