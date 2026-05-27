// get_public_list — visibility filter + category projection.
//
// Two separate concerns covered here:
//   1. PRIVACY LEAK FIX. After PR 1 added `items.visibility` defaulting
//      to 'friends', the RPC quietly returned `friends`- and `private`-
//      tier items to anonymous share-token visitors. This file asserts
//      only `visibility = 'public'` items are exposed.
//   2. CATEGORY PROJECTION. The `public_item` composite now carries
//      `category`, with an optional case-insensitive `_category` filter.
import { describe, it, expect, beforeEach } from 'vitest';
import { adminClient, clientFor } from './helpers/client.ts';
import { ensureTestUsers, truncateBetweenTests, TEST_USERS } from './helpers/seed.ts';

describe('get_public_list — visibility filter + category', () => {
  beforeEach(async () => {
    await truncateBetweenTests();
    await ensureTestUsers();
  });

  /**
   * Enable sharing for Alice and return her freshly minted share_token.
   * Goes through `set_share_token(true)` so the test exercises the same
   * code path the UI uses (and lets the trigger / sequence behave).
   */
  async function aliceShareToken(): Promise<string> {
    const alice = await clientFor(TEST_USERS.alice);
    const { data, error } = await alice.rpc('set_share_token', { _enabled: true });
    if (error) throw new Error(`set_share_token failed: ${error.message}`);
    if (typeof data !== 'string') throw new Error('set_share_token returned non-string');
    return data;
  }

  it('returns ONLY public items — friends- and private-tier items are hidden', async () => {
    const admin = adminClient();
    // Alice owns three items with the three different visibility levels.
    await admin.from('items').insert([
      { owner_id: TEST_USERS.alice, title: 'Public thing',  visibility: 'public'  },
      { owner_id: TEST_USERS.alice, title: 'Friends thing', visibility: 'friends' },
      { owner_id: TEST_USERS.alice, title: 'Private thing', visibility: 'private' },
    ]);
    const token = await aliceShareToken();

    // Anonymous client (no JWT) — the share URL is supposed to work
    // without auth. `adminClient` is service-role; we want anon here.
    const { createClient } = await import('@supabase/supabase-js');
    const { SUPABASE_URL, ANON_KEY } = await import('./helpers/env.ts');
    const anon = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await anon.rpc('get_public_list', { _token: token });
    expect(error).toBeNull();
    const row = Array.isArray(data) ? data[0] : null;
    expect(row).toBeTruthy();
    const items = (row as { items: Array<{ title: string }> }).items;
    // Privacy fix: exactly one item visible to the anonymous viewer.
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Public thing');
  });

  it('case-insensitive _category filter narrows the result set', async () => {
    const admin = adminClient();
    await admin.from('items').insert([
      { owner_id: TEST_USERS.alice, title: 'Чайник', visibility: 'public', category: 'Кухня' },
      { owner_id: TEST_USERS.alice, title: 'Роман',  visibility: 'public', category: 'Книги' },
    ]);
    const token = await aliceShareToken();
    const { createClient } = await import('@supabase/supabase-js');
    const { SUPABASE_URL, ANON_KEY } = await import('./helpers/env.ts');
    const anon = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // No filter → both items.
    {
      const { data, error } = await anon.rpc('get_public_list', { _token: token });
      expect(error).toBeNull();
      const items = (data as Array<{ items: Array<{ title: string }> }>)[0].items;
      expect(items).toHaveLength(2);
    }

    // _category = null → both items (explicit null behaves like absent).
    {
      const { data, error } = await anon.rpc('get_public_list', {
        _token: token,
        _category: null as unknown as string,
      });
      expect(error).toBeNull();
      const items = (data as Array<{ items: Array<{ title: string }> }>)[0].items;
      expect(items).toHaveLength(2);
    }

    // Exact-case match — only the kitchen item.
    {
      const { data, error } = await anon.rpc('get_public_list', {
        _token: token,
        _category: 'Кухня',
      });
      expect(error).toBeNull();
      const items = (data as Array<{ items: Array<{ title: string }> }>)[0].items;
      expect(items).toHaveLength(1);
      expect(items[0].title).toBe('Чайник');
    }

    // Lowercase variant — must also match (case-insensitive).
    {
      const { data, error } = await anon.rpc('get_public_list', {
        _token: token,
        _category: 'кухня',
      });
      expect(error).toBeNull();
      const items = (data as Array<{ items: Array<{ title: string }> }>)[0].items;
      expect(items).toHaveLength(1);
      expect(items[0].title).toBe('Чайник');
    }
  });

  it('composite payload includes the category field on each row', async () => {
    const admin = adminClient();
    await admin.from('items').insert([
      { owner_id: TEST_USERS.alice, title: 'Чайник',  visibility: 'public', category: 'Кухня' },
      { owner_id: TEST_USERS.alice, title: 'Без полки', visibility: 'public' /* category: null */ },
    ]);
    const token = await aliceShareToken();
    const { createClient } = await import('@supabase/supabase-js');
    const { SUPABASE_URL, ANON_KEY } = await import('./helpers/env.ts');
    const anon = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await anon.rpc('get_public_list', { _token: token });
    expect(error).toBeNull();
    const items = (data as Array<{ items: Array<{ title: string; category: string | null }> }>)[0].items;
    expect(items).toHaveLength(2);
    // Find each by title and verify the category field exists with
    // the expected value — not just truthy, exact equality on both
    // the populated and the null case.
    const kitchen   = items.find((i) => i.title === 'Чайник');
    const uncategorised = items.find((i) => i.title === 'Без полки');
    expect(kitchen).toBeTruthy();
    expect(uncategorised).toBeTruthy();
    expect(kitchen!.category).toBe('Кухня');
    expect(uncategorised!.category).toBeNull();
  });
});
