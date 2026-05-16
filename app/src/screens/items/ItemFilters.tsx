/**
 * `<ItemFilters>` — count + occasion chips + grid/list view toggle.
 * Sits between the screen header and the actual items.
 */
import { useI18n } from '../../i18n/useI18n';
import { OCCASIONS, type Occasion } from '../../lib/db';

export type ViewMode = 'grid' | 'list';

interface ItemFiltersProps {
  countShown: number;
  countTotal: number;
  occasionFilter: Occasion | null;
  onOccasionFilter: (next: Occasion | null) => void;
  view: ViewMode;
  onView: (next: ViewMode) => void;
}

export function ItemFilters({
  countShown,
  countTotal,
  occasionFilter,
  onOccasionFilter,
  view,
  onView,
}: ItemFiltersProps) {
  const { t } = useI18n();

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--s-4)',
        marginBottom: 'var(--s-6)',
        flexWrap: 'wrap',
      }}
    >
      {/* left: count + occasion chips */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--s-5)',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>
          <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{countShown}</span>
          <span style={{ color: 'var(--ink-3)' }}> / {countTotal}</span>
        </div>

        <div style={{ width: 1, height: 14, background: 'var(--hair)' }} />

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--s-3)',
            flexWrap: 'wrap',
          }}
        >
          <div className="mono-meta" style={{ fontSize: 10 }}>
            {t('nav.filterBy')}
          </div>
          <FilterChip
            label={t('list.allOccasions')}
            active={occasionFilter === null}
            onClick={() => onOccasionFilter(null)}
          />
          {OCCASIONS.map((occ) => (
            <FilterChip
              key={occ}
              label={t(`occasion.${occ}`)}
              active={occasionFilter === occ}
              onClick={() => onOccasionFilter(occasionFilter === occ ? null : occ)}
            />
          ))}
        </div>
      </div>

      {/* right: view toggle — desktop only. On mobile we always render
          the compact list (the grid cards don't fit), so the choice is
          meaningless and we hide it to reduce noise. */}
      <div className="hide-on-mobile" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <ViewToggleButton
          active={view === 'grid'}
          onClick={() => onView('grid')}
          aria-label="grid view"
        >
          <svg width="14" height="14" viewBox="0 0 14 14">
            <rect x="1" y="1" width="5" height="5" stroke="currentColor" fill="none" />
            <rect x="8" y="1" width="5" height="5" stroke="currentColor" fill="none" />
            <rect x="1" y="8" width="5" height="5" stroke="currentColor" fill="none" />
            <rect x="8" y="8" width="5" height="5" stroke="currentColor" fill="none" />
          </svg>
        </ViewToggleButton>
        <ViewToggleButton
          active={view === 'list'}
          onClick={() => onView('list')}
          aria-label="list view"
        >
          <svg width="14" height="14" viewBox="0 0 14 14">
            <path d="M1 3h12M1 7h12M1 11h12" stroke="currentColor" fill="none" />
          </svg>
        </ViewToggleButton>
      </div>
    </div>
  );
}

// ─────────────────────────── atoms ───────────────────────────

interface FilterChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function FilterChip({ label, active, onClick }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        fontFamily: 'var(--font-body)',
        fontSize: 12,
        fontWeight: active ? 600 : 400,
        color: active ? 'var(--ink)' : 'var(--ink-2)',
        borderBottom: `1.5px solid ${active ? 'var(--ink)' : 'transparent'}`,
        paddingBottom: 2,
      }}
    >
      {label}
    </button>
  );
}

interface ViewToggleButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  'aria-label': string;
}

function ViewToggleButton({ active, onClick, children, ...rest }: ViewToggleButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={rest['aria-label']}
      style={{
        background: active ? 'var(--paper-edge)' : 'transparent',
        border: `1px solid ${active ? 'var(--hair-strong)' : 'transparent'}`,
        cursor: 'pointer',
        padding: '5px 7px',
        borderRadius: 'var(--r-1)',
        color: active ? 'var(--ink)' : 'var(--ink-3)',
        lineHeight: 0,
      }}
    >
      {children}
    </button>
  );
}
