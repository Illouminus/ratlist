/**
 * `<PeekingRat>` — head-only rat poking up from an edge. Pass `flip` to
 * mirror horizontally.
 */
import type { CSSProperties } from 'react';

interface PeekingRatProps {
  size?: number;
  ink?: string;
  flip?: boolean;
  strokeWidth?: number;
  style?: CSSProperties;
}

export function PeekingRat({
  size = 48,
  ink = 'var(--ink)',
  flip = false,
  strokeWidth = 1.3,
  style,
}: PeekingRatProps) {
  return (
    <svg
      width={size}
      height={size * 0.65}
      viewBox="0 0 120 78"
      style={{
        overflow: 'visible',
        transform: flip ? 'scaleX(-1)' : undefined,
        ...style,
      }}
      aria-hidden="true"
      focusable="false"
    >
      <g
        fill="none"
        stroke={ink}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="url(#ratWobble)"
      >
        <path d="M 34 60 Q 28 38 34 24 Q 44 14 60 14 Q 76 14 86 24 Q 92 38 86 60" />
        <circle cx="40" cy="20" r="8" />
        <circle cx="80" cy="20" r="8" />
        <circle cx="40" cy="21" r="3" strokeWidth={strokeWidth * 0.7} />
        <circle cx="80" cy="21" r="3" strokeWidth={strokeWidth * 0.7} />
        <circle cx="50" cy="36" r="1.4" fill={ink} />
        <circle cx="70" cy="36" r="1.4" fill={ink} />
        <ellipse cx="60" cy="48" rx="1.6" ry="1.2" fill={ink} />
        <path d="M 57 52 Q 60 54 63 52" strokeWidth={strokeWidth * 0.8} />
        {/* paws gripping the edge */}
        <path d="M 36 60 q -1 4 0 6 q 2 1 4 0" strokeWidth={strokeWidth} />
        <path d="M 84 60 q 1 4 0 6 q -2 1 -4 0" strokeWidth={strokeWidth} />
      </g>
    </svg>
  );
}
