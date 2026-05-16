/**
 * `<ItemList>` — tabular layout of items: thumbnail · title+note · maker ·
 * occasion · price. Rows use a CSS grid for crisp alignment.
 */
import { useI18n } from '../../i18n/useI18n';
import type { MyItem } from '../../items/useMyItems';
import { PhotoPlaceholder } from '../../components/PhotoPlaceholder';
import { OccasionTag } from '../../components/OccasionTag';
import type { Occasion } from '../../lib/db';

interface ItemListProps {
  items: MyItem[];
  onDelete: (id: string) => void;
}

const COLUMNS = '54px 1fr 180px 130px 90px 80px';

export function ItemList({ items, onDelete }: ItemListProps) {
  const { t } = useI18n();

  return (
    <div>
      {/* header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: COLUMNS,
          gap: 'var(--s-4)',
          padding: '0 0 var(--s-3)',
          borderBottom: '1px solid var(--hair-strong)',
        }}
      >
        {['', t('list.item'), t('list.maker'), 'occasion', t('list.price'), ''].map((h, i) => (
          <div
            key={i}
            className="mono-meta"
            style={{ fontSize: 10, textAlign: i === 4 ? 'right' : 'left' }}
          >
            {h}
          </div>
        ))}
      </div>

      {items.map((item) => (
        <div
          key={item.id}
          style={{
            display: 'grid',
            gridTemplateColumns: COLUMNS,
            gap: 'var(--s-4)',
            padding: 'var(--s-4) 0',
            alignItems: 'center',
            borderBottom: '1px solid var(--hair)',
          }}
        >
          <div style={{ width: 54, height: 40 }}>
            <PhotoPlaceholder height={40} />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>{item.title}</div>
            {item.note && (
              <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>{item.note}</div>
            )}
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>{item.maker ?? ''}</div>
          <div>
            <OccasionTag kind={item.occasion as Occasion} />
          </div>
          <div
            style={{
              textAlign: 'right',
              fontFamily: 'var(--font-display)',
              fontStyle: 'italic',
              fontWeight: 500,
              fontSize: 16,
              color: 'var(--accent)',
            }}
          >
            {item.price_text ?? ''}
          </div>
          <div style={{ textAlign: 'right' }}>
            <button
              type="button"
              onClick={() => onDelete(item.id)}
              className="mono-meta"
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                color: 'var(--ink-3)',
              }}
            >
              {t('list.crossOff')}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
