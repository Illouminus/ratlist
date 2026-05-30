import { describe, it, expect, beforeEach } from 'vitest';
import { adminClient, clientFor } from './helpers/client.ts';
import { ensureTestUsers, truncateBetweenTests, setShareToken, TEST_USERS } from './helpers/seed.ts';

/**
 * `befriend_via_share` — a logged-in viewer of a `/share/<token>` page can
 * become the owner's mutual friend in one tap. Mirrors `accept_add_me` but
 * keys off `profiles.share_token`. Also covers the new `owner_id` column on
 * `get_public_list`, which the client uses to detect owner-ness and to
 * deep-link once friended.
 */
describe('befriend_via_share', () => {
  beforeEach(async () => {
    await truncateBetweenTests();
    await ensureTestUsers();
  });

  it('inserts a canonical friendship and returns the owner id', async () => {
    const admin = adminClient();
    await setShareToken(TEST_USERS.alice, 'alice_share');
    await admin.from('profiles').update({ disabled_at: null }).eq('id', TEST_USERS.alice);

    const bob = await clientFor(TEST_USERS.bob);
    const { data: ownerId, error } = await bob.rpc('befriend_via_share', {
      _share_token: 'alice_share',
    });
    expect(error).toBeNull();
    expect(ownerId).toBe(TEST_USERS.alice);

    const lo = TEST_USERS.alice < TEST_USERS.bob ? TEST_USERS.alice : TEST_USERS.bob;
    const hi = TEST_USERS.alice < TEST_USERS.bob ? TEST_USERS.bob : TEST_USERS.alice;
    const { data: edge } = await admin
      .from('friendships')
      .select('user_a, user_b')
      .eq('user_a', lo)
      .eq('user_b', hi)
      .maybeSingle();
    expect(edge).not.toBeNull();
  });

  it('is idempotent — befriending an existing friend returns owner id, no error', async () => {
    const admin = adminClient();
    await setShareToken(TEST_USERS.alice, 'alice_share');
    await admin.from('profiles').update({ disabled_at: null }).eq('id', TEST_USERS.alice);
    const lo = TEST_USERS.alice < TEST_USERS.bob ? TEST_USERS.alice : TEST_USERS.bob;
    const hi = TEST_USERS.alice < TEST_USERS.bob ? TEST_USERS.bob : TEST_USERS.alice;
    await admin.from('friendships').insert({ user_a: lo, user_b: hi });

    const bob = await clientFor(TEST_USERS.bob);
    const { data: ownerId, error } = await bob.rpc('befriend_via_share', {
      _share_token: 'alice_share',
    });
    expect(error).toBeNull();
    expect(ownerId).toBe(TEST_USERS.alice);

    // Still exactly one edge.
    const { data: edges } = await admin
      .from('friendships')
      .select('user_a')
      .eq('user_a', lo)
      .eq('user_b', hi);
    expect(edges).toHaveLength(1);
  });

  it('rejects the owner befriending themselves via their own link', async () => {
    const admin = adminClient();
    await setShareToken(TEST_USERS.alice, 'alice_share');
    await admin.from('profiles').update({ disabled_at: null }).eq('id', TEST_USERS.alice);

    const alice = await clientFor(TEST_USERS.alice);
    const { error } = await alice.rpc('befriend_via_share', {
      _share_token: 'alice_share',
    });
    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/self_link/);
  });

  it('rejects an unknown token', async () => {
    const bob = await clientFor(TEST_USERS.bob);
    const { error } = await bob.rpc('befriend_via_share', { _share_token: 'nope' });
    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/invite_not_found/);
  });

  it('refuses a disabled owner (token reads as not found)', async () => {
    const admin = adminClient();
    await setShareToken(TEST_USERS.alice, 'alice_share');
    await admin.from('profiles').update({ disabled_at: new Date().toISOString() }).eq('id', TEST_USERS.alice);

    const bob = await clientFor(TEST_USERS.bob);
    const { error } = await bob.rpc('befriend_via_share', {
      _share_token: 'alice_share',
    });
    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/invite_not_found/);
  });

  it('get_public_list now returns the owner_id column', async () => {
    const admin = adminClient();
    await setShareToken(TEST_USERS.alice, 'alice_share');
    await admin.from('profiles').update({ disabled_at: null }).eq('id', TEST_USERS.alice);

    const anon = await clientFor(null);
    const { data, error } = await anon.rpc('get_public_list', { _token: 'alice_share' });
    expect(error).toBeNull();
    const row = Array.isArray(data) ? data[0] : data;
    expect(row?.owner_id).toBe(TEST_USERS.alice);
  });
});
