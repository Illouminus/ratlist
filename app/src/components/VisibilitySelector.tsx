/**
 * `<VisibilitySelector>` — three-segment toggle for an item's audience:
 * private (just me), friends (rats), public (anyone with the share link).
 *
 * Mirrors the editorial filter-chip pattern (underline + bold for the
 * active option, light ink for the rest) — same visual treatment as
 * `<SortSelector>` and the chip row in `<ItemFilters>`. Below the row,
 * a single-line helper text describes what the active state means so
 * the user never has to guess.
 *
 * Icons are inline SVGs (lock / two-dot rats / globe) drawn in the same
 * 1.4px hairline as the rest of the design — no external icon font, no
 * lucide dependency. Sized to sit alongside 12px body text.
 */
import { useI18n } from '../i18n/useI18n';

export type Visibility = 'private' | 'friends' | 'public';

export interface VisibilitySelectorProps {
  value: Visibility;
  onChange: (next: Visibility) => void;
}

const VISIBILITIES: ReadonlyArray<Visibility> = ['private', 'friends', 'public'];

export function VisibilitySelector({ value, onChange }: VisibilitySelectorProps) {
  const { t } = useI18n();

  return (
    <div>
      <div
        role="radiogroup"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--s-4)',
          flexWrap: 'wrap',
        }}
      >
        {VISIBILITIES.map((v) => (
          <Segment
            key={v}
            active={v === value}
            label={t(`visibility.${v}`)}
            icon={<VisibilityIcon kind={v} />}
            onClick={() => onChange(v)}
          />
        ))}
      </div>
      <p
        className="marginalia"
        style={{
          margin: 'var(--s-2) 0 0',
          fontSize: 13,
          color: 'var(--ink-3)',
          minHeight: 18,
        }}
      >
        {t(`visibility.${value}Help`)}
      </p>
    </div>
  );
}

// ─────────────────────────── atoms ───────────────────────────

interface SegmentProps {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}

function Segment({ active, label, icon, onClick }: SegmentProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      style={{
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        paddingBottom: 2,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--s-2)',
        fontFamily: 'var(--font-body)',
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        color: active ? 'var(--ink)' : 'var(--ink-2)',
        borderBottom: `1.5px solid ${active ? 'var(--ink)' : 'transparent'}`,
      }}
    >
      <span aria-hidden="true" style={{ display: 'inline-flex' }}>
        {icon}
      </span>
      {label}
    </button>
  );
}

interface VisibilityIconProps {
  kind: Visibility;
}

function VisibilityIcon({ kind }: VisibilityIconProps) {
  const stroke = 'currentColor';
  const size = 16;
  if (kind === 'private') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        fill="none"
        stroke={stroke}
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <rect x="3" y="7" width="10" height="7" rx="1.2" />
        <path d="M 5 7 V 5 a 3 3 0 0 1 6 0 V 7" />
      </svg>
    );
  }
  if (kind === 'friends') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        fill="none"
        stroke={stroke}
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="5.5" cy="6" r="2.2" />
        <circle cx="10.5" cy="6" r="2.2" />
        <path d="M 2 13 c 0 -2 1.5 -3.4 3.5 -3.4 s 3.5 1.4 3.5 3.4" />
        <path d="M 7 13 c 0 -2 1.5 -3.4 3.5 -3.4 s 3.5 1.4 3.5 3.4" />
      </svg>
    );
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke={stroke}
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="8" cy="8" r="5.6" />
      <path d="M 2.4 8 H 13.6" />
      <path d="M 8 2.4 a 7 7 0 0 1 0 11.2 a 7 7 0 0 1 0 -11.2" />
    </svg>
  );
}
