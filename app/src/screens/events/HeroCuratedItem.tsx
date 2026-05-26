/**
 * `<HeroCuratedItem>` — large editorial card for the first item of each
 * priority section in `<EventDetailScreen>`. Layout: 200px photo on the
 * left, meta column on the right (title in Newsreader italic, brand line
 * mono-meta, price terracotta italic, FULL note without clamp).
 *
 * Honoree mode: × remove button hover-only on the photo (opacity 0.4
 * always on touch devices since there's no hover).
 * Guest mode: claim/release control under the meta column.
 *
 * The photo opts in to the rat placeholder (`withRat`) — at 200px wide
 * there's plenty of room for the SittingRat with sign to read clearly.
 */
import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n/useI18n';
import { ItemPhoto } from '../../components/ItemPhoto';
import { ClaimControl } from './ClaimControl';
import type { EventClaim } from '../../events/useEvent';

interface HeroCuratedItemEntry {
  item_id: string;
  item: {
    id: string;
    title: string;
    maker: string | null;
    price_text: string | null;
    note: string | null;
    cover_url: string | null;
    priority: number;
    owner_id: string;
  };
  claims: EventClaim[];
}

interface HeroCuratedItemProps {
  entry: HeroCuratedItemEntry;
  isHonoree: boolean;
  myUserId: string | null;
  onDetach: () => void;
  onClaim: () => void;
  onRelease: () => void;
}

export function HeroCuratedItem({
  entry,
  isHonoree,
  myUserId,
  onDetach,
  onClaim,
  onRelease,
}: HeroCuratedItemProps) {
  const { t } = useI18n();
  const { item } = entry;

  const myClaim = entry.claims.find((c) => c.user_id === myUserId) ?? null;
  const othersClaim = entry.claims.find((c) => c.user_id !== myUserId) ?? null;

  return (
    <article
      data-testid="item-hero"
      style={{
        display: 'grid',
        gridTemplateColumns: '200px 1fr',
        gap: 'var(--s-5)',
        padding: 'var(--s-4) 0',
        borderBottom: '1px solid var(--hair)',
        marginBottom: 'var(--s-4)',
      }}
    >
      <div style={{ position: 'relative' }}>
        <Link to={`/i/${item.id}`} style={{ display: 'block' }}>
          <ItemPhoto
            coverUrl={item.cover_url}
            aspectRatio="4 / 3"
            alt={item.title}
            withRat
          />
        </Link>
        {isHonoree && (
          <button
            type="button"
            onClick={onDetach}
            aria-label={t('events.removeItem', { title: item.title })}
            className="hero-detach"
            style={{
              position: 'absolute',
              top: 6,
              right: 6,
              width: 22,
              height: 22,
              borderRadius: '50%',
              border: 'none',
              background: 'rgba(43,38,32,0.6)',
              color: '#fff',
              fontSize: 14,
              lineHeight: 1,
              cursor: 'pointer',
              opacity: 0,
              transition: 'opacity 120ms ease',
            }}
          >
            ×
          </button>
        )}
      </div>

      <div style={{ minWidth: 0 }}>
        <Link
          to={`/i/${item.id}`}
          style={{ color: 'inherit', textDecoration: 'none' }}
        >
          <h3
            style={{
              fontFamily: 'var(--font-display)',
              fontStyle: 'italic',
              fontWeight: 500,
              fontSize: 22,
              lineHeight: 1.15,
              margin: 0,
              color: 'var(--ink)',
            }}
          >
            {item.title}
          </h3>
        </Link>

        {item.maker && (
          <div
            className="mono-meta"
            style={{
              marginTop: 4,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 0.06,
              textTransform: 'uppercase',
              color: 'var(--ink-3)',
            }}
          >
            {item.maker}
          </div>
        )}

        {item.price_text && (
          <div
            style={{
              marginTop: 'var(--s-2)',
              fontFamily: 'var(--font-display)',
              fontStyle: 'italic',
              fontSize: 15,
              color: 'var(--accent)',
            }}
          >
            {item.price_text}
          </div>
        )}

        {item.note && (
          <p
            style={{
              marginTop: 'var(--s-3)',
              fontSize: 13,
              color: 'var(--ink-2)',
              lineHeight: 1.5,
              maxWidth: 480,
            }}
          >
            {item.note}
          </p>
        )}

        {!isHonoree && (
          <div style={{ marginTop: 'var(--s-3)' }}>
            <ClaimControl
              myClaim={myClaim}
              othersClaim={othersClaim}
              onClaim={onClaim}
              onRelease={onRelease}
            />
          </div>
        )}
      </div>

      <style>{`
        article:hover .hero-detach { opacity: 1; }
        @media (pointer: coarse) { .hero-detach { opacity: 0.4 !important; } }
      `}</style>
    </article>
  );
}
