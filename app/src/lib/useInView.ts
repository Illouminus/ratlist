import { useEffect, useRef, useState } from 'react';

/**
 * `useInView` — fire once when an element first scrolls into view.
 *
 * SSR / no-JS safe: starts `false` and only flips to `true` from the
 * IntersectionObserver callback (asynchronous — never synchronously in
 * the effect body, so `react-hooks/set-state-in-effect` stays satisfied).
 *
 * Consumers MUST render their content in its final, visible state by
 * default and treat `inView` purely as an opt-in "play the entrance now"
 * signal. That way a prerendered / no-JS / reduced-motion page shows
 * everything — it just doesn't animate.
 *
 * Observes once, then disconnects (entrances don't replay on re-entry).
 */
export function useInView<T extends Element = HTMLElement>(
  threshold = 0.25,
): { ref: React.RefObject<T | null>; inView: boolean } {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);

  return { ref, inView };
}
