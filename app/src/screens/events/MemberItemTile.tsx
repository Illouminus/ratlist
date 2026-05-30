/**
 * `<MemberItemTile>` — one of a co-participant's shared items on
 * `<EventMemberListScreen>`. Read-only; the single action is "copy to my
 * list" (no claim — you're not gifting this person in this event, you're
 * grabbing an idea for yourself). Reuses the `.curated-tile` layout.
 */
import { ItemPhoto } from '../../components/ItemPhoto';
import { PriorityDots } from '../../components/PriorityDots';
import { formatPrice } from '../../lib/formatPrice';
import { useI18n } from '../../i18n/useI18n';
import type { Item } from '../../lib/db';

interface MemberItemTileProps {
  item: Item;
  onCopy: () => void;
}

export function MemberItemTile({ item, onCopy }: MemberItemTileProps) {
  const { t } = useI18n();
  return (
    <article data-testid="member-item-tile" className="curated-tile">
      <div className="curated-tile-photo">
        <ItemPhoto coverUrl={item.cover_url} aspectRatio="1 / 1" alt={item.title} withRat />
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
        <div style={{ marginTop: 'var(--s-2)' }}>
          <button
            type="button"
            onClick={onCopy}
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
            {t('item.copy')}
          </button>
        </div>
      </div>
    </article>
  );
}
