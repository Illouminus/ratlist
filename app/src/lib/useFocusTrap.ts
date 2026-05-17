/**
 * `useFocusTrap` — keep keyboard focus inside a modal container while
 * it's open. Pass a ref to the container element; on mount the hook
 * focuses the first focusable descendant and starts intercepting Tab
 * keypresses to cycle within the trap.
 *
 * Plain DOM, no library. ~30 lines. We can't ship a "modal dialog"
 * with our editorial styling otherwise — keyboard users would tab
 * past the dialog into the underlying page, which is both an a11y
 * regression and confusing UX.
 */
import { useEffect, type RefObject } from 'react';

/** Standard focusable-element selector. Excludes `tabindex="-1"` and
 *  disabled controls. */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), ' +
  'input:not([disabled]):not([type="hidden"]), select:not([disabled]), ' +
  '[tabindex]:not([tabindex="-1"])';

export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean = true,
): void {
  useEffect(() => {
    if (!active) return undefined;
    const container = ref.current;
    if (!container) return undefined;

    // Remember where focus came from so we can restore it when the
    // trap unmounts. Better than dumping the user at <body>.
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Move focus into the trap if it isn't already there. Respects any
    // `autoFocus` React put on a child element — React's autoFocus
    // fires synchronously on mount, before this effect runs, so by the
    // time we check activeElement it's already inside the container.
    if (!container.contains(document.activeElement)) {
      const focusables = container.querySelectorAll<HTMLElement>(FOCUSABLE);
      focusables[0]?.focus();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      const focusables = container?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;

      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    container.addEventListener('keydown', onKeyDown);
    return () => {
      container.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus();
    };
  }, [ref, active]);
}
