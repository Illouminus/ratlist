/**
 * `<TileCuratedItem>` — single curated item on `<EventDetailScreen>`.
 * Responsive: vertical tile (1:1 photo on top, meta below) on desktop;
 * horizontal row (88px photo on the left, meta on the right) on mobile.
 * Layout switching is CSS-only via `.curated-tile` classes in `global.css`.
 *
 * No inline claim affordance — guests click through to `/i/:id` to claim,
 * keeping the grid visually uniform. Priority dot is rendered for
 * non-default priorities (1 = «очень хочу», 3 = «если найдётся») to
 * preserve the signal that the dropped section headers used to carry.
 *
 * Photo opts in to the rat placeholder (`withRat`) — at both tile (≥180px)
 * and row (88px) widths the SittingRat with sign reads cleanly enough.
 */
import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n/useI18n';
import { ItemPhoto } from '../../components/ItemPhoto';
import { PriorityDots } from '../../components/PriorityDots';

interface TileCuratedItemEntry {
  item_id: string;
  item: {
    id: string;
    title: string;
    maker: string | null;
    price_text: string | null;
    note: string | null;
    cover_url: string | null;
    priority: number;
  };
}

interface TileCuratedItemProps {
  entry: TileCuratedItemEntry;
  isHonoree: boolean;
  onDetach: () => void;
}

export function TileCuratedItem({ entry, isHonoree, onDetach }: TileCuratedItemProps) {
  const { t } = useI18n();
  const { item } = entry;
  const showPriorityDot = item.priority === 1 || item.priority === 3;

  return (
    <article data-testid="item-tile" className="curated-tile">
      <Link to={`/i/${item.id}`} className="curated-tile-link">
        <div className="curated-tile-photo">
          <ItemPhoto
            coverUrl={item.cover_url}
            aspectRatio="1 / 1"
            alt={item.title}
            withRat
          />
        </div>
        <div className="curated-tile-meta">
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 13.5,
              fontWeight: 600,
              color: 'var(--ink)',
              lineHeight: 1.3,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {item.title}
          </div>
          {(item.maker || item.price_text) && (
            <div
              className="mono-meta"
              style={{
                marginTop: 3,
                fontSize: 11,
                color: 'var(--ink-3)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {[item.maker, item.price_text].filter(Boolean).join(' · ')}
            </div>
          )}
          {item.note && (
            <div
              style={{
                marginTop: 4,
                fontSize: 12,
                color: 'var(--ink-2)',
                lineHeight: 1.4,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {item.note}
            </div>
          )}
          {showPriorityDot && (
            <div style={{ marginTop: 'var(--s-1)' }}>
              <PriorityDots level={item.priority === 1 ? 1 : 3} />
            </div>
          )}
        </div>
      </Link>

      {isHonoree && (
        <button
          type="button"
          onClick={onDetach}
          aria-label={t('events.removeItem', { title: item.title })}
          className="curated-tile-detach"
        >
          ×
        </button>
      )}
    </article>
  );
}
