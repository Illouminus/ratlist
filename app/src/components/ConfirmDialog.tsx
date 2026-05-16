/**
 * `<ConfirmDialog>` + `useConfirm()` — promise-based confirmation modal
 * in the app's editorial style. Replaces `window.confirm`, which renders
 * a chrome-native popup that breaks the visual flow.
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
 * Keyboard: Esc cancels, Enter confirms. We don't trap focus — the
 * editorial chrome is read-only behind the overlay, so tabbing
 * outside is harmless. Add a focus trap if a future screen needs it.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export interface ConfirmOptions {
  /** Bold one-line headline (e.g. "удалить «Тестовый круг»?"). */
  title: string;
  /** Optional supporting paragraph. */
  body?: string;
  /** Label for the primary "yes" button. Default: «ок». */
  confirmLabel?: string;
  /** Label for the secondary "no" button. Default: «отмена». */
  cancelLabel?: string;
  /** Style the primary button as destructive (accent-deep text). */
  danger?: boolean;
}

interface ConfirmApi {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmApi | null>(null);

interface OpenState {
  options: ConfirmOptions;
  resolve: (ok: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<OpenState | null>(null);
  // Cache the latest open ref so the global keydown handler reads the
  // current resolver — otherwise the effect would close over a stale
  // state value and not actually resolve the promise.
  const openRef = useRef<OpenState | null>(null);
  openRef.current = open;

  const close = useCallback((result: boolean) => {
    const current = openRef.current;
    if (!current) return;
    current.resolve(result);
    setOpen(null);
  }, []);

  const confirm = useCallback<ConfirmApi['confirm']>(
    (options) => {
      // Already a dialog open — reject the new request silently. This
      // mirrors how window.confirm queues: it doesn't. Better to
      // surface a "nothing happened" than stack modals.
      if (openRef.current) return Promise.resolve(false);
      return new Promise<boolean>((resolve) => {
        setOpen({ options, resolve });
      });
    },
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

export function useConfirm(): ConfirmApi['confirm'] {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    // Same defensive fallback as useToast — log in dev, no-op in prod.
    // Callers should still treat the returned boolean as authoritative.
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('useConfirm() called outside <ConfirmProvider>. Falling back to window.confirm.');
    }
    return (options) => Promise.resolve(window.confirm(options.body ?? options.title));
  }
  return ctx.confirm;
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
