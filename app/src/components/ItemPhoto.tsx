/**
 * `<ItemPhoto>` — renders an uploaded cover image, or falls back to the
 * watercolour `<PhotoPlaceholder>` when none is set. Single component
 * used by card / list / friend view so swapping placeholder ↔ real photo
 * stays consistent.
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
}

export function ItemPhoto({ coverUrl, height, aspectRatio, alt = '', style }: ItemPhotoProps) {
  if (!coverUrl) {
    return <PhotoPlaceholder height={height} aspectRatio={aspectRatio} style={style} />;
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
