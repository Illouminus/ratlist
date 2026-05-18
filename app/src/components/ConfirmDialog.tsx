/**
 * `<ConfirmDialog>` + `<ConfirmProvider>` — promise-based confirmation
 * modal in the app's editorial style. Replaces `window.confirm`, which
 * renders a chrome-native popup that breaks the visual flow.
 *
 * Usage:
 *
 *     const confirm = useConfirm();
 *     const ok = await confirm({
 *       title: t('groups.deleteConfirmTitle'),
 *       body:  t('groups.deleteConfirm', { name }),
 *       confirmLabel: t('groups.delete'),
 *       danger: true, // tints the primary button accent-deep
 *     });
 *     if (!ok) return;
 *
 * One dialog at a time. While a dialog is open, further `confirm()`
 * calls reject with `false` so a button-mash doesn't queue a stack.
 *
 * Keyboard: Esc cancels, Enter confirms. Tab and Shift+Tab cycle
 * focus inside the dialog (see `useFocusTrap` on the card div).
 *
 * `useConfirm` lives in `./useConfirm.ts` so this file stays
 * component-only for Vite Fast Refresh.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useFocusTrap } from '../lib/useFocusTrap';
import {
  ConfirmContext,
  type ConfirmApi,
  type ConfirmOptions,
} from './useConfirm';

interface OpenState {
  options: ConfirmOptions;
  resolve: (ok: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<OpenState | null>(null);

  // `close` uses the functional setState form so it always reads the
  // freshest state — no need for an openRef mutated during render
  // (which `react-hooks/refs` flags as a side-effect).
  const close = useCallback((result: boolean) => {
    setOpen((current) => {
      if (current) current.resolve(result);
      return null;
    });
  }, []);

  const confirm = useCallback<ConfirmApi['confirm']>(
    (options) =>
      new Promise<boolean>((resolve) => {
        setOpen((current) => {
          if (current) {
            // Already a dialog open — reject the new request silently.
            // Mirrors window.confirm: no stack/queue.
            resolve(false);
            return current;
          }
          return { options, resolve };
        });
      }),
    [],
  );

  // Esc / Enter shortcuts. Mounted once, gated on `open` so it doesn't
  // intercept keypresses on the rest of the app.
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        close(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  const api = useMemo<ConfirmApi>(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={api}>
      {children}
      {open && (
        <Dialog
          options={open.options}
          onConfirm={() => close(true)}
          onCancel={() => close(false)}
        />
      )}
    </ConfirmContext.Provider>
  );
}

// ─────────────────────────── dialog UI ───────────────────────────

interface DialogProps {
  options: ConfirmOptions;
  onConfirm: () => void;
  onCancel: () => void;
}

function Dialog({ options, onConfirm, onCancel }: DialogProps) {
  const {
    title,
    body,
    confirmLabel = 'ок',
    cancelLabel = 'отмена',
    danger,
  } = options;
  const cardRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(cardRef);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      // Backdrop. Click outside the card to cancel — same affordance
      // as native confirm's "x" but for the whole surround.
      onClick={onCancel}
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
          width: 'min(420px, 100%)',
          background: 'var(--paper)',
          border: '1px solid var(--hair-strong)',
          padding: 'var(--s-5)',
          borderRadius: 'var(--r-3)',
          boxShadow: '0 16px 40px rgba(43, 38, 32, 0.25)',
        }}
      >
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
          {title}
        </h2>
        {body && (
          <p
            style={{
              marginTop: 'var(--s-3)',
              fontSize: 14,
              lineHeight: 1.55,
              color: 'var(--ink-2)',
            }}
          >
            {body}
          </p>
        )}
        <div
          style={{
            marginTop: 'var(--s-5)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 'var(--s-3)',
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            className="mono-meta"
            style={{
              background: 'transparent',
              border: '1px solid var(--hair-strong)',
              padding: '8px 14px',
              borderRadius: 'var(--r-2)',
              cursor: 'pointer',
              color: 'var(--ink-2)',
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            className="mono-meta"
            style={{
              background: danger ? 'var(--accent-deep)' : 'var(--ink)',
              border: 'none',
              padding: '9px 16px',
              borderRadius: 'var(--r-2)',
              cursor: 'pointer',
              color: 'var(--paper)',
              fontWeight: 600,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
