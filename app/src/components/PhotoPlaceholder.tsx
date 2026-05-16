/**
 * `<PhotoPlaceholder>` — a watercolor-wash filler used in place of a real
 * item photo. Mirrors the placeholder shape from the design (cream cell,
 * diagonal hatch, soft radial wash, optional handwritten label).
 *
 * Used until photo upload lands. Once items have real `cover_url`, swap
 * this for an `<img>` at the same dimensions.
 */
import type { CSSProperties } from 'react';

interface PhotoPlaceholderProps {
  /** The wash colour. Defaults to the current accent wash. */
  wash?: string;
  /** Fixed height (px) — use OR `aspectRatio`, not both. */
  height?: number;
  /** CSS aspect-ratio string, e.g. `"4 / 3"`. Preferred for cards. */
  aspectRatio?: string;
  /** Tiny handwritten caption (e.g. "product shot"). Optional. */
  label?: string;
  style?: CSSProperties;
}

export function PhotoPlaceholder({
  wash = 'var(--accent-wash)',
  height = 200,
  aspectRatio,
  label,
  style,
}: PhotoPlaceholderProps) {
  return (
    <div
      style={{
        height: aspectRatio ? undefined : height,
        aspectRatio,
        position: 'relative',
        overflow: 'hidden',
        background: '#fffdf6',
        boxShadow: 'inset 0 0 0 1px var(--hair)',
        ...style,
      }}
    >
      {/* soft radial watercolor blob */}
      <div
        style={{
          position: 'absolute',
          inset: '14%',
          background: `radial-gradient(ellipse at 35% 30%, ${wash} 0%, ${wash}cc 35%, transparent 75%)`,
          opacity: 0.65,
          filter: 'blur(3px)',
        }}
      />
      {/* diagonal hatch */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.05,
          backgroundImage:
            'repeating-linear-gradient(135deg, var(--ink) 0 1px, transparent 1px 14px)',
        }}
      />
      {label && (
        <div
          style={{
            position: 'absolute',
            left: 10,
            bottom: 8,
            fontFamily: 'var(--font-hand)',
            fontWeight: 500,
            fontSize: 14,
            color: 'var(--ink-3)',
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
}
