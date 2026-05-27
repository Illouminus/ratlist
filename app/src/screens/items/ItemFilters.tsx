/**
 * `<ItemFilters>` — count + occasion chips + grid/list view toggle.
 * Sits between the screen header and the actual items.
 */
import { useI18n } from '../../i18n/useI18n';
import { OCCASIONS, type Occasion } from '../../lib/db';
import { ViewToggle } from '../../components/ViewToggle';
import type { ViewMode } from '../../lib/useViewMode';

export type { ViewMode };

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

      <ViewToggle view={view} onView={onView} />
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

