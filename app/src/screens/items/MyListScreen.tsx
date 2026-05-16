/**
 * `MyListScreen` — the user's own wishlist. The main screen of the app
 * once you're signed in and onboarded.
 *
 * Composition (top to bottom):
 *   PageHeader — eyebrow + italic title + Caveat annotation + corner rat
 *   ActionsRow — count, occasion chips, view toggle, "+ add" button
 *   items grid / list / empty state
 *   end-of-list marker ("that's the lot — for now")
 *
 * "Add" navigates to `/add` (a full-screen form). The mobile FAB and
 * the empty-state CTA both go through that single entry point, so
 * there's no drawer state to manage here.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../../i18n/useI18n';
import { useProfile } from '../../auth/useProfile';
import { useMyItems } from '../../items/useMyItems';
import { useIsMobile } from '../../lib/useMediaQuery';
import type { Occasion } from '../../lib/db';
import { PaperLayout } from '../../components/PaperLayout';
import { Button } from '../../components/Button';
import { EndOfList } from '../../components/EndOfList';
import { ItemGrid } from './ItemGrid';
import { ItemList } from './ItemList';
import { ItemFilters, type ViewMode } from './ItemFilters';
import { SittingRat } from '../../components/rats';

export function MyListScreen() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { query: profileQ } = useProfile();
  const { query: itemsQ } = useMyItems();

  const isMobile = useIsMobile();
  const [view, setView] = useState<ViewMode>('grid');
  // On mobile the toggle is hidden and we always render the compact
  // list — the wide grid cards don't fit. Desktop users can still pick.
  const effectiveView: ViewMode = isMobile ? 'list' : view;
  const [occasion, setOccasion] = useState<Occasion | null>(null);

  const filteredItems = useMemo(() => {
    const items = itemsQ.status === 'ready' ? itemsQ.items : [];
    return occasion ? items.filter((i) => i.occasion === occasion) : items;
  }, [itemsQ, occasion]);

  const totalCount = itemsQ.status === 'ready' ? itemsQ.items.length : 0;

  // `RequireAuth` guarantees the profile is ready by the time we render.
  if (profileQ.status !== 'ready') return null;

  const goAdd = () => navigate('/add');

  // The page header + filters only make sense when there's a list to
  // describe. On the very first run we hand the page over to EmptyState,
  // which carries its own "nothing yet." headline.
  const showList = itemsQ.status === 'ready' && totalCount > 0;

  return (
    <PaperLayout>
      {showList && (
        <>
          <Header onAdd={goAdd} />
          <ActionsRow
            countShown={filteredItems.length}
            countTotal={totalCount}
            occasion={occasion}
            onOccasion={setOccasion}
            view={view}
            onView={setView}
          />
        </>
      )}

      {itemsQ.status === 'loading' && (
        <div className="mono-meta" style={{ color: 'var(--ink-3)' }}>
          …
        </div>
      )}

      {itemsQ.status === 'error' && (
        <p style={{ color: 'var(--accent-deep)' }}>{itemsQ.error}</p>
      )}

      {itemsQ.status === 'ready' && totalCount === 0 && <EmptyState onAdd={goAdd} />}

      {showList && (
        <>
          {effectiveView === 'grid' ? (
            <ItemGrid items={filteredItems} />
          ) : (
            <ItemList items={filteredItems} />
          )}
          {filteredItems.length === 0 && (
            <p
              style={{
                color: 'var(--ink-3)',
                marginTop: 'var(--s-5)',
                fontStyle: 'italic',
              }}
            >
              {t('list.noneForFilter')}
            </p>
          )}
          {filteredItems.length > 0 && <EndOfList />}
        </>
      )}
    </PaperLayout>
  );
}

// ─────────────────────────── header ───────────────────────────

/**
 * Page header: eyebrow + italic title + Caveat annotation, with a
 * desktop-only "+ добавить" button anchored to the right of the title.
 * Mobile gets the FAB in BottomTabBar instead — keeps the eyebrow row
 * uncluttered on small viewports.
 */
