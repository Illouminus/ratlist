/**
 * `<ItemCard>` — one item in the grid view. Mirrors the design's
 * editorial layout: numbered index, watercolor photo placeholder, title
 * (sans bold) and price (italic serif) on one row, then maker, note and
 * occasion. Cross-off action appears on hover.
 */
import { useState } from 'react';
import { useI18n } from '../../i18n/useI18n';
import type { MyItem } from '../../items/useMyItems';
import { ItemPhoto } from '../../components/ItemPhoto';
import { OccasionTag } from '../../components/OccasionTag';
import type { Occasion } from '../../lib/db';

interface ItemCardProps {
  item: MyItem;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
}

export function ItemCard({ item, index, onEdit, onDelete }: ItemCardProps) {
  const { t } = useI18n();
  const [hover, setHover] = useState(false);

  return (
    <article
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ position: 'relative' }}
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
            justifyContent: 'space-between',
          }}
        >
          <OccasionTag kind={item.occasion as Occasion} />
          <div
            style={{
              display: 'flex',
              gap: 'var(--s-3)',
              opacity: hover ? 1 : 0,
              transition: 'opacity var(--motion-fast) ease-out',
            }}
          >
            <CardAction onClick={onEdit}>{t('list.edit')}</CardAction>
            <CardAction onClick={onDelete}>{t('list.crossOff')}</CardAction>
          </div>
        </div>
      </div>
    </article>
  );
}

// ─────────────────────────── action ───────────────────────────

interface CardActionProps {
  onClick: () => void;
  children: React.ReactNode;
}

/** Small uppercase text button used for the hover actions on a card. */
function CardAction({ onClick, children }: CardActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        fontFamily: 'var(--font-body)',
        fontSize: 11,
        fontWeight: 500,
        color: 'var(--ink-3)',
        letterSpacing: 0.06,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </button>
  );
}
