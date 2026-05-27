/**
 * `<PriorityDots level>` — a row of 1..3 dots indicating wishlist
 * priority. Mirrors the chip label in ItemForm so users learn the
 * convention quickly: more dots = wants it more.
 *
 *   level 1 (really want)        →  • • •
 *   level 2 (would love it)      →  • •
 *   level 3 (if you happen to)   →  •
 *
 * Used in three places: the form chip, ItemList rows, ItemCard
 * grid cells. Kept as a tiny component so all three stay in sync.
 *
 * `muted` flips the colour to the secondary ink — handy inside an
 * inactive chip where the dots should sit behind the chip border.
 */
type Level = 1 | 2 | 3;

export interface PriorityDotsProps {
  level: Level;
  /** Dim the dots (e.g. inactive chip background, default rows). */
  muted?: boolean;
  /** Override the dot size in px. Default 4. */
  size?: number;
}

export function PriorityDots({ level, muted, size = 4 }: PriorityDotsProps) {
  const filled = level === 1 ? 3 : level === 2 ? 2 : 1;
  const color = muted ? 'var(--ink-3)' : 'var(--accent)';

  return (
    <span
      aria-hidden
      data-testid="priority-dots"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
      }}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            background: i < filled ? color : 'transparent',
            // Hollow dots for "not filled" slots keep the visual width
            // stable across levels — otherwise a level-1 row would
            // look narrower than a level-3 row in a column of rows.
            boxShadow: i < filled ? 'none' : `inset 0 0 0 1px var(--hair-strong)`,
          }}
        />
      ))}
    </span>
  );
}
