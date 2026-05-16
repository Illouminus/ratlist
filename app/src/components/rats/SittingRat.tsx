/**
 * `<SittingRat>` — front-view rat in line-only style. Often placed in
 * empty states; when `sign` is true, a tiny held sign appears with the
 * caption from `signText` (defaults to "hello").
 *
 * Inherits the shared `#ratWobble` SVG filter — make sure `<RatDefs>` is
 * mounted somewhere up the tree, otherwise the lines render too crisp.
 */
import type { CSSProperties } from 'react';

interface SittingRatProps {
  size?: number;
  ink?: string;
  sign?: boolean;
  signText?: string;
  strokeWidth?: number;
  style?: CSSProperties;
}

export function SittingRat({
  size = 56,
  ink = 'var(--ink)',
  sign = false,
  signText = 'hello',
  strokeWidth = 1.4,
  style,
}: SittingRatProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      style={{ overflow: 'visible', ...style }}
      aria-hidden="true"
      focusable="false"
    >
      {/* tail */}
      <path
        d="M 88 78 Q 108 78 110 60 Q 112 44 96 44"
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
        <ellipse cx="60" cy="78" rx="30" ry="24" />
        <ellipse cx="60" cy="48" rx="26" ry="24" />
        <circle cx="40" cy="30" r="9" />
        <circle cx="80" cy="30" r="9" />
        <circle cx="40" cy="31" r="3.5" strokeWidth={strokeWidth * 0.7} />
        <circle cx="80" cy="31" r="3.5" strokeWidth={strokeWidth * 0.7} />
        <circle cx="50" cy="48" r="1.5" fill={ink} />
        <circle cx="70" cy="48" r="1.5" fill={ink} />
        <ellipse cx="60" cy="60" rx="2" ry="1.4" fill={ink} />
        <path d="M 56 64 Q 60 67 64 64" strokeWidth={strokeWidth * 0.9} />
        {/* whiskers */}
        <path d="M 50 62 L 38 60" strokeWidth={strokeWidth * 0.7} />
        <path d="M 50 64 L 38 65" strokeWidth={strokeWidth * 0.7} />
        <path d="M 70 62 L 82 60" strokeWidth={strokeWidth * 0.7} />
        <path d="M 70 64 L 82 65" strokeWidth={strokeWidth * 0.7} />
      </g>
      {sign && (
        <g filter="url(#ratWobble)">
          <path
            d="M 88 80 Q 102 60 100 36"
            fill="none"
            stroke={ink}
            strokeWidth={1}
            strokeLinecap="round"
          />
          <rect
            x="78"
            y="14"
            width="50"
            height="22"
            rx="1"
            fill="#fffdf6"
            stroke={ink}
            strokeWidth={1.2}
            transform="rotate(-4 103 25)"
          />
          <text
            x="103"
            y="30"
            textAnchor="middle"
            fill={ink}
            style={{
              fontFamily: 'var(--font-hand)',
              fontWeight: 500,
              fontSize: 11,
            }}
            transform="rotate(-4 103 25)"
          >
            {signText}
          </text>
        </g>
      )}
    </svg>
  );
}
