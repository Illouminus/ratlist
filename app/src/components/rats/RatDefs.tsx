/**
 * `<RatDefs>` — invisible `<svg>` mounted once at the root of the app so
 * every rat illustration can reference the shared turbulence filter that
 * gives the ink-on-paper wobble. Without this filter the SVGs render as
 * crisp vectors and lose their hand-drawn feel.
 */
export function RatDefs() {
  return (
    <svg
      width={0}
      height={0}
      style={{ position: 'absolute' }}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <filter id="ratWobble" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves={2} seed={3} />
          <feDisplacementMap in="SourceGraphic" scale={1.2} />
        </filter>
      </defs>
    </svg>
  );
}
