import { describe, it, expect, beforeEach } from 'vitest';
import { adminClient, clientFor } from './helpers/client.ts';
import { ensureTestUsers, truncateBetweenTests, TEST_USERS } from './helpers/seed.ts';

describe('items RLS — 3-state visibility', () => {
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

  it('visibility=friends: friend sees, non-friend does not', async () => {
    const admin = adminClient();
    const { data: it } = await admin.from('items').insert({
      owner_id: TEST_USERS.alice,
      title: 'Friends-tier',
      visibility: 'friends',
    }).select('id').single();
    await makeFriendship(TEST_USERS.alice, TEST_USERS.bob);
    // carol is NOT a friend

    const bob = await clientFor(TEST_USERS.bob);
    const { data: bobSees } = await bob.from('items').select('id').eq('id', it!.id);
    expect(bobSees).toHaveLength(1);

    const carol = await clientFor(TEST_USERS.carol);
    const { data: carolSees } = await carol.from('items').select('id').eq('id', it!.id);
    expect(carolSees).toEqual([]);
  });

  it('visibility=public: everyone authed sees it', async () => {
    const admin = adminClient();
    const { data: it } = await admin.from('items').insert({
      owner_id: TEST_USERS.alice,
      title: 'Public',
      visibility: 'public',
    }).select('id').single();
    // No friendships set up.

    const carol = await clientFor(TEST_USERS.carol);
    const { data: carolSees } = await carol.from('items').select('id').eq('id', it!.id);
    expect(carolSees).toHaveLength(1);
  });

  it('unfriend removes mutual friends-tier visibility', async () => {
    const admin = adminClient();
    const { data: it } = await admin.from('items').insert({
      owner_id: TEST_USERS.alice,
      title: 'Friends-tier',
      visibility: 'friends',
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
      visibility: 'friends',
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
});