function Header({ onAdd }: { onAdd: () => void }) {
  const { t } = useI18n();
  const now = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  return (
    <div style={{ position: 'relative', marginBottom: 'var(--s-5)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 'var(--s-4)',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="mono-meta" style={{ marginBottom: 'var(--s-2)' }}>
            {t('list.currentlySaved')} · {now}
          </div>
          <h2
            className="display-italic"
            style={{
              fontSize: 'var(--display-l)',
              margin: 0,
              lineHeight: 1.02,
              letterSpacing: -1.2,
              whiteSpace: 'pre-line',
              /* Leave room on mobile for the corner rat. On desktop the
                 add-button takes that slot so the rat is also tucked
                 next to it via the absolute-positioned wrapper below. */
              paddingRight: 56,
            }}
          >
            {t('list.headlineMine')}
          </h2>
          <div
            className="marginalia"
            style={{
              fontSize: 18,
              color: 'var(--accent)',
              marginTop: 'var(--s-2)',
              transform: 'rotate(-1.5deg)',
              display: 'inline-block',
            }}
          >
            {t('list.annotation')}
          </div>
        </div>

        {/* Desktop: add button sits next to the title, above the hairline
            that separates header from filters. Hidden on mobile where the
            FAB in BottomTabBar covers the same intent. */}
        <Button
          variant="primary"
          onClick={onAdd}
          className="hide-on-mobile"
          style={{ marginTop: 'var(--s-3)' }}
        >
          {t('list.addItem')}
        </Button>
      </div>

      {/* Small rat tucked top-right corner — mobile only, since on
          desktop the add button occupies that slot. */}
      <div
        aria-hidden
        className="hide-on-desktop"
        style={{
          position: 'absolute',
          top: 8,
          right: 0,
          opacity: 0.7,
          pointerEvents: 'none',
        }}
      >
        <SittingRat size={40} />
      </div>
    </div>
  );
}

// ─────────────────────────── actions row ───────────────────────────

interface ActionsRowProps {
  countShown: number;
  countTotal: number;
  occasion: Occasion | null;
  onOccasion: (next: Occasion | null) => void;
  view: ViewMode;
  onView: (next: ViewMode) => void;
}

/** Filters + view toggle, sitting under the page-level hairline. The
 *  add button used to live here too but moved up into the Header so
 *  it sits above the rule, matching the design v2 mockup. */
function ActionsRow({ countShown, countTotal, occasion, onOccasion, view, onView }: ActionsRowProps) {
  return (
    <>
      <hr style={{ border: 0, borderTop: '1px solid var(--hair)', margin: '0 0 var(--s-4)' }} />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--s-4)',
          marginBottom: 'var(--s-5)',
        }}
      >
        <ItemFilters
          countShown={countShown}
          countTotal={countTotal}
          occasionFilter={occasion}
          onOccasionFilter={onOccasion}
          view={view}
          onView={onView}
        />
      </div>
    </>
  );
}

// ─────────────────────────── empty state ───────────────────────────

/**
 * Empty state — first run, before the user has added any items. Mirrors
 * the "06 · Empty state" mockup: big italic "nothing yet." headline,
 * Caveat "a quiet beginning." sub, a single question-prompt that nudges
 * the user toward their first item, then rat + CTA + "or paste a link"
 * marginalia at the bottom.
 *
 * Lives inside MyListScreen so it can share the same PaperLayout column.
 * The (non-empty) Header is suppressed when this renders — see the
 * caller above.
 */
function EmptyState({ onAdd }: { onAdd: () => void }) {
  const { t } = useI18n();
  return (
    <section
      style={{
        position: 'relative',
        paddingTop: 'var(--s-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--s-5)',
      }}
    >
      <div>
        <h2
          className="display-italic"
          style={{
            margin: 0,
            fontSize: 'var(--display-l)',
            lineHeight: 1.02,
            letterSpacing: -1.2,
            whiteSpace: 'pre-line',
          }}
        >
          {t('empty.headline')}
        </h2>
        <p
          className="marginalia"
          style={{
            margin: 'var(--s-2) 0 0',
            fontSize: 18,
            color: 'var(--accent)',
            transform: 'rotate(-1.5deg)',
            display: 'inline-block',
          }}
        >
          {t('empty.annotation')}
        </p>
      </div>

      <hr style={{ border: 0, borderTop: '1px solid var(--hair)', margin: 0 }} />

      <p
        className="display-italic"
        style={{
          fontSize: 'var(--display-s)',
          color: 'var(--ink)',
          lineHeight: 1.4,
          margin: 0,
          maxWidth: 520,
        }}
      >
        {t('empty.title')}
      </p>
      <p
        style={{
          fontSize: 13,
          color: 'var(--ink-2)',
          lineHeight: 1.55,
          margin: 0,
          maxWidth: 520,
        }}
      >
        {t('empty.body')}
      </p>

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--s-4)' }}>
        <SittingRat size={120} sign signText={t('empty.sign')} />
      </div>

      <Button variant="dark" onClick={onAdd} style={{ width: '100%' }}>
        {t('list.addFirst')}
      </Button>
      <p
        className="marginalia"
        style={{
          fontSize: 14,
          color: 'var(--ink-3)',
          textAlign: 'center',
          margin: 0,
        }}
      >
        {t('empty.orPasteLink')}
      </p>
    </section>
  );
}
