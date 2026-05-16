/**
 * `<ToastProvider>` + `useToast()` — minimal one-line transient notice.
 *
 * We use it for action confirmations that don't warrant a full modal:
 * "ссылку скопировали", "сохранено", etc. Each toast is a short string
 * that fades up from the bottom of the viewport, sits there for a few
 * seconds, and fades away. Only one toast is shown at a time —
 * subsequent `show()` calls replace the current one.
 *
 * The toast lives in the React tree above any chrome (`Sidebar`,
 * `BottomTabBar`) so it floats above whatever route the user is on.
 *
 * Why a custom toast instead of `react-hot-toast` or similar? One
 * dependency for one feature. The editorial design is opinionated and
 * we don't need toast variants, queueing, or icons — just a tiny
 * floating string.
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

interface ToastApi {
  /** Show a toast for the given duration (default 2.5s). */
  show: (message: string, durationMs?: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Display duration (ms) before the toast auto-dismisses if no `duration` is given. */
const DEFAULT_DURATION = 2500;
/** CSS fade-in/out transition duration. Mirrors --motion in tokens.css
 *  (220ms). Hard-coded here rather than read via getComputedStyle to
 *  keep render cheap. */
const FADE_MS = 220;

interface ToastState {
  /** Monotonic id so two consecutive `show()`s with identical text still
   *  trigger a fresh fade/animation. */
  id: number;
  message: string;
  visible: boolean;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  // Timers we own — cleared on a new toast or on unmount, so a slow
  // user spamming the action doesn't leave orphaned timers behind.
  const fadeOutTimer = useRef<number | null>(null);
  const removeTimer = useRef<number | null>(null);
  const idRef = useRef(0);

  const clearTimers = () => {
    if (fadeOutTimer.current !== null) {
      window.clearTimeout(fadeOutTimer.current);
      fadeOutTimer.current = null;
    }
    if (removeTimer.current !== null) {
      window.clearTimeout(removeTimer.current);
      removeTimer.current = null;
    }
  };

  useEffect(() => () => clearTimers(), []);

  const show = useCallback((message: string, durationMs = DEFAULT_DURATION): void => {
    clearTimers();
    const id = ++idRef.current;
    setToast({ id, message, visible: true });

    // Step 1: start fading out near the end of the display window.
    fadeOutTimer.current = window.setTimeout(() => {
      setToast((current) => (current && current.id === id ? { ...current, visible: false } : current));
    }, durationMs);

    // Step 2: actually unmount once the fade has finished — saves a
    // tick of style juggling and lets the slide-in animation play
    // cleanly on the next show().
    removeTimer.current = window.setTimeout(() => {
      setToast((current) => (current && current.id === id ? null : current));
    }, durationMs + FADE_MS);
  }, []);

  const api = useMemo<ToastApi>(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            // Sit above the mobile bottom tab bar with a comfortable
            // gap. On desktop the same offset reads as "near the bottom
            // edge" which is the conventional toast position.
            left: '50%',
            bottom: `calc(var(--bottom-bar-h) + var(--s-4) + env(safe-area-inset-bottom, 0px))`,
            transform: `translate(-50%, ${toast.visible ? '0' : '8px'})`,
            opacity: toast.visible ? 1 : 0,
            transition: `opacity ${FADE_MS}ms ease-out, transform ${FADE_MS}ms ease-out`,
            background: 'var(--ink)',
            color: 'var(--paper)',
            padding: '10px 16px',
            borderRadius: 'var(--r-2)',
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            fontWeight: 500,
            boxShadow: '0 6px 16px rgba(43, 38, 32, 0.22)',
            pointerEvents: 'none',
            zIndex: 1000,
            maxWidth: 'min(420px, calc(100% - 32px))',
            textAlign: 'center',
          }}
        >
          {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // No provider in scope. Rather than crash a route, fall back to a
    // no-op so a missing wrapper doesn't break unrelated UI. The dev
    // console gets the warning so it's easy to spot in development.
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('useToast() called outside <ToastProvider>. Toast suppressed.');
    }
    return { show: () => undefined };
  }
  return ctx;
}
