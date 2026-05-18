/**
 * `useConfirm` — context-consuming hook for the promise-based
 * ConfirmDialog. Split out of `ConfirmDialog.tsx` so Vite Fast Refresh
 * can hot-reload the component file without losing the dialog state
 * (the `react-refresh/only-export-components` rule).
 */
import { createContext, useContext } from 'react';

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

export interface ConfirmApi {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

export const ConfirmContext = createContext<ConfirmApi | null>(null);

export function useConfirm(): ConfirmApi['confirm'] {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    // Same defensive fallback as useToast — log in dev, no-op in prod.
    // Callers should still treat the returned boolean as authoritative.
    if (import.meta.env.DEV) {
      console.warn('useConfirm() called outside <ConfirmProvider>. Falling back to window.confirm.');
    }
    return (options) => Promise.resolve(window.confirm(options.body ?? options.title));
  }
  return ctx.confirm;
}
