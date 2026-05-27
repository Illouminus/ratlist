/**
 * `<SortSelector>` — three text-style buttons for switching between
 * priority / price / category sort. Mirrors the editorial filter-chip
 * pattern (underline + bold for the active option, light ink for the
 * rest). Shared by MyList, FriendList, PublicList.
 */
import { useI18n } from '../i18n/useI18n';
import type { SortMode } from '../lib/useSortMode';

const MODES: ReadonlyArray<SortMode> = ['priority', 'price', 'category'];

interface SortSelectorProps {
  mode: SortMode;
  onMode: (next: SortMode) => void;
}

export function SortSelector({ mode, onMode }: SortSelectorProps) {
  const { t } = useI18n();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--s-3)',
        flexWrap: 'wrap',
      }}
    >
      <span
        className="mono-meta"
        style={{ fontSize: 10, color: 'var(--ink-3)' }}
      >
        {t('sort.label')}
      </span>
      {MODES.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onMode(m)}
          aria-pressed={mode === m}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            paddingBottom: 2,
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            fontWeight: mode === m ? 600 : 400,
            color: mode === m ? 'var(--ink)' : 'var(--ink-2)',
            borderBottom: `1.5px solid ${mode === m ? 'var(--ink)' : 'transparent'}`,
          }}
        >
          {t(`sort.by_${m}` as never)}
        </button>
      ))}
    </div>
  );
}
