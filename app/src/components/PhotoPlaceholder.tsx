/**
 * `<PhotoPlaceholder>` — a watercolor-wash filler used in place of a real
 * item photo. Mirrors the placeholder shape from the design (cream cell,
 * diagonal hatch, soft radial wash, optional handwritten label, optional
 * sitting-rat with sign).
 *
 * Pass `withRat={true}` to render a `<SittingRat>` with a sign centred in
 * the wash. The sign reads `t('placeholder.noPhoto')` by default; pass
 * `signText` to override (e.g. on the empty-event state where we want
 * "empty" instead of "no photo").
 *
 * The rat is opt-in — default behavior (no rat) is unchanged from the
 * pre-redesign component. Tiny placeholders (small thumbnails) should
 * keep `withRat={false}` because the rat doesn't read well below ~120px.
 */
import type { CSSProperties } from 'react';
import { useI18n } from '../i18n/useI18n';
import { SittingRat } from './rats/SittingRat';

interface PhotoPlaceholderProps {
  /** The wash colour. Defaults to the current accent wash. */
  wash?: string;
  /** Fixed height (px) — use OR `aspectRatio`, not both. */
  height?: number;
  /** CSS aspect-ratio string, e.g. `"4 / 3"`. Preferred for cards. */
  aspectRatio?: string;
  /** Tiny handwritten caption (e.g. "product shot") in the bottom-left. Optional. */
  label?: string;
  style?: CSSProperties;
  /** Show a SittingRat with a sign in the wash centre. Default false. */
  withRat?: boolean;
  /** Override the sign text. Defaults to t('placeholder.noPhoto') when
   *  withRat is true and this prop is omitted. */
  signText?: string;
}

export function PhotoPlaceholder({
  wash = 'var(--accent-wash)',
  height = 200,
  aspectRatio,
  label,
  style,
  withRat = false,
  signText,
}: PhotoPlaceholderProps) {
  // useI18n is only needed for the default rat-sign text. Calling it
  // unconditionally keeps the hook order stable; the result is only
  // consumed inside the withRat branch.
  const { t } = useI18n();
  const effectiveSignText = signText ?? t('placeholder.noPhoto');

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
      {withRat && (
        <div
          data-testid="sitting-rat"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <SittingRat size={60} sign signText={effectiveSignText} />
        </div>
      )}
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
