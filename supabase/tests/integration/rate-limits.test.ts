import { describe, it, expect, beforeEach } from 'vitest';
import { adminClient, clientFor } from './helpers/client.ts';
import { ensureTestUsers, truncateBetweenTests, TEST_USERS } from './helpers/seed.ts';

/**
 * Per-user sliding-window rate limits — `enforce_rate_limit` called from
 * BEFORE INSERT triggers on items / friend_invites / reports.
 *
 * The friend-invite surface has the lowest limit (10/hour) so it's the
 * cheapest way to exercise the shared helper end-to-end. `auth.uid()` is
 * null for the service_role, so admin/seed inserts must stay unrestricted
 * (otherwise the seed itself would start tripping limits).
 */
describe('rate limits', () => {
  beforeEach(async () => {
    await truncateBetweenTests();
    await ensureTestUsers();
  });

  it('blocks the 11th friend invite in the window (10/hour) with rate_limited', async () => {
    const alice = await clientFor(TEST_USERS.alice);
    for (let i = 0; i < 10; i++) {
      const { error } = await alice.rpc('create_friend_invite', {
        _email: `rl${i}@test.local`,
      });
      expect(error).toBeNull();
    }
    const { error: blocked } = await alice.rpc('create_friend_invite', {
      _email: 'rl10@test.local',
    });
    expect(blocked).not.toBeNull();
    expect(blocked?.message).toContain('rate_limited');
  });

  it('does not limit the service_role (auth.uid() is null) — seed/admin stay free', async () => {
    const admin = adminClient();
    const rows = Array.from({ length: 12 }, (_, i) => ({
      token: `rl-admin-${i}`,
      from_user: TEST_USERS.alice,
      to_email: `rladmin${i}@test.local`,
    }));
    const { error } = await admin.from('friend_invites').insert(rows);
    expect(error).toBeNull();
  });

  it('lets a normal item insert through — no false positive on the trigger', async () => {
    const alice = await clientFor(TEST_USERS.alice);
    const { error } = await alice
      .from('items')
      .insert({ owner_id: TEST_USERS.alice, title: 'Within the limit' });
    expect(error).toBeNull();
  });
});
