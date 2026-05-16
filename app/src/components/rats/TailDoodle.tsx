/**
 * `<TailDoodle>` — just a curling tail. Tucked into sidebars / margins as
 * a tiny accent without the full rat.
 */
import type { CSSProperties } from 'react';

interface TailDoodleProps {
  size?: number;
  ink?: string;
  strokeWidth?: number;
  style?: CSSProperties;
}

export function TailDoodle({
  size = 32,
  ink = 'var(--ink)',
  strokeWidth = 1.2,
  style,
}: TailDoodleProps) {
  return (
    <svg
      width={size * 1.4}
      height={size * 0.6}
      viewBox="0 0 60 26"
      style={{ overflow: 'visible', ...style }}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M 4 22 Q 18 22 22 12 Q 26 2 50 4"
        fill="none"
        stroke={ink}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        filter="url(#ratWobble)"
      />
    </svg>
  );
}
