/**
 * `<ItemCard>` — one item in the grid view. Mirrors the design's
 * editorial layout: numbered index, watercolor photo placeholder, title
 * (sans bold) and price (italic serif) on one row, then maker, note and
 * occasion.
 *
 * The whole card is a `<Link>` to `/i/:itemId` — edit / delete / share
 * live on the detail page (the v2 mockup has no inline actions on the
 * list either).
 */
import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n/useI18n';
import type { MyItem } from '../../items/useMyItems';
import { ItemPhoto } from '../../components/ItemPhoto';
import { OccasionTag } from '../../components/OccasionTag';
import { PriorityDots } from '../../components/PriorityDots';
import type { Occasion } from '../../lib/db';

interface ItemCardProps {
  item: MyItem;
  index: number;
}

export function ItemCard({ item, index }: ItemCardProps) {
  return (
    <Link
      to={`/i/${item.id}`}
      style={{
        position: 'relative',
        textDecoration: 'none',
        color: 'inherit',
        display: 'block',
      }}
    >
      <div style={{ position: 'relative' }}>
        <ItemPhoto coverUrl={item.cover_url} aspectRatio="4 / 3" alt={item.title} />
        {/* index badge top-left */}
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            fontFamily: 'var(--font-display)',
            fontStyle: 'italic',
            fontWeight: 400,
            fontSize: 13,
            color: 'var(--ink)',
            background: 'rgba(250, 246, 239, 0.85)',
            padding: '1px 6px',
            letterSpacing: 0.5,
          }}
        >
          {String(index + 1).padStart(2, '0')}
        </div>
      </div>

      <div style={{ paddingTop: 'var(--s-4)' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 'var(--s-3)',
          }}
        >
          <h3
            style={{
              margin: 0,
              fontFamily: 'var(--font-body)',
              fontWeight: 600,
              fontSize: 15,
              color: 'var(--ink)',
              lineHeight: 1.3,
              flex: 1,
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
                fontSize: 17,
                color: 'var(--accent)',
                whiteSpace: 'nowrap',
              }}
            >
              {item.price_text}
            </div>
          )}
        </div>

        {item.maker && (
          <div style={{ marginTop: 2, fontSize: 12, color: 'var(--ink-3)' }}>
            {item.maker}
          </div>
        )}

        {item.note && (
          <div
            style={{
              marginTop: 'var(--s-2)',
              fontSize: 13,
              color: 'var(--ink-2)',
              lineHeight: 1.45,
            }}
          >
            {item.note}
          </div>
        )}

        <div
          style={{
            marginTop: 'var(--s-3)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--s-3)',
            flexWrap: 'wrap',
          }}
        >
          <OccasionTag kind={item.occasion as Occasion} />
          {/* Skip the default level (2) — only ☆☆☆ / ☆ rows carry a
              marker, so the eye picks them out at a glance. */}
          {item.priority !== 2 && (
            <PriorityDots level={item.priority === 1 ? 1 : 3} />
          )}
          {item.group_ids.length === 0 && <PrivateBadge />}
        </div>
      </div>
    </Link>
  );
}

/** Same pill as in ItemList — duplicated here rather than reaching
 *  cross-file to keep these two row components self-contained. */
function PrivateBadge() {
  const { t } = useI18n();
  return (
    <span
      className="mono-meta"
      style={{
        color: 'var(--ink-3)',
        border: '1px solid var(--hair-strong)',
        padding: '1px 6px',
        borderRadius: 'var(--r-2)',
      }}
    >
      {t('list.privateBadge')}
    </span>
  );
}
