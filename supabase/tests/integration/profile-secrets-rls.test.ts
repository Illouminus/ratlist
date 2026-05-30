import { describe, it, expect, beforeEach } from 'vitest';
import { adminClient, clientFor } from './helpers/client.ts';
import { ensureTestUsers, truncateBetweenTests, TEST_USERS } from './helpers/seed.ts';

/**
 * profile_secrets holds share_token + add_me_token, moved out of `profiles`
 * so the cross-user profile SELECT policies (friends, event co-participants)
 * can never leak a token. Invariant: a user reads ONLY their own secrets row.
 */
describe('profile_secrets: owner-read-only', () => {
  beforeEach(async () => {
    await truncateBetweenTests();
    await ensureTestUsers();
  });

  it('a user reads their own secrets row', async () => {
    const alice = await clientFor(TEST_USERS.alice);
    const { data, error } = await alice
      .from('profile_secrets')
      .select('user_id, share_token, add_me_token')
      .eq('user_id', TEST_USERS.alice)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.user_id).toBe(TEST_USERS.alice);
    expect(typeof data?.add_me_token).toBe('string'); // auto-minted by default
  });

  it("a user CANNOT read another user's secrets row", async () => {
    const alice = await clientFor(TEST_USERS.alice);
    const { data, error } = await alice
      .from('profile_secrets')
      .select('user_id, add_me_token')
      .eq('user_id', TEST_USERS.bob)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeNull(); // RLS hides it entirely
  });

  it('every seeded profile has a secrets row (handle_new_user + backfill)', async () => {
    const admin = adminClient();
    const { data, error } = await admin
      .from('profile_secrets')
      .select('user_id')
      .in('user_id', [TEST_USERS.alice, TEST_USERS.bob, TEST_USERS.carol, TEST_USERS.dave]);
    expect(error).toBeNull();
    expect(data).toHaveLength(4);
  });
});
