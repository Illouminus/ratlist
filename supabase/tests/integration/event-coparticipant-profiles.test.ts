import { describe, it, expect, beforeEach } from 'vitest';
import { adminClient, clientFor } from './helpers/client.ts';
import { ensureTestUsers, truncateBetweenTests, TEST_USERS } from './helpers/seed.ts';

/**
 * Bug F + foundation: event co-participants must be able to read each other's
 * profile rows (so the claims-embed in useEvent resolves and they see who took
 * what), WITHOUT being friends or group-mates. The honoree stays blind to
 * claims on their own items. Outsiders see nothing.
 *
 * Topology: alice = honoree. bob + carol = active participants (NOT friends,
 * NOT group-mates). dave = outsider. alice owns one item, curated into the event.
 *
 * Uses ensureTestUsers (NOT seedFresh) so there's no shared group — that isolates
 * the event-co-participant path from the group-mate / friend paths.
 */
describe('event co-participants: profile + claim visibility', () => {
  let eventId: string;
  let itemId: string;

  beforeEach(async () => {
    await truncateBetweenTests();
    await ensureTestUsers();
    const admin = adminClient();

    const { data: ev } = await admin
      .from('events')
      .insert({ honoree_id: TEST_USERS.alice, title: "alice's day" })
      .select('id')
      .single();
    eventId = ev!.id;

    await admin.from('event_participants').insert([
      { event_id: eventId, user_id: TEST_USERS.bob, status: 'active', joined_at: new Date().toISOString() },
      { event_id: eventId, user_id: TEST_USERS.carol, status: 'active', joined_at: new Date().toISOString() },
    ]);

    const { data: it } = await admin
      .from('items')
      .insert({ owner_id: TEST_USERS.alice, title: 'a kettle', occasion: 'birthday', visibility: 'shared', status: 'active' })
      .select('id')
      .single();
    itemId = it!.id;
    await admin.from('event_items').insert({ event_id: eventId, item_id: itemId });
  });

  it('a participant reads a co-participant profile (not friends)', async () => {
    const bob = await clientFor(TEST_USERS.bob);
    const { data, error } = await bob
      .from('profiles')
      .select('id, display_name, avatar_url')
      .eq('id', TEST_USERS.carol)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(TEST_USERS.carol);
  });

  it('a participant reads the honoree profile, and vice versa', async () => {
    const bob = await clientFor(TEST_USERS.bob);
    const { data: honoree } = await bob.from('profiles').select('id').eq('id', TEST_USERS.alice).maybeSingle();
    expect(honoree?.id).toBe(TEST_USERS.alice);

    const alice = await clientFor(TEST_USERS.alice);
    const { data: guest } = await alice.from('profiles').select('id').eq('id', TEST_USERS.bob).maybeSingle();
    expect(guest?.id).toBe(TEST_USERS.bob);
  });

  it("bug F: a co-participant sees another co-participant's claim WITH the claimer name", async () => {
    // carol claims alice's curated item.
    const carol = await clientFor(TEST_USERS.carol);
    const { error: claimErr } = await carol.from('claims').insert({ item_id: itemId, user_id: TEST_USERS.carol, share: 100 });
    expect(claimErr).toBeNull();

    // bob (a co-participant, not carol's friend) reads the claim embedded with the profile.
    const bob = await clientFor(TEST_USERS.bob);
    const { data, error } = await bob
      .from('claims')
      .select('user_id, user:profiles(id, display_name)')
      .eq('item_id', itemId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]?.user_id).toBe(TEST_USERS.carol);
    // The embed must resolve (was null pre-fix → the client dropped the claim).
    expect((data?.[0] as { user?: { id?: string } }).user?.id).toBe(TEST_USERS.carol);
  });

  it('the honoree stays blind to claims on their own curated item', async () => {
    const carol = await clientFor(TEST_USERS.carol);
    await carol.from('claims').insert({ item_id: itemId, user_id: TEST_USERS.carol, share: 100 });

    const alice = await clientFor(TEST_USERS.alice);
    const { data, error } = await alice.from('claims').select('user_id').eq('item_id', itemId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('an outsider cannot read a participant profile via the event path', async () => {
    const dave = await clientFor(TEST_USERS.dave);
    const { data } = await dave.from('profiles').select('id').eq('id', TEST_USERS.bob).maybeSingle();
    expect(data).toBeNull();
  });
});
