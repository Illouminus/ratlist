/**
 * `<ActivationChecklist>` — first-run activation nudge for MyList.
 *
 * The app is multiplayer: a lone signup with no friends lands on a dead
 * screen and bounces. This surface closes that cold-start hole by
 * walking a new account through the three things that make the app
 * actually useful:
 *
 *   1. add your first thing      (done: `hasItems` prop)
 *   2. turn on your list link     (done: share token set — useShareToken)
 *   3. invite a rat               (done: ≥1 friendship — useFriends)
 *
 * Persists at the top of MyList — in both the empty and populated
 * states — until all three are done, then graduates: it writes a
 * localStorage flag and never returns. The user can also dismiss it
 * with «скрыть», but only once they've added at least one item, so the
 * empty screen never loses its call-to-action.
 *
 * Modal ownership stays with MyListScreen (it already owns ShareDialog,
 * and AddFriendModal is shared chrome) — this component only fires the
 * `onAdd` / `onShare` / `onAddRat` callbacks. The done-detection hooks
 * live here so the parent doesn't carry activation state it never uses
 * elsewhere.
 */
import { useEffect } from 'react';
import { useI18n } from '../i18n/useI18n';
import { useShareToken } from '../items/useShareToken';
import { useFriends } from '../friends/useFriends';
import { markActivationDone } from '../lib/activation';
import { track } from '../lib/plausible';

export interface ActivationChecklistProps {
  /** Whether the user has at least one item. Owned by MyListScreen,
   *  which already loads the item list — avoids a second subscription. */
  hasItems: boolean;
  onAdd: () => void;
  onShare: () => void;
  onAddRat: () => void;
  /** User dismissed the checklist — parent persists + unmounts us. Only
   *  ever called once `hasItems` is true (see render below). */
  onDismiss: () => void;
}

interface Step {
  done: boolean;
  label: string;
  cta: string;
  onClick: () => void;
}

export function ActivationChecklist({
  hasItems,
  onAdd,
  onShare,
  onAddRat,
  onDismiss,
}: ActivationChecklistProps) {
  const { t } = useI18n();
  const { query: shareQ } = useShareToken();
  const { state: friendsState } = useFriends();

  const sharedDone = shareQ.status === 'ready' && shareQ.token !== null;
  const ratDone = friendsState.kind === 'loaded' && friendsState.friends.length > 0;
  const allDone = hasItems && sharedDone && ratDone;

  // Graduate: persist the flag once everything's done so the checklist
  // never returns in a future session. localStorage write only — no
  // setState here, so `react-hooks/set-state-in-effect` stays satisfied.
  useEffect(() => {
    if (allDone) {
      markActivationDone();
      track('ActivationCompleted');
    }
  }, [allDone]);

  // Hide for the rest of this session the moment all three are done. The
  // parent's mount gate (isActivationDone) takes over on future sessions.
  if (allDone) return null;

  // Explicit dismiss persists the flag here (this component is the single
  // persistence authority — same as the graduate path above) and asks the
  // parent to unmount us for the rest of this session.
  const handleDismiss = () => {
    markActivationDone();
    onDismiss();
  };

  const steps: Step[] = [
    { done: hasItems, label: t('activation.itemLabel'), cta: t('activation.itemCta'), onClick: onAdd },
    { done: sharedDone, label: t('activation.shareLabel'), cta: t('activation.shareCta'), onClick: onShare },
    { done: ratDone, label: t('activation.ratLabel'), cta: t('activation.ratCta'), onClick: onAddRat },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <section
      aria-label={t('activation.eyebrow')}
      style={{
        border: '1px solid var(--hair-strong)',
        borderRadius: 'var(--r-3)',
        padding: 'var(--s-4)',
        marginBottom: 'var(--s-5)',
        background: '#fffdf6',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 'var(--s-3)',
          marginBottom: 'var(--s-3)',
        }}
      >
        <span className="mono-meta">{t('activation.eyebrow')}</span>
        <span className="mono-meta" style={{ color: 'var(--ink-3)' }}>
          {doneCount}/3
        </span>
      </div>

      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--s-3)' }}>
        {steps.map((s) => (
          <StepRow key={s.label} {...s} />
        ))}
      </ol>

      {/* Dismiss is only offered once the list has at least one item —
          before that, hiding the checklist would leave the empty screen
          with no call-to-action at all. */}
      {hasItems && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--s-3)' }}>
          <button
            type="button"
            onClick={handleDismiss}
            className="mono-meta"
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              color: 'var(--ink-3)',
              cursor: 'pointer',
            }}
          >
            {t('activation.hide')}
          </button>
        </div>
      )}
    </section>
  );
}

function StepRow({ done, label, cta, onClick }: Step) {
  return (
    <li style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)' }}>
      <span
        aria-hidden
        style={{
          width: 18,
          height: 18,
          flexShrink: 0,
          borderRadius: '50%',
          display: 'inline-grid',
          placeItems: 'center',
          border: done ? 'none' : '1.5px solid var(--hair-strong)',
          background: done ? 'var(--accent)' : 'transparent',
          color: 'var(--paper)',
          fontSize: 11,
          lineHeight: 1,
        }}
      >
        {done ? '✓' : ''}
      </span>

      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 14,
          color: done ? 'var(--ink-3)' : 'var(--ink)',
          textDecoration: done ? 'line-through' : 'none',
        }}
      >
        {label}
      </span>

      {!done && (
        <button
          type="button"
          onClick={onClick}
          className="mono-meta"
          style={{
            background: 'transparent',
            border: 'none',
            padding: 0,
            color: 'var(--accent)',
            cursor: 'pointer',
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          {cta} →
        </button>
      )}
    </li>
  );
}
