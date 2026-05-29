import { describe, it, expect, beforeEach } from 'vitest';
import { adminClient, clientFor } from './helpers/client.ts';
import { ensureTestUsers, truncateBetweenTests, TEST_USERS } from './helpers/seed.ts';

describe('items RLS — 2-state visibility (shared / private)', () => {
  beforeEach(async () => {
    await truncateBetweenTests();
    await ensureTestUsers();
  });

  async function makeFriendship(a: string, b: string) {
    const admin = adminClient();
    await admin.from('friendships').insert({
      user_a: a < b ? a : b,
      user_b: a < b ? b : a,
    });
  }

  it('visibility=private: only owner sees it', async () => {
    const admin = adminClient();
    const { data: it } = await admin.from('items').insert({
      owner_id: TEST_USERS.alice,
      title: 'Secret diary',
      visibility: 'private',
    }).select('id').single();
    await makeFriendship(TEST_USERS.alice, TEST_USERS.bob);

    const alice = await clientFor(TEST_USERS.alice);
    const { data: aliceSees } = await alice.from('items').select('id').eq('id', it!.id);
    expect(aliceSees).toHaveLength(1);

    const bob = await clientFor(TEST_USERS.bob);
    const { data: bobSees } = await bob.from('items').select('id').eq('id', it!.id);
    expect(bobSees).toEqual([]);
  });

  it('visibility=shared: friend sees it in-app, non-friend does not', async () => {
    const admin = adminClient();
    const { data: it } = await admin.from('items').insert({
      owner_id: TEST_USERS.alice,
      title: 'Shared item',
      visibility: 'shared',
    }).select('id').single();
    await makeFriendship(TEST_USERS.alice, TEST_USERS.bob);
    // carol is NOT a friend

    const bob = await clientFor(TEST_USERS.bob);
    const { data: bobSees } = await bob.from('items').select('id').eq('id', it!.id);
    expect(bobSees).toHaveLength(1);

    // A logged-in non-friend does NOT see a shared item in-app. Anonymous /
    // link access is a separate path (get_public_list), covered elsewhere.
    const carol = await clientFor(TEST_USERS.carol);
    const { data: carolSees } = await carol.from('items').select('id').eq('id', it!.id);
    expect(carolSees).toEqual([]);
  });

  it('unfriend removes mutual shared-tier visibility', async () => {
    const admin = adminClient();
    const { data: it } = await admin.from('items').insert({
      owner_id: TEST_USERS.alice,
      title: 'Shared item',
      visibility: 'shared',
    }).select('id').single();
    await makeFriendship(TEST_USERS.alice, TEST_USERS.bob);

    const bob = await clientFor(TEST_USERS.bob);
    const beforeBob = await bob.from('items').select('id').eq('id', it!.id);
    expect(beforeBob.data).toHaveLength(1);

    const alice = await clientFor(TEST_USERS.alice);
    await alice.rpc('unfriend', { _other: TEST_USERS.bob });

    const afterBob = await bob.from('items').select('id').eq('id', it!.id);
    expect(afterBob.data).toEqual([]);
  });

  it('items still writable by owner only', async () => {
    const admin = adminClient();
    const { data: it } = await admin.from('items').insert({
      owner_id: TEST_USERS.alice,
      title: 'Alice owns this',
      visibility: 'shared',
    }).select('id').single();
    await makeFriendship(TEST_USERS.alice, TEST_USERS.bob);

    const bob = await clientFor(TEST_USERS.bob);
    const upd = await bob.from('items').update({ title: 'hacked' }).eq('id', it!.id);
    // RLS may return error or quietly do nothing (0 rows). Either is acceptable.
    // The point: the title must not have changed.
    void upd;
    const { data } = await admin.from('items').select('title').eq('id', it!.id).single();
    expect(data?.title).toBe('Alice owns this');
  });

  it('a friend can claim a shared item, and the owner stays blind', async () => {
    const admin = adminClient();
    const { data: it } = await admin.from('items').insert({
      owner_id: TEST_USERS.alice,
      title: 'Giftable',
      visibility: 'shared',
    }).select('id').single();
    // Friendship only — no shared group. Exercises the can_see_item
    // friendships path added by the visibility collapse, which is what
    // makes "claim a friend's gift" work in the friend-graph model.
    await makeFriendship(TEST_USERS.alice, TEST_USERS.bob);

    const bob = await clientFor(TEST_USERS.bob);
    const { error: claimErr } = await bob
      .from('claims')
      .insert({ item_id: it!.id, user_id: TEST_USERS.bob, share: 100 });
    expect(claimErr).toBeNull();

    const { data: bobSees } = await bob
      .from('claims')
      .select('user_id')
      .eq('item_id', it!.id);
    expect(bobSees).toHaveLength(1);

    // Owner-blind invariant survives the can_see_item change.
    const alice = await clientFor(TEST_USERS.alice);
    const { data: aliceSees } = await alice
      .from('claims')
      .select('user_id')
      .eq('item_id', it!.id);
    expect(aliceSees).toEqual([]);
  });
});
