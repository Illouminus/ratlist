/**
 * `groupByPriority` — bucket a list of items into three fixed sections by
 * priority level (1 = «очень хочу», 2 = «хочу», 3 = «если найдётся»). Returns
 * a deterministic 3-tuple in display order so callers can destructure as
 * `const [high, mid, low] = groupByPriority(items)` without worrying about
 * key ordering.
 *
 * Items keep their incoming order within each section — the caller is
 * responsible for sort (typically `created_at desc` upstream).
 *
 * Pure / no React / no side effects.
 */
export type PriorityLevel = 1 | 2 | 3;

export interface PrioritySection<T extends { priority: number }> {
  level: PriorityLevel;
  items: T[];
}

export function groupByPriority<T extends { priority: number }>(
  items: readonly T[],
): readonly [PrioritySection<T>, PrioritySection<T>, PrioritySection<T>] {
  const buckets: Record<PriorityLevel, T[]> = { 1: [], 2: [], 3: [] };
  for (const item of items) {
    // DB has a CHECK constraint guaranteeing 1..3, but the type system
    // can't see it through PostgrestResponse — coerce anything else to 2
    // (the DB default) so we never silently drop a row.
    const lvl: PriorityLevel = item.priority === 1 || item.priority === 3 ? item.priority : 2;
    buckets[lvl].push(item);
  }
  return [
    { level: 1, items: buckets[1] },
    { level: 2, items: buckets[2] },
    { level: 3, items: buckets[3] },
  ] as const;
}
