/**
 * `<TileCuratedItem>` — single curated item on `<EventDetailScreen>`.
 * Responsive: vertical tile (1:1 photo on top, meta below) on desktop;
 * horizontal row (88px photo on the left, meta on the right) on mobile.
 * Layout switching is CSS-only via `.curated-tile` classes in `global.css`.
 *
 * Guests get an inline claim affordance under the meta (the `<ClaimControl>`
 * below) — restored after PR #31 dropped it on the false premise that
 * `/i/:id` carried claim (it never did; claim only ever lived on the friend
 * list). Honorees can't claim their own items, so they see the detach × in
 * the corner instead. Claim privacy stays RLS-enforced: the honoree never
 * receives a claim row, so `entry.claims` is always [] for them.
 *
 * Priority dot is rendered for every level (1 = «очень хочу», 3 = «если
 * найдётся», 2 = «хочу») to preserve the signal the dropped section headers
 * used to carry.
 *
 * Photo opts in to the rat placeholder (`withRat`) — at both tile (≥180px)
 * and row (88px) widths the SittingRat with sign reads cleanly enough.
 */
import type { MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n/useI18n';
import { ItemPhoto } from '../../components/ItemPhoto';
import { PriorityDots } from '../../components/PriorityDots';
import { formatPrice } from '../../lib/formatPrice';
import type { EventClaim } from '../../events/useEvent';

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
  /** Claims visible to the viewer. Always [] for the honoree (RLS gate). */
  claims: EventClaim[];
}

interface TileCuratedItemProps {
  entry: TileCuratedItemEntry;
  isHonoree: boolean;
  /** Current viewer's id — used to split my-claim from someone-else's. */
  myUserId: string | null;
  onDetach: () => void;
  onClaim: () => void;
  onRelease: () => void;
}

export function TileCuratedItem({
  entry,
  isHonoree,
  myUserId,
  onDetach,
  onClaim,
  onRelease,
}: TileCuratedItemProps) {
  const { t } = useI18n();
  const { item, claims } = entry;
  const myClaim = myUserId ? claims.find((c) => c.user_id === myUserId) ?? null : null;
  const othersClaim = claims.find((c) => c.user_id !== myUserId) ?? null;

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
              {[item.maker, formatPrice(item.price_text)].filter(Boolean).join(' · ')}
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
          <div style={{ marginTop: 'var(--s-1)' }}>
            <PriorityDots level={item.priority === 1 ? 1 : item.priority === 3 ? 3 : 2} />
          </div>
          {!isHonoree && (
            <div style={{ marginTop: 'var(--s-2)' }}>
              <ClaimControl
                myClaim={myClaim}
                othersClaim={othersClaim}
                onClaim={onClaim}
                onRelease={onRelease}
              />
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

// ─────────────────────────── claim control ───────────────────────────

interface ClaimControlProps {
  myClaim: EventClaim | null;
  othersClaim: EventClaim | null;
  onClaim: () => void;
  onRelease: () => void;
}

/**
 * Three states: nobody claimed → «я возьму» button; I claimed → «ты берёшь ✓»
 * + release; someone else claimed → their name (no button). The tile body is
 * a `<Link>`, so the buttons `intercept` the click to avoid also navigating
 * to `/i/:id` — same pattern as the friend-list claim control.
 */
function ClaimControl({ myClaim, othersClaim, onClaim, onRelease }: ClaimControlProps) {
  const { t } = useI18n();

  function intercept(handler: () => void) {
    return (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      handler();
    };
  }

  if (myClaim) {
    return (
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--s-2)' }}>
        <span
          className="marginalia"
          style={{
            fontSize: 13,
            color: 'var(--accent)',
            transform: 'rotate(-1deg)',
            whiteSpace: 'nowrap',
          }}
        >
          {t('friend.youClaim')} ✓
        </span>
        <button
          type="button"
          onClick={intercept(onRelease)}
          className="mono-meta"
          style={{
            background: 'transparent',
            border: 'none',
            padding: 0,
            color: 'var(--ink-3)',
            cursor: 'pointer',
          }}
        >
          {t('friend.release')}
        </button>
      </div>
    );
  }

  if (othersClaim) {
    return (
      <span
        className="marginalia"
        style={{
          fontSize: 13,
          color: 'var(--ink-3)',
          transform: 'rotate(-2deg)',
          display: 'inline-block',
          whiteSpace: 'nowrap',
        }}
      >
        {t('friend.claimedBy', { name: othersClaim.user.display_name })}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={intercept(onClaim)}
      style={{
        background: 'transparent',
        border: '1px solid var(--ink)',
        padding: '4px 10px',
        borderRadius: 'var(--r-1)',
        cursor: 'pointer',
        fontFamily: 'var(--font-body)',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--ink)',
        whiteSpace: 'nowrap',
      }}
    >
      {t('friend.claim')}
    </button>
  );
}
