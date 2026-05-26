/**
 * `<ClaimControl>` — claim / release button for guests on a curated
 * event item. Three visual states:
 *
 *   - no claim          → terracotta «забрать» button
 *   - my claim          → marginalia «ты берёшь ✓» + a small «release»
 *                         link
 *   - someone else's    → marginalia «забрал/а {name}» label (no button)
 *
 * Extracted from EventDetailScreen.tsx during the redesign so
 * HeroCuratedItem (and any future event-related card) can reuse it
 * without going through the screen.
 */
import { useI18n } from '../../i18n/useI18n';
import type { EventClaim } from '../../events/useEvent';

interface ClaimControlProps {
  myClaim: EventClaim | null;
  othersClaim: EventClaim | null;
  onClaim: () => void;
  onRelease: () => void;
}

export function ClaimControl({
  myClaim,
  othersClaim,
  onClaim,
  onRelease,
}: ClaimControlProps) {
  const { t } = useI18n();

  if (myClaim) {
    return (
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--s-2)' }}>
        <span
          className="marginalia"
          style={{ fontSize: 13, color: 'var(--accent)', transform: 'rotate(-1deg)' }}
        >
          {t('friend.youClaim')} ✓
        </span>
        <button
          type="button"
          onClick={onRelease}
          className="mono-meta"
          style={{
            background: 'transparent',
            border: 'none',
            padding: 0,
            color: 'var(--ink-3)',
            cursor: 'pointer',
          }}
        >
          {t('friend.release')}
        </button>
      </div>
    );
  }
  if (othersClaim) {
    return (
      <span className="marginalia" style={{ fontSize: 13, color: 'var(--ink-3)' }}>
        {t('friend.claimedBy', { name: othersClaim.user.display_name })}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClaim}
      style={{
        background: 'transparent',
        border: '1px solid var(--ink)',
        padding: '4px 10px',
        borderRadius: 'var(--r-1)',
        cursor: 'pointer',
        fontFamily: 'var(--font-body)',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--ink)',
      }}
    >
      {t('friend.claim')}
    </button>
  );
}
