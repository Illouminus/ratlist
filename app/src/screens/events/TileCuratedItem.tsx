/**
 * `<TileCuratedItem>` — compact tile for items 2..N in each priority
 * section of `<EventDetailScreen>`. Square photo + title (2-line clamp)
 * + price. No brand, no note, no inline claim button — guests click
 * through to `/i/:itemId` to claim. The hero card per section carries
 * the full meta; tiles are scannable previews.
 *
 * Photo opts in to the rat placeholder (`withRat`) — at the typical
 * tile width (~140px) the rat with sign is still readable.
 */
import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n/useI18n';
import { ItemPhoto } from '../../components/ItemPhoto';

interface TileCuratedItemEntry {
  item_id: string;
  item: {
    id: string;
    title: string;
    price_text: string | null;
    note: string | null;
    cover_url: string | null;
    priority: number;
  };
}

interface TileCuratedItemProps {
  entry: TileCuratedItemEntry;
  isHonoree: boolean;
  myUserId: string | null;
  onDetach: () => void;
}

export function TileCuratedItem({
  entry,
  isHonoree,
  onDetach,
}: TileCuratedItemProps) {
  const { t } = useI18n();
  const { item } = entry;

  return (
    <article data-testid="item-tile" style={{ position: 'relative' }}>
      <Link
        to={`/i/${item.id}`}
        style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}
      >
        <ItemPhoto
          coverUrl={item.cover_url}
          aspectRatio="1 / 1"
          alt={item.title}
          withRat
        />
        <div
          style={{
            marginTop: 'var(--s-2)',
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            fontWeight: 500,
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
        {item.price_text && (
          <div
            style={{
              marginTop: 2,
              fontFamily: 'var(--font-display)',
              fontStyle: 'italic',
              fontSize: 12,
              color: 'var(--accent)',
            }}
          >
            {item.price_text}
          </div>
        )}
        {/* Owner's note on the tile — 1-line clamp so it stays compact
            but the «прикольный коммент» isn't hidden behind a click-through.
            Hero renders the full untruncated note; tile shows just the
            first line as a teaser. */}
        {item.note && (
          <div
            style={{
              marginTop: 4,
              fontSize: 11,
              color: 'var(--ink-2)',
              lineHeight: 1.4,
              display: '-webkit-box',
              WebkitLineClamp: 1,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {item.note}
          </div>
        )}
      </Link>

      {isHonoree && (
        <button
          type="button"
          onClick={onDetach}
          aria-label={t('events.removeItem', { title: item.title })}
          className="tile-detach"
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            width: 18,
            height: 18,
            borderRadius: '50%',
            border: 'none',
            background: 'rgba(43,38,32,0.55)',
            color: '#fff',
            fontSize: 11,
            lineHeight: 1,
            cursor: 'pointer',
            opacity: 0,
            transition: 'opacity 120ms ease',
          }}
        >
          ×
        </button>
      )}

      <style>{`
        article:hover .tile-detach { opacity: 1; }
        @media (pointer: coarse) { .tile-detach { opacity: 0.4 !important; } }
      `}</style>
    </article>
  );
}
