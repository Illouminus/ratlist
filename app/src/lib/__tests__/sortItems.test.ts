import { describe, it, expect } from 'vitest';
import { sortItems } from '../sortItems';

interface Item {
  id: string;
  priority: number;
  price_text: string | null;
  occasion: string;
}

const items: Item[] = [
  { id: 'a', priority: 3, price_text: '€50',     occasion: 'birthday' },
  { id: 'b', priority: 1, price_text: '€200',    occasion: 'treat'    },
  { id: 'c', priority: 2, price_text: '€10.50',  occasion: 'anytime'  },
  { id: 'd', priority: 2, price_text: null,      occasion: 'holidays' },
  { id: 'e', priority: 1, price_text: '€20',     occasion: 'birthday' },
];

describe('sortItems', () => {
  it('priority: ascending (1 → 2 → 3) — preserves input order on ties', () => {
    const out = sortItems(items, 'priority').map((i) => i.id);
    expect(out).toEqual(['b', 'e', 'c', 'd', 'a']);
  });

  it('price: ascending, items without a price go to the end', () => {
    const out = sortItems(items, 'price').map((i) => i.id);
    // €10.50 → €20 → €50 → €200 → (null, end)
    expect(out).toEqual(['c', 'e', 'a', 'b', 'd']);
  });

  it('category: birthday → holidays → anytime → treat, then by priority', () => {
    const out = sortItems(items, 'category').map((i) => i.id);
    // birthday (e priority 1, a priority 3) → holidays (d) → anytime (c) → treat (b)
    expect(out).toEqual(['e', 'a', 'd', 'c', 'b']);
  });

  it('returns a new array — does not mutate the input', () => {
    const before = items.map((i) => i.id);
    sortItems(items, 'price');
    expect(items.map((i) => i.id)).toEqual(before);
  });

  it('handles bare numbers (the default-EUR case from formatPrice)', () => {
    const data: Item[] = [
      { id: 'x', priority: 2, price_text: '180', occasion: 'anytime' },
      { id: 'y', priority: 2, price_text: '50',  occasion: 'anytime' },
    ];
    expect(sortItems(data, 'price').map((i) => i.id)).toEqual(['y', 'x']);
  });
});
