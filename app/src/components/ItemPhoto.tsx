/**
 * `<ItemPhoto>` — renders an uploaded cover image, or falls back to the
 * watercolour `<PhotoPlaceholder>` when none is set.
 *
 * The optional `withRat` + `signText` props are pass-through to
 * `PhotoPlaceholder` for the no-cover branch. Call sites that render
 * large placeholder areas (event hero cards, item detail page) opt in
 * via `withRat={true}`. Tiny thumbnails (list-view rows) leave it off.
 */
import type { CSSProperties } from 'react';
import { PhotoPlaceholder } from './PhotoPlaceholder';

interface ItemPhotoProps {
  /** Public Supabase Storage URL, or null for the placeholder. */
  coverUrl: string | null;
  /** Fixed height (px) — use OR `aspectRatio`, not both. */
  height?: number;
  aspectRatio?: string;
  alt?: string;
  style?: CSSProperties;
  /** Pass-through to PhotoPlaceholder. Ignored when coverUrl is set. */
  withRat?: boolean;
  /** Pass-through to PhotoPlaceholder. Ignored when coverUrl is set. */
  signText?: string;
}

export function ItemPhoto({
  coverUrl,
  height,
  aspectRatio,
  alt = '',
  style,
  withRat,
  signText,
}: ItemPhotoProps) {
  if (!coverUrl) {
    return (
      <PhotoPlaceholder
        height={height}
        aspectRatio={aspectRatio}
        style={style}
        withRat={withRat}
        signText={signText}
      />
    );
  }

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
      <img
        src={coverUrl}
        alt={alt}
        loading="lazy"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
        }}
      />
    </div>
  );
}
