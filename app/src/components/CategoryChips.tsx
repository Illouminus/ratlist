/**
 * `<CategoryChips>` — horizontal "all · cat (n) · cat (n) · uncategorised (n)"
 * filter row. Mirrors the existing occasion-chip pattern (underline + bold
 * for the active option, light ink for the rest).
 *
 * Counts are computed client-side from the `items` prop. Distinct
 * categories are sorted alphabetically via `localeCompare`; the
 * "Uncategorised" chip (matching null-category rows) goes last when
 * present. The "All" chip resets the filter (`active === 'all'`).
 */
import { useMemo } from 'react';
import { useI18n } from '../i18n/useI18n';

export interface CategoryChipsProps {
  items: Array<{ category: string | null }>;
  /** `'all'` = no filter; `null` = uncategorised-only; string = that category. */
  active: string | null | 'all';
  onChange: (next: string | null | 'all') => void;
}

export function CategoryChips({ items, active, onChange }: CategoryChipsProps) {
  const { t } = useI18n();

  const { categories, uncategorisedCount } = useMemo(() => {
    const counts = new Map<string, number>();
    let nullCount = 0;
    for (const it of items) {
      if (it.category === null || it.category === '') {
        nullCount += 1;
      } else {
        counts.set(it.category, (counts.get(it.category) ?? 0) + 1);
      }
    }
    const cats = Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { categories: cats, uncategorisedCount: nullCount };
  }, [items]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--s-3)',
        flexWrap: 'wrap',
      }}
    >
      <Chip
        label={t('categories.chipAll')}
        active={active === 'all'}
        onClick={() => onChange('all')}
      />
      {categories.map((c) => (
        <Chip
          key={c.name}
          label={`${c.name} (${c.count})`}
          active={active === c.name}
          onClick={() => onChange(c.name)}
        />
      ))}
      {uncategorisedCount > 0 && (
        <Chip
          label={`${t('categories.chipUncategorised')} (${uncategorisedCount})`}
          active={active === null}
          onClick={() => onChange(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────── atoms ───────────────────────────

interface ChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function Chip({ label, active, onClick }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        paddingBottom: 2,
        fontFamily: 'var(--font-body)',
        fontSize: 12,
        fontWeight: active ? 600 : 400,
        color: active ? 'var(--ink)' : 'var(--ink-2)',
        borderBottom: `1.5px solid ${active ? 'var(--ink)' : 'transparent'}`,
      }}
    >
      {label}
    </button>
  );
}
