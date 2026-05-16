/**
 * `<ItemGrid>` — auto-fit grid of `<ItemCard>`s with generous gutters.
 * Narrow viewports collapse to fewer columns; on phones we render
 * `<ItemList>` instead (`MyListScreen` picks the right one).
 */
import type { MyItem } from '../../items/useMyItems';
import { ItemCard } from './ItemCard';
import { RunningRat } from '../../components/rats';

interface ItemGridProps {
  items: MyItem[];
}

export function ItemGrid({ items }: ItemGridProps) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '40px 32px',
        position: 'relative',
      }}
    >
      {items.map((item, i) => (
        <ItemCard key={item.id} item={item} index={i} />
      ))}
      {/* a tiny rat scampering between the cards once the grid has weight */}
      {items.length >= 5 && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: '33%',
            top: '50%',
            transform: 'translate(-50%, 12px)',
            opacity: 0.4,
            pointerEvents: 'none',
          }}
        >
          <RunningRat size={36} />
        </div>
      )}
    </div>
  );
}
