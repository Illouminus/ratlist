import { describe, it, expect, beforeEach } from 'vitest';
import { adminClient, clientFor } from './helpers/client.ts';
import { ensureTestUsers, truncateBetweenTests, TEST_USERS } from './helpers/seed.ts';

/**
 * get_coparticipant_list(member_id): a co-participant of a shared event can
 * read another member's SHARED items (for "grab an idea"). Invariants:
 *   - only SHARED items, never private;
 *   - the honoree (not in event_participants) can also browse a participant;
 *   - a PENDING participant is NOT yet a co-participant → zero rows.
 * No claims are returned — the only action on a co-participant's list is copy.
 *
 * Topology: alice = honoree. bob + carol = active participants. dave = pending.
 * carol owns 1 shared item + 1 private item.
 */
describe('get_coparticipant_list', () => {
  beforeEach(async () => {
    await truncateBetweenTests();
    await ensureTestUsers();
    const admin = adminClient();
    const { data: ev } = await admin
      .from('events')
      .insert({ honoree_id: TEST_USERS.alice, title: 'party' })
      .select('id')
      .single();
    await admin.from('event_participants').insert([
      { event_id: ev!.id, user_id: TEST_USERS.bob, status: 'active', joined_at: new Date().toISOString() },
      { event_id: ev!.id, user_id: TEST_USERS.carol, status: 'active', joined_at: new Date().toISOString() },
      { event_id: ev!.id, user_id: TEST_USERS.dave, status: 'pending', invited_by: TEST_USERS.alice, invited_at: new Date().toISOString() },
    ]);
    await admin.from('items').insert([
      { owner_id: TEST_USERS.carol, title: 'carol shared', visibility: 'shared', status: 'active' },
      { owner_id: TEST_USERS.carol, title: 'carol secret', visibility: 'private', status: 'active' },
    ]);
  });

  it("an active co-participant sees the member's shared items only", async () => {
    const bob = await clientFor(TEST_USERS.bob);
    const { data, error } = await bob.rpc('get_coparticipant_list', { _member_id: TEST_USERS.carol });
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect((data as Array<{ title: string }>)[0]?.title).toBe('carol shared');
  });

  it('the honoree can browse an active participant list', async () => {
    const alice = await clientFor(TEST_USERS.alice);
    const { data, error } = await alice.rpc('get_coparticipant_list', { _member_id: TEST_USERS.carol });
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('a pending participant is NOT yet a co-participant (zero rows)', async () => {
    const dave = await clientFor(TEST_USERS.dave);
    const { data, error } = await dave.rpc('get_coparticipant_list', { _member_id: TEST_USERS.carol });
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
