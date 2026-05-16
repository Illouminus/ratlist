/**
 * `<RunningRat>` — side view of a rat scampering. Useful as a margin
 * accent in lists/grids. Pass `flip={true}` to mirror it horizontally.
 */
import type { CSSProperties } from 'react';

interface RunningRatProps {
  size?: number;
  ink?: string;
  flip?: boolean;
  strokeWidth?: number;
  style?: CSSProperties;
}

export function RunningRat({
  size = 48,
  ink = 'var(--ink)',
  flip = false,
  strokeWidth = 1.2,
  style,
}: RunningRatProps) {
  return (
    <svg
      width={size * 1.6}
      height={size * 0.7}
      viewBox="0 0 160 60"
      style={{
        overflow: 'visible',
        transform: flip ? 'scaleX(-1)' : undefined,
        ...style,
      }}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M 22 36 Q 0 28 6 14"
        fill="none"
        stroke={ink}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        filter="url(#ratWobble)"
      />
      <g
        fill="none"
        stroke={ink}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="url(#ratWobble)"
      >
        <path d="M 28 36 Q 30 20 70 18 Q 100 18 108 30 Q 112 40 100 46 Q 60 50 32 48 Q 24 44 28 36 Z" />
        <path d="M 100 28 Q 108 12 124 14 Q 134 18 132 30 Q 128 40 116 40" />
        <circle cx="118" cy="16" r="6" />
        <circle cx="118" cy="17" r="2.4" strokeWidth={strokeWidth * 0.7} />
        <circle cx="120" cy="26" r="1.3" fill={ink} />
        <circle cx="132" cy="30" r="1.3" fill={ink} />
        {/* feet */}
        <path d="M 50 50 q 0 4 -2 6" strokeWidth={strokeWidth} />
        <path d="M 70 50 q -1 4 -3 6" strokeWidth={strokeWidth} />
        <path d="M 90 50 q 1 3 4 4" strokeWidth={strokeWidth} />
      </g>
    </svg>
  );
}
