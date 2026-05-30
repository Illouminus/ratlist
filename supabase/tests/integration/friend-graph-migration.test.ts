import { describe, it, expect, beforeEach } from 'vitest';
import { adminClient } from './helpers/client.ts';
import { ensureTestUsers, truncateBetweenTests, TEST_USERS } from './helpers/seed.ts';

describe('data migration — circles → friendships', () => {
  beforeEach(async () => {
    await truncateBetweenTests();
    await ensureTestUsers();
  });

  it('backfills friendships from group_members (pairwise within each group)', async () => {
    const admin = adminClient();
    // Two groups: g1 has alice+bob+carol; g2 has alice+dave.
    const { data: g1 } = await admin.from('groups')
      .insert({ name: 'family', created_by: TEST_USERS.alice }).select('id').single();
    const { data: g2 } = await admin.from('groups')
      .insert({ name: 'work', created_by: TEST_USERS.alice }).select('id').single();
    // groups_bootstrap_admin trigger auto-inserts the creator.
    await admin.from('group_members').insert([
      { group_id: g1!.id, user_id: TEST_USERS.bob,   role: 'member' },
      { group_id: g1!.id, user_id: TEST_USERS.carol, role: 'member' },
      { group_id: g2!.id, user_id: TEST_USERS.dave,  role: 'member' },
    ]);

    // Re-apply backfill (the migration's DO block fired at install; this
    // RPC lets us re-run after truncation in tests).
    await admin.rpc('reapply_friend_backfill');

    // Expected pairs in g1: (alice,bob), (alice,carol), (bob,carol)
    //          in g2: (alice,dave)
    // → 4 unique edges
    const { data: edges } = await admin.from('friendships').select('user_a, user_b');
    expect(edges).toHaveLength(4);

    function hasPair(x: string, y: string): boolean {
      const lo = x < y ? x : y;
      const hi = x < y ? y : x;
      return (edges ?? []).some((e) => e.user_a === lo && e.user_b === hi);
    }
    expect(hasPair(TEST_USERS.alice, TEST_USERS.bob)).toBe(true);
    expect(hasPair(TEST_USERS.alice, TEST_USERS.carol)).toBe(true);
    expect(hasPair(TEST_USERS.bob,   TEST_USERS.carol)).toBe(true);
    expect(hasPair(TEST_USERS.alice, TEST_USERS.dave)).toBe(true);
  });

  it('every profile has a unique, non-empty add_me_token (now in profile_secrets)', async () => {
    const admin = adminClient();
    const { data: rows } = await admin.from('profile_secrets').select('user_id, add_me_token');
    expect(rows!.length).toBeGreaterThanOrEqual(4);
    const tokens = (rows ?? []).map((r) => r.add_me_token as string | null);
    expect(tokens.every((t) => typeof t === 'string' && t.length > 0)).toBe(true);
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it('archive_* tables are present and snapshot the source rows', async () => {
    const admin = adminClient();
    const { data: g } = await admin.from('groups')
      .insert({ name: 'test_archive', created_by: TEST_USERS.alice }).select('id').single();
    await admin.from('group_members').insert({ group_id: g!.id, user_id: TEST_USERS.bob, role: 'member' });
    const { data: it } = await admin.from('items')
      .insert({ owner_id: TEST_USERS.alice, title: 'archive_item' }).select('id').single();
    await admin.from('item_groups').insert({ item_id: it!.id, group_id: g!.id });

    await admin.rpc('reapply_friend_backfill');

    // After re-snapshot the archive tables should reflect current source state.
    const { count: arcGroups } = await admin.from('archive_groups')
      .select('id', { count: 'exact', head: true });
    const { count: arcMembers } = await admin.from('archive_group_members')
      .select('user_id', { count: 'exact', head: true });
    const { count: arcItemGroups } = await admin.from('archive_item_groups')
      .select('item_id', { count: 'exact', head: true });

    expect(arcGroups).toBeGreaterThanOrEqual(1);
    expect(arcMembers).toBeGreaterThanOrEqual(2);  // alice (admin auto-add) + bob
    expect(arcItemGroups).toBeGreaterThanOrEqual(1);
  });
});
