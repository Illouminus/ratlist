/**
 * `<ItemList>` — image-row list of items. Each row is a small photo on
 * the left and a stacked title + maker + note + occasion on the right.
 *
 * The whole row is a `<Link>` to `/i/:itemId` — that's where edit /
 * delete / share live (matches the v2 design, which has no inline
 * actions on the list rows).
 *
 * Layout works the same on mobile and desktop (the row is naturally
 * compact). On desktop it reads more like an editorial inventory than
 * the wide grid; on mobile it replaces the grid entirely.
 */
import { Link } from 'react-router-dom';
import type { MyItem } from '../../items/useMyItems';
import { ItemPhoto } from '../../components/ItemPhoto';
import { OccasionTag } from '../../components/OccasionTag';
import type { Occasion } from '../../lib/db';

interface ItemListProps {
  items: MyItem[];
}

export function ItemList({ items }: ItemListProps) {
  return (
    <div>
      {items.map((item, i) => (
        <ItemRow key={item.id} item={item} index={i} last={i === items.length - 1} />
      ))}
    </div>
  );
}

// ─────────────────────────── row ───────────────────────────

interface ItemRowProps {
  item: MyItem;
  index: number;
  last: boolean;
}

/** Multi-line clamp via the line-clamp / -webkit-box trick. Widely
 *  supported (Firefox added support in 2023). Stable in both Chromium
 *  and Safari for years. */
const CLAMP_2_LINES = {
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical' as const,
  overflow: 'hidden',
} as const;

/** Total reserved height for a row. Calibrated so a row with a 2-line
 *  title and a 2-line note still fits, AND rows with no note look
 *  airy rather than tiny. Keeps the list visually regular. */
const ROW_MIN_HEIGHT = 124;

function ItemRow({ item, index, last }: ItemRowProps) {
  return (
    <Link
      to={`/i/${item.id}`}
      style={{
        position: 'relative',
        padding: 'var(--s-4) 0',
        borderBottom: last ? 'none' : '1px solid var(--hair)',
        display: 'flex',
        gap: 'var(--s-4)',
        minHeight: ROW_MIN_HEIGHT,
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      {/* photo + numbered badge */}
      <div style={{ width: 88, flexShrink: 0, position: 'relative' }}>
        <ItemPhoto coverUrl={item.cover_url} aspectRatio="4 / 3" alt={item.title} />
        <div
          style={{
            position: 'absolute',
            top: 4,
            left: 4,
            fontFamily: 'var(--font-display)',
            fontStyle: 'italic',
            fontWeight: 400,
            fontSize: 11,
            color: 'var(--ink)',
            background: 'rgba(250, 246, 239, 0.85)',
            padding: '0 4px',
            letterSpacing: 0.4,
          }}
          aria-hidden
        >
          {String(index + 1).padStart(2, '0')}
        </div>
      </div>

      {/* content */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 'var(--s-2)',
          }}
        >
          <h3
            style={{
              margin: 0,
              fontFamily: 'var(--font-body)',
              fontWeight: 600,
              fontSize: 14,
              color: 'var(--ink)',
              lineHeight: 1.25,
              flex: 1,
              minWidth: 0,
              ...CLAMP_2_LINES,
            }}
          >
            {item.title}
          </h3>
          {item.price_text && (
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontStyle: 'italic',
                fontWeight: 500,
                fontSize: 16,
                color: 'var(--accent)',
                whiteSpace: 'nowrap',
              }}
            >
              {item.price_text}
            </div>
          )}
        </div>

        {item.maker && (
          <div
            style={{
              marginTop: 2,
              fontSize: 11,
              color: 'var(--ink-3)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {item.maker}
          </div>
        )}

        {item.note && (
          <div
            style={{
              marginTop: 'var(--s-1)',
              fontSize: 12,
              color: 'var(--ink-2)',
              lineHeight: 1.4,
              ...CLAMP_2_LINES,
            }}
          >
            {item.note}
          </div>
        )}

        <div style={{ marginTop: 'auto', paddingTop: 'var(--s-2)' }}>
          <OccasionTag kind={item.occasion as Occasion} />
        </div>
      </div>
    </Link>
  );
}
