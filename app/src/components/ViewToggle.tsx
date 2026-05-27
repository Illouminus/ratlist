/**
 * `<ViewToggle>` — pair of icon buttons that switch between grid and
 * list view. Shared by the three list screens (MyList / FriendList /
 * PublicList) so the affordance reads the same everywhere.
 *
 * Pure presentation: persistence is the caller's job (typically via
 * `useViewMode()` from `lib/useViewMode`).
 */
import type { ViewMode } from '../lib/useViewMode';

interface ViewToggleProps {
  view: ViewMode;
  onView: (next: ViewMode) => void;
  gridLabel?: string;
  listLabel?: string;
}

export function ViewToggle({
  view,
  onView,
  gridLabel = 'grid view',
  listLabel = 'list view',
}: ViewToggleProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <ToggleButton
        active={view === 'grid'}
        onClick={() => onView('grid')}
        aria-label={gridLabel}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
          <rect x="1" y="1" width="5" height="5" stroke="currentColor" fill="none" />
          <rect x="8" y="1" width="5" height="5" stroke="currentColor" fill="none" />
          <rect x="1" y="8" width="5" height="5" stroke="currentColor" fill="none" />
          <rect x="8" y="8" width="5" height="5" stroke="currentColor" fill="none" />
        </svg>
      </ToggleButton>
      <ToggleButton
        active={view === 'list'}
        onClick={() => onView('list')}
        aria-label={listLabel}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
          <path d="M1 3h12M1 7h12M1 11h12" stroke="currentColor" fill="none" />
        </svg>
      </ToggleButton>
    </div>
  );
}

interface ToggleButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  'aria-label': string;
}

function ToggleButton({ active, onClick, children, ...rest }: ToggleButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={rest['aria-label']}
      aria-pressed={active}
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
