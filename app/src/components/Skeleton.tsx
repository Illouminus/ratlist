/**
 * `<ListSkeleton>` — placeholder rows shown while a list view (items,
 * groups, people, santa events) is loading. Replaces the single "…"
 * placeholder we used to render in the loading branch, which gave the
 * user no sense that anything was on the way and produced a visible
 * jump when the real list painted.
 *
 * Design: thin hairline-bordered bars in the same paper palette as the
 * rest of the UI, with a slow shimmer (~1.6 s) so it reads as "active"
 * without being noisy. Each bar's width is randomised within a fixed
 * range so the skeleton doesn't look like a rigid grid — closer to
 * the editorial irregularity of real rows.
 */
import { useMemo } from 'react';

interface ListSkeletonProps {
  /** Number of placeholder rows. Default 5 covers the typical fold. */
  rows?: number;
}

/**
 * Pre-computed deterministic widths so the skeleton looks irregular but
 * doesn't "twitch" on re-render. A pure mod-pattern keeps the rule
 * `react-hooks/purity` happy — Math.random in render is impure.
 */
function widthAt(index: number): number {
  // Spreads 60-95 across indices, wrapping with stride 13 for variety.
  return 60 + ((index * 13 + 7) % 35);
}

export function ListSkeleton({ rows = 5 }: ListSkeletonProps) {
  const widths = useMemo(
    () => Array.from({ length: rows }, (_, i) => widthAt(i)),
    [rows],
  );

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="loading"
      style={{ padding: 'var(--s-4) 0' }}
    >
      {widths.map((widthPct, i) => (
        <div
          key={i}
          style={{
            height: 14,
            width: `${widthPct}%`,
            marginBottom: 'var(--s-4)',
            background:
              'linear-gradient(90deg, rgba(43,38,32,0.06) 0%, rgba(43,38,32,0.14) 50%, rgba(43,38,32,0.06) 100%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.6s linear infinite',
            borderRadius: 3,
          }}
        />
      ))}
    </div>
  );
}
