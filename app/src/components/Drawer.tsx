/**
 * `<Drawer>` — slide-in panel anchored to the right edge of the viewport.
 * Closes on backdrop click and on `Escape`. Locks body scroll while open
 * so the page underneath doesn't move.
 *
 * Generic on purpose: any screen can use it. The Add Item form lives
 * inside this drawer; future flows (edit item, group settings, etc.) can
 * reuse it.
 */
import { useEffect, type ReactNode } from 'react';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Panel width in px. Defaults to 460. */
  width?: number;
  /** Accessible label for the panel (assistive tech, modal heading). */
  ariaLabel?: string;
}

export function Drawer({ open, onClose, children, width = 460, ariaLabel }: DrawerProps) {
  // Close on Escape.
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    if (!open) return undefined;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(43, 38, 32, 0.18)',
          zIndex: 50,
          animation: 'fadeIn 160ms ease-out',
        }}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width,
          maxWidth: '100vw',
          background: 'var(--paper)',
          boxShadow: '-16px 0 50px rgba(43, 38, 32, 0.12)',
          borderLeft: '1px solid var(--hair)',
          padding: 'var(--s-6) var(--s-6)',
          zIndex: 51,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--s-5)',
          overflowY: 'auto',
          animation: 'slideInRight 200ms ease-out',
        }}
      >
        {children}
      </aside>
    </>
  );
}
