/**
 * `useMediaQuery` — subscribes to a CSS media query and returns whether
 * it currently matches. The state stays live: rotate the device or
 * resize the window and the value updates.
 *
 * Use sparingly. CSS media queries are the right tool for visual
 * differences; this hook is for layout decisions a component needs to
 * make in JS (e.g. forcing a 'list' view on mobile regardless of the
 * stored 'grid' preference).
 */
import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent): void => setMatches(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

/** Convenience matching the project's `--bp-tablet: 768px` token. */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767px)');
}
