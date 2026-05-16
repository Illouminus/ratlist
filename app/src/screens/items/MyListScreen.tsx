/**
 * `MyListScreen` — the user's own wishlist. The main screen of the app
 * once you're signed in and onboarded.
 *
 * Composition:
 *   TopBar
 *   ├── nav: link to /groups (which we leave in the right-hand cluster)
 *   header eyebrow + title + accent annotation
 *   actions row: filters + "+ add" button
 *   items grid / list / empty state
 *   AddItemDrawer (mounted, slides in when open)
 *
 * State that lives here (not in a hook):
 *   - open/close of the add drawer
 *   - selected view mode (grid vs list)
 *   - selected occasion filter
 *
 * The items + groups themselves come from hooks (`useMyItems`, `useGroups`).
 */
import { useMemo, useState } from 'react';
import { useI18n } from '../../i18n/useI18n';
import { useProfile } from '../../auth/useProfile';
import { useMyItems } from '../../items/useMyItems';
import { useGroups } from '../../groups/useGroups';
import type { Occasion } from '../../lib/db';
import { PaperLayout } from '../../components/PaperLayout';
import { TopBar } from '../../components/TopBar';
import { TopBarNav } from '../../components/TopBarNav';
import { Button } from '../../components/Button';
import { ItemGrid } from './ItemGrid';
import { ItemList } from './ItemList';
import { ItemFilters, type ViewMode } from './ItemFilters';
import { ItemDrawer, type ItemDrawerMode } from './ItemDrawer';
import type { CreateItemInput, MyItem } from '../../items/useMyItems';

export function MyListScreen() {
  const { t } = useI18n();
  const { query: profileQ } = useProfile();
  const { query: itemsQ, createItem, updateItem, deleteItem } = useMyItems();
  const { query: groupsQ } = useGroups();

  const [view, setView] = useState<ViewMode>('grid');
  const [occasion, setOccasion] = useState<Occasion | null>(null);
  /** Single piece of state covers add / edit / closed — exhaustive in TS. */
  const [drawer, setDrawer] = useState<ItemDrawerMode>({ kind: 'closed' });

  // Derive filtered list in a single memo so the dependency is the stable
  // `itemsQ` reference, not a freshly-constructed `[]` per render.
  const filteredItems = useMemo(() => {
    const items = itemsQ.status === 'ready' ? itemsQ.items : [];
    return occasion ? items.filter((i) => i.occasion === occasion) : items;
  }, [itemsQ, occasion]);

  const totalCount = itemsQ.status === 'ready' ? itemsQ.items.length : 0;

  // `RequireAuth` guarantees the profile is ready by the time we render.
  // Called *after* the hooks above so we never short-circuit them.
  if (profileQ.status !== 'ready') return null;

  const handleSubmit = (input: CreateItemInput) => {
    if (drawer.kind === 'edit') {
      return updateItem(drawer.item.id, input);
    }
    return createItem(input);
  };

  const handleEdit = (item: MyItem) => setDrawer({ kind: 'edit', item });
  const handleOpenCreate = () => setDrawer({ kind: 'create' });
  const handleCloseDrawer = () => setDrawer({ kind: 'closed' });

  return (
    <PaperLayout>
      <TopBar nav={<TopBarNav />} />

      <Header />

      <ActionsRow
        countShown={filteredItems.length}
        countTotal={totalCount}
        occasion={occasion}
        onOccasion={setOccasion}
        view={view}
        onView={setView}
        onAdd={handleOpenCreate}
      />

      {itemsQ.status === 'loading' && (
        <div className="mono-meta" style={{ color: 'var(--ink-3)' }}>
          …
        </div>
      )}

      {itemsQ.status === 'error' && (
        <p style={{ color: 'var(--accent-deep)' }}>{itemsQ.error}</p>
      )}

      {itemsQ.status === 'ready' && totalCount === 0 && (
        <EmptyState onAdd={handleOpenCreate} />
      )}

      {itemsQ.status === 'ready' && totalCount > 0 && (
        <>
          {view === 'grid' ? (
            <ItemGrid
              items={filteredItems}
              onEdit={handleEdit}
              onDelete={(id) => void deleteItem(id)}
            />
          ) : (
            <ItemList
              items={filteredItems}
              onEdit={handleEdit}
              onDelete={(id) => void deleteItem(id)}
            />
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
        </>
      )}

      <ItemDrawer
        mode={drawer}
        onClose={handleCloseDrawer}
        groups={groupsQ.status === 'ready' ? groupsQ.groups : []}
        onSubmit={handleSubmit}
      />
    </PaperLayout>
  );
}

// ─────────────────────────── header ───────────────────────────

function Header() {
  const { t } = useI18n();
  const now = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  return (
    <div style={{ marginBottom: 'var(--s-5)' }}>
      <div className="mono-meta" style={{ marginBottom: 'var(--s-3)' }}>
        {t('list.currentlySaved')} · {now}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--s-4)', flexWrap: 'wrap' }}>
        <h2
          className="display-italic"
          style={{
            fontSize: 48,
            margin: 0,
            lineHeight: 1.05,
            letterSpacing: -1.5,
          }}
        >
          {t('list.headlineMine')}
        </h2>
        <div
          className="marginalia"
          style={{
            fontSize: 22,
            color: 'var(--accent)',
            transform: 'rotate(-2deg)',
            marginBottom: 8,
          }}
        >
          {t('list.annotation')}
        </div>
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
  onAdd: () => void;
}

function ActionsRow({
  countShown,
  countTotal,
  occasion,
  onOccasion,
  view,
  onView,
  onAdd,
}: ActionsRowProps) {
  const { t } = useI18n();
  return (
    <>
      <hr style={{ border: 0, borderTop: '1px solid var(--hair)', margin: '0 0 var(--s-5)' }} />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--s-5)',
          marginBottom: 'var(--s-5)',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: 300 }}>
          <ItemFilters
            countShown={countShown}
            countTotal={countTotal}
            occasionFilter={occasion}
            onOccasionFilter={onOccasion}
            view={view}
            onView={onView}
          />
        </div>
        <Button variant="primary" onClick={onAdd}>
          {t('list.addItem')}
        </Button>
      </div>
    </>
  );
}

// ─────────────────────────── empty state ───────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  const { t } = useI18n();
  return (
    <section
      style={{
        padding: 'var(--s-7) 0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 'var(--s-5)',
      }}
    >
      <div
        className="display-italic"
        style={{
          fontSize: 28,
          color: 'var(--ink)',
          lineHeight: 1.2,
          maxWidth: 480,
        }}
      >
        {t('empty.title')}
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontStyle: 'normal',
            fontWeight: 400,
            fontSize: 14,
            color: 'var(--ink-2)',
            marginTop: 'var(--s-4)',
            lineHeight: 1.55,
          }}
        >
          {t('empty.body')}
        </div>
      </div>
      <Button variant="dark" onClick={onAdd}>
        {t('list.addFirst')}
      </Button>
    </section>
  );
}
