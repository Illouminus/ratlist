/**
 * `<Avatar>` — round profile picture with an initial-letter fallback.
 *
 * Renders the uploaded `avatarUrl` when present, otherwise a circular badge
 * with the first letter of `name` in the accent wash — the same treatment
 * the sidebar profile chip uses. Decorative by default (`aria-hidden`),
 * since the person's name is always shown as text right next to it.
 *
 * Pass `name` as whatever label the row actually displays (e.g.
 * `handle ?? display_name`) so the fallback initial matches the headline.
 */
import { useState, type CSSProperties } from 'react';

interface AvatarProps {
  avatarUrl: string | null;
  name: string;
  /** Diameter in px. Default 40. */
  size?: number;
}

export function Avatar({ avatarUrl, name, size = 40 }: AvatarProps) {
  // A stored URL can 404 (object deleted from Storage, transient CDN miss) —
  // fall back to the initial badge instead of the browser's broken-image icon.
  // List callers key by user id, so `failed` never leaks across people.
  const [failed, setFailed] = useState(false);

  const base: CSSProperties = {
    width: size,
    height: size,
    flexShrink: 0,
    borderRadius: '50%',
    boxShadow: 'inset 0 0 0 1px var(--hair-strong)',
  };

  if (avatarUrl && !failed) {
    return (
      <img
        src={avatarUrl}
        alt=""
        width={size}
        height={size}
        aria-hidden
        onError={() => setFailed(true)}
        style={{ ...base, objectFit: 'cover', display: 'block' }}
      />
    );
  }

  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <span
      aria-hidden
      style={{
        ...base,
        background: 'var(--accent-wash)',
        color: 'var(--ink)',
        display: 'grid',
        placeItems: 'center',
        fontFamily: 'var(--font-display)',
        fontStyle: 'italic',
        fontWeight: 500,
        fontSize: Math.round(size * 0.45),
      }}
    >
      {initial}
    </span>
  );
}
