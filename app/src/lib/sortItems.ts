/**
 * `sortItems()` — apply the user-chosen `SortMode` to a list of items.
 * Used by MyList, FriendList, PublicList to render either the
 * historical priority-grouped layout or a flat priced / categorised
 * order.
 *
 * The function is stable (uses `Array.prototype.sort` on a copy and
 * the comparators only break ties on the next field), so two items
 * that share a key keep their input order — useful when the data
 * source already has a meaningful secondary order (recent-first).
 */
import type { Occasion } from './db';

export type { SortMode } from './useSortMode';
import type { SortMode } from './useSortMode';

interface SortableItem {
  priority: number;
  price_text: string | null;
  occasion: string;
}

/** Visual order for the «category» sort: birthday → holidays → anytime → treat. */
const OCCASION_ORDER: Record<Occasion, number> = {
  birthday: 0,
  holidays: 1,
  anytime: 2,
  treat: 3,
};

export function sortItems<T extends SortableItem>(items: ReadonlyArray<T>, mode: SortMode): T[] {
  const copy = items.slice();
  switch (mode) {
    case 'priority':
      return copy.sort((a, b) => a.priority - b.priority);
    case 'price':
      return copy.sort((a, b) => {
        const pa = priceAsNumber(a.price_text);
        const pb = priceAsNumber(b.price_text);
        if (pa !== pb) return pa - pb;
        return a.priority - b.priority;
      });
    case 'category':
      return copy.sort((a, b) => {
        const ao = OCCASION_ORDER[a.occasion as Occasion] ?? 99;
        const bo = OCCASION_ORDER[b.occasion as Occasion] ?? 99;
        if (ao !== bo) return ao - bo;
        return a.priority - b.priority;
      });
  }
}

/**
 * Extract the first numeric token in a price string and parse it as a
 * float. Items without a price, or with free text only, sort to the
 * end (returning `Number.POSITIVE_INFINITY`). Handles both `.` and
 * `,` as decimal — same heuristic as `formatPrice`.
 */
function priceAsNumber(raw: string | null): number {
  if (!raw) return Number.POSITIVE_INFINITY;
  const match = raw.match(/[\d.,]+/);
  if (!match) return Number.POSITIVE_INFINITY;
  const s = match[0];
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let normalized: string;
  if (lastDot === -1 && lastComma === -1) {
    normalized = s;
  } else if (lastDot > lastComma) {
    normalized = s.replace(/,/g, '');
  } else {
    normalized = s.replace(/\./g, '').replace(',', '.');
  }
  const num = parseFloat(normalized);
  return Number.isFinite(num) ? num : Number.POSITIVE_INFINITY;
}
