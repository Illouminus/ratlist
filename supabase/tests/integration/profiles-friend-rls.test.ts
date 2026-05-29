import { describe, it, expect, beforeEach } from 'vitest';
import { adminClient, clientFor } from './helpers/client.ts';
import { ensureTestUsers, truncateBetweenTests, TEST_USERS } from './helpers/seed.ts';

/**
 * profiles SELECT RLS — friend-graph friends can read each other's profiles.
 *
 * Regression guard for the prod bug where `/p/:id` showed "something went
 * wrong" + a blank avatar: the init policy only covered self + group-mates,
 * so a pure friend-graph friend's direct profile SELECT returned no rows.
 *
 * Uses ensureTestUsers (NOT seedFresh) so there's no shared group — that
 * isolates the friendship path from the group-mate path (otherwise carol,
 * a group-mate in the seed, could read bob via the group policy).
 */
describe('profiles: friends can read each other', () => {
  beforeEach(async () => {
    await truncateBetweenTests();
    await ensureTestUsers();
  });

  it('a friend reads the other friend profile; a non-friend gets nothing', async () => {
    const admin = adminClient();
    const lo = TEST_USERS.alice < TEST_USERS.bob ? TEST_USERS.alice : TEST_USERS.bob;
    const hi = TEST_USERS.alice < TEST_USERS.bob ? TEST_USERS.bob : TEST_USERS.alice;
    await admin.from('friendships').insert({ user_a: lo, user_b: hi });

    // alice (friend of bob) can read bob's profile incl. avatar.
    const alice = await clientFor(TEST_USERS.alice);
    const { data: bobProfile, error } = await alice
      .from('profiles')
      .select('id, display_name, avatar_url')
      .eq('id', TEST_USERS.bob)
      .maybeSingle();
    expect(error).toBeNull();
    expect(bobProfile?.id).toBe(TEST_USERS.bob);

    // carol (not a friend, no shared group) is hidden from bob's profile.
    const carol = await clientFor(TEST_USERS.carol);
    const { data: hidden } = await carol
      .from('profiles')
      .select('id')
      .eq('id', TEST_USERS.bob)
      .maybeSingle();
    expect(hidden).toBeNull();
  });
});
