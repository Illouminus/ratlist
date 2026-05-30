import { describe, it, expect, beforeEach } from 'vitest';
import { adminClient, clientFor } from './helpers/client.ts';
import { ensureTestUsers, truncateBetweenTests, TEST_USERS } from './helpers/seed.ts';

/**
 * Regression for the prod bug where the guest-facing "кто ещё дарит"
 * (GuestParticipants) section — and the honoree's participant list — rendered
 * nothing. Root cause: useEventParticipants embedded `profiles!user_id`, but
 * event_participants has no FK to profiles (it FKs auth.users, twice), so the
 * embed errored (PGRST200) and the list came back empty.
 *
 * The fix reads in two steps. This test pins that both reads succeed for a
 * GUEST (active participant, not the honoree, not friends): the participant
 * rows, then the co-participants' profiles (via the profiles co-participant
 * SELECT policy from 20260530120000).
 *
 * alice = honoree, bob + carol = active participants (no group, no friendship).
 */
describe('event_participants: a guest can assemble the participant list', () => {
  let eventId: string;

  beforeEach(async () => {
    await truncateBetweenTests();
    await ensureTestUsers();
    const admin = adminClient();
    const { data: ev } = await admin
      .from('events')
      .insert({ honoree_id: TEST_USERS.alice, title: 'p' })
      .select('id')
      .single();
    eventId = ev!.id;
    await admin.from('event_participants').insert([
      { event_id: eventId, user_id: TEST_USERS.bob, status: 'active', joined_at: new Date().toISOString() },
      { event_id: eventId, user_id: TEST_USERS.carol, status: 'active', joined_at: new Date().toISOString() },
    ]);
  });

  it('bob (guest) reads both participant rows', async () => {
    const bob = await clientFor(TEST_USERS.bob);
    const { data, error } = await bob
      .from('event_participants')
      .select('user_id, status')
      .eq('event_id', eventId);
    expect(error).toBeNull();
    expect(data).toHaveLength(2);
  });

  it('bob (guest) reads the co-participants’ profiles by id', async () => {
    const bob = await clientFor(TEST_USERS.bob);
    const { data, error } = await bob
      .from('profiles')
      .select('id, display_name')
      .in('id', [TEST_USERS.bob, TEST_USERS.carol]);
    expect(error).toBeNull();
    expect(data).toHaveLength(2);
    const names = (data ?? []).map((p) => (p as { display_name: string }).display_name).sort();
    expect(names).toEqual(['bob', 'carol']);
  });
});
