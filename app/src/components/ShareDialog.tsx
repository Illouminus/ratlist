/**
 * `<ShareDialog>` — modal that controls the user's public-share URL.
 *
 * Self-contained. The caller passes `open` + `onClose`; the dialog
 * fetches/mutates the token via `useShareToken` itself. Rendering
 * inside a portal-style fixed overlay so it floats above the page
 * regardless of where it was triggered from.
 *
 * Three states:
 *
 *   disabled → "share is off" + Enable button
 *   enabled  → URL field (readonly + copy) + Rotate / Disable
 *   loading  → "…" placeholder
 *
 * Copying uses `navigator.clipboard.writeText` + toast — same path as
 * the item detail share. Mobile clipboard works in https/localhost, so
 * we don't bother with a textarea fallback.
 */
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/useI18n';
import { useToast } from './Toast';
import { useShareToken } from '../items/useShareToken';
import { errorMessage } from '../lib/errors';
import { useFocusTrap } from '../lib/useFocusTrap';

export interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ShareDialog({ open, onClose }: ShareDialogProps) {
  const { t } = useI18n();
  const toast = useToast();
  const { query, enable, disable, rotate } = useShareToken();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(cardRef, open);

  // Esc closes — paired with the focus trap so keyboard users can
  // both dismiss and stay oriented inside the dialog.
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const token = query.status === 'ready' ? query.token : null;
  const shareUrl = token ? `${window.location.origin}/share/${token}` : null;

  async function handleEnable(): Promise<void> {
    setBusy(true);
    setError(null);
    const r = await enable();
    setBusy(false);
    if ('error' in r) setError(errorMessage(t, r.error));
  }

  async function handleDisable(): Promise<void> {
    setBusy(true);
    setError(null);
    const r = await disable();
    setBusy(false);
    if ('error' in r) {
      setError(errorMessage(t, r.error));
      return;
    }
    toast.show(t('share.disabledToast'));
  }

  async function handleRotate(): Promise<void> {
    setBusy(true);
    setError(null);
    const r = await rotate();
    setBusy(false);
    if ('error' in r) {
      setError(errorMessage(t, r.error));
      return;
    }
    toast.show(t('share.rotatedToast'));
  }

  async function handleCopy(): Promise<void> {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.show(t('share.copiedToast'));
    } catch {
      /* clipboard blocked — fall through silently */
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('share.title')}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(43, 38, 32, 0.45)',
        display: 'grid',
        placeItems: 'center',
        padding: 'var(--s-4)',
        zIndex: 1100,
        animation: 'fadeIn var(--motion) ease-out',
      }}
    >
      <div
        ref={cardRef}
        onClick={(e) => e.stopPropagation()}
        className="fade-up"
        style={{
          width: 'min(480px, 100%)',
          background: 'var(--paper)',
          border: '1px solid var(--hair-strong)',
          padding: 'var(--s-5)',
          borderRadius: 'var(--r-3)',
          boxShadow: '0 16px 40px rgba(43, 38, 32, 0.25)',
        }}
      >
        <div className="mono-meta" style={{ marginBottom: 'var(--s-2)' }}>
          {t('share.eyebrow')}
        </div>
        <h2
          className="display-italic"
          style={{
            margin: 0,
            fontSize: 'var(--display-s)',
            lineHeight: 1.15,
            letterSpacing: -0.5,
            color: 'var(--ink)',
          }}
        >
          {t('share.title')}
        </h2>

        <p
          style={{
            margin: 'var(--s-3) 0 var(--s-4)',
            fontSize: 13,
            lineHeight: 1.55,
            color: 'var(--ink-2)',
          }}
        >
          {token ? t('share.bodyEnabled') : t('share.bodyDisabled')}
        </p>

        {query.status === 'loading' && (
          <div className="mono-meta" style={{ color: 'var(--ink-3)' }}>
            …
          </div>
        )}

        {token && shareUrl && (
          <>
            <div
              style={{
                padding: '10px 12px',
                background: '#fffdf6',
                border: '1px solid var(--hair-strong)',
                borderRadius: 'var(--r-2)',
                fontFamily: 'var(--font-body)',
                fontSize: 12,
                color: 'var(--ink)',
                wordBreak: 'break-all',
                lineHeight: 1.4,
              }}
            >
              {shareUrl}
            </div>
            <div
              style={{
                marginTop: 'var(--s-3)',
                display: 'flex',
                gap: 'var(--s-3)',
                flexWrap: 'wrap',
                justifyContent: 'flex-end',
              }}
            >
              <ActionButton onClick={handleDisable} disabled={busy} variant="danger">
                {t('share.disable')}
              </ActionButton>
              <ActionButton onClick={handleRotate} disabled={busy}>
                {t('share.rotate')}
              </ActionButton>
              <ActionButton onClick={handleCopy} disabled={busy} variant="primary">
                {t('share.copy')}
              </ActionButton>
            </div>
          </>
        )}

        {query.status === 'ready' && !token && (
          <div
            style={{
              display: 'flex',
              gap: 'var(--s-3)',
              justifyContent: 'flex-end',
            }}
          >
            <ActionButton onClick={onClose} disabled={busy}>
              {t('groups.cancel')}
            </ActionButton>
            <ActionButton onClick={handleEnable} disabled={busy} variant="primary">
              {busy ? t('share.enabling') : t('share.enable')}
            </ActionButton>
          </div>
        )}

        {error && (
          <p style={{ marginTop: 'var(--s-3)', color: 'var(--accent-deep)', fontSize: 13 }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────── small button atom ───────────────────────────

interface ActionButtonProps {
  onClick: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'danger' | 'default';
  children: React.ReactNode;
}

/** Small inline button used by the dialog footer. Three variants:
 *  primary (accent-filled), danger (accent-deep filled), default (ghost). */
function ActionButton({ onClick, disabled, variant = 'default', children }: ActionButtonProps) {
  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mono-meta"
      style={{
        background: isPrimary ? 'var(--ink)' : isDanger ? 'var(--accent-deep)' : 'transparent',
        color: isPrimary || isDanger ? 'var(--paper)' : 'var(--ink-2)',
        border: isPrimary || isDanger ? 'none' : '1px solid var(--hair-strong)',
        padding: '8px 14px',
        borderRadius: 'var(--r-2)',
        cursor: disabled ? 'default' : 'pointer',
        fontWeight: 600,
      }}
    >
      {children}
    </button>
  );
}
