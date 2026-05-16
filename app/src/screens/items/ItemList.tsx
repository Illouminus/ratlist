/**
 * `<ItemList>` — image-row list of items. Each row is a small photo on
 * the left and a stacked title + maker + note + occasion + actions on
 * the right.
 *
 * Layout works the same on mobile and desktop (the row is naturally
 * compact). On desktop it reads more like an editorial inventory than
 * the wide grid; on mobile it replaces the grid entirely (the user
 * shouldn't see 240px-wide cards crammed into a 375px viewport).
 */
import { useI18n } from '../../i18n/useI18n';
import type { MyItem } from '../../items/useMyItems';
import { ItemPhoto } from '../../components/ItemPhoto';
import { OccasionTag } from '../../components/OccasionTag';
import type { Occasion } from '../../lib/db';

interface ItemListProps {
  items: MyItem[];
  onEdit: (item: MyItem) => void;
  onDelete: (id: string) => void;
}

export function ItemList({ items, onEdit, onDelete }: ItemListProps) {
  return (
    <div>
      {items.map((item, i) => (
        <ItemRow
          key={item.id}
          item={item}
          index={i}
          onEdit={() => onEdit(item)}
          onDelete={() => onDelete(item.id)}
          last={i === items.length - 1}
        />
      ))}
    </div>
  );
}

// ─────────────────────────── row ───────────────────────────

interface ItemRowProps {
  item: MyItem;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
  last: boolean;
}

function ItemRow({ item, index, onEdit, onDelete, last }: ItemRowProps) {
  const { t } = useI18n();

  return (
    <div
      style={{
        position: 'relative',
        padding: 'var(--s-4) 0',
        borderBottom: last ? 'none' : '1px solid var(--hair)',
        display: 'flex',
        gap: 'var(--s-4)',
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
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
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
          <div style={{ marginTop: 2, fontSize: 11, color: 'var(--ink-3)' }}>
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
            }}
          >
            {item.note}
          </div>
        )}

        <div
          style={{
            marginTop: 'var(--s-2)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 'var(--s-3)',
          }}
        >
          <OccasionTag kind={item.occasion as Occasion} />
          <div style={{ display: 'flex', gap: 'var(--s-3)' }}>
            <RowAction onClick={onEdit}>{t('list.edit')}</RowAction>
            <RowAction onClick={onDelete}>{t('list.crossOff')}</RowAction>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── action ───────────────────────────

interface RowActionProps {
  onClick: () => void;
  children: React.ReactNode;
}

function RowAction({ onClick, children }: RowActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mono-meta"
      style={{
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        color: 'var(--ink-3)',
      }}
    >
      {children}
    </button>
  );
}
