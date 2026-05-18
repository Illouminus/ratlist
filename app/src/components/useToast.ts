/**
 * `useToast` — context-consuming hook for the transient one-line
 * Toast. Split out of `Toast.tsx` so Vite Fast Refresh can hot-reload
 * the component file without losing toast state.
 */
import { createContext, useContext } from 'react';

export interface ToastApi {
  /** Show a toast for the given duration (default 2.5s). */
  show: (message: string, durationMs?: number) => void;
}

export const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // No provider in scope. Rather than crash a route, fall back to a
    // no-op so a missing wrapper doesn't break unrelated UI. The dev
    // console gets the warning so it's easy to spot in development.
    if (import.meta.env.DEV) {
      console.warn('useToast() called outside <ToastProvider>. Toast suppressed.');
    }
    return { show: () => undefined };
  }
  return ctx;
}
