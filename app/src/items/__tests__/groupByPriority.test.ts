import { describe, it, expect } from 'vitest';
import { groupByPriority } from '../groupByPriority';

interface Stub { id: string; priority: number; }

describe('groupByPriority', () => {
  it('returns three sections in level order [1, 2, 3]', () => {
    const sections = groupByPriority<Stub>([]);
    expect(sections).toHaveLength(3);
    expect(sections[0]!.level).toBe(1);
    expect(sections[1]!.level).toBe(2);
    expect(sections[2]!.level).toBe(3);
  });

  it('returns empty buckets when input is empty', () => {
    const sections = groupByPriority<Stub>([]);
    expect(sections[0]!.items).toEqual([]);
    expect(sections[1]!.items).toEqual([]);
    expect(sections[2]!.items).toEqual([]);
  });

  it('buckets items by priority value', () => {
    const items: Stub[] = [
      { id: 'a', priority: 1 },
      { id: 'b', priority: 2 },
      { id: 'c', priority: 3 },
      { id: 'd', priority: 1 },
    ];
    const [high, mid, low] = groupByPriority(items);
    expect(high!.items.map((i) => i.id)).toEqual(['a', 'd']);
    expect(mid!.items.map((i) => i.id)).toEqual(['b']);
    expect(low!.items.map((i) => i.id)).toEqual(['c']);
  });

  it('preserves within-section order from input', () => {
    const items: Stub[] = [
      { id: '3', priority: 2 },
      { id: '1', priority: 2 },
      { id: '2', priority: 2 },
    ];
    const [, mid] = groupByPriority(items);
    expect(mid!.items.map((i) => i.id)).toEqual(['3', '1', '2']);
  });

  it('coerces out-of-range priority to level 2 (defensive)', () => {
    const items: Stub[] = [
      { id: 'x', priority: 0 },
      { id: 'y', priority: 7 },
    ];
    const [, mid] = groupByPriority(items);
    expect(mid!.items.map((i) => i.id)).toEqual(['x', 'y']);
  });
});
