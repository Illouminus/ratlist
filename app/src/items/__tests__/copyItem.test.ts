import { describe, it, expect } from 'vitest';
import { buildCopyInput } from '../useMyItems';
import type { Item } from '../../lib/db';

describe('buildCopyInput', () => {
  it('maps a source item to a create input, forcing shared visibility + no groups', () => {
    const source = {
      id: 'x',
      owner_id: 'someone',
      title: 'Nice Kettle',
      maker: 'Hario',
      url: 'https://shop/kettle',
      price_text: '€40',
      occasion: 'birthday',
      note: 'the 1L one',
      priority: 1,
      cover_url: 'https://cdn/abc.jpg',
      category: 'kitchen',
      visibility: 'shared',
      status: 'active',
      created_at: '',
      updated_at: '',
    } as Item;

    expect(buildCopyInput(source)).toEqual({
      title: 'Nice Kettle',
      maker: 'Hario',
      url: 'https://shop/kettle',
      price_text: '€40',
      occasion: 'birthday',
      note: 'the 1L one',
      priority: 1,
      cover_url: 'https://cdn/abc.jpg',
      category: 'kitchen',
      visibility: 'shared',
      group_ids: [],
    });
  });

  it('truncates an over-long title to 200 chars', () => {
    const source = { title: 'a'.repeat(250), occasion: 'anytime' } as Item;
    expect(buildCopyInput(source).title.length).toBe(200);
  });
});
