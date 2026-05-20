// supabase/tests/integration/hr-mode-events.test.ts
//
// Integration tests for HR-mode events:  creator ≠ honoree, shipped in
// migrations 20260520120000_events_hr_mode + 20260520130000_events_hr_mode_fixes.
//
// Role map:
//   bob   = HR creator (organises the event, owns the curated items)
//   alice = Jean, the honoree (recipient — blind to claims)
//   carol = audience colleague (can claim)
//   dave  = outsider (not in the audience circle)

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { adminClient, clientFor } from './helpers/client.ts';
import { ensureTestUsers, TEST_USERS, truncateBetweenTests } from './helpers/seed.ts';

describe('HR-mode events', () => {
  const admin = adminClient();

  let hrEventId: string;
  let nonUserEventId: string;
  let itemId: string;
  let circleId: string;

  beforeAll(async () => {
    // Truncate all mutable test state, then re-seed the 4 fixed users.
    await truncateBetweenTests();
    await ensureTestUsers();

    // Create an audience circle that contains bob (HR) and carol (colleague).
    // Alice (Jean, the honoree) is deliberately NOT in the circle — tests the
    // case where the honoree is not an audience member.
    const { data: circle, error: circleErr } = await admin
      .from('groups')
      .insert({ name: 'Office', created_by: TEST_USERS.bob })
      .select('id')
      .single();
    if (circleErr || !circle) throw new Error(`insert group failed: ${circleErr?.message}`);
    circleId = circle.id;

    // The groups_bootstrap_admin trigger auto-inserts bob as admin.
    // Alice (Jean) is added so bob shares_group_with(alice) — required by the
    // events_insert RLS policy when honoree_id ≠ creator.
    // Carol is the audience colleague who will claim an item.
    const { error: memErr } = await admin.from('group_members').insert([
      { group_id: circleId, user_id: TEST_USERS.alice, role: 'member' },
      { group_id: circleId, user_id: TEST_USERS.carol, role: 'member' },
    ]);
    if (memErr) throw new Error(`insert group_members failed: ${memErr.message}`);
  });

  afterAll(async () => {
    // cascade deletes: groups → group_members; events → event_circles, event_items
    if (circleId) await admin.from('groups').delete().eq('id', circleId);
    // events without a cascaded group reference need explicit cleanup
    if (hrEventId) await admin.from('events').delete().eq('id', hrEventId);
    if (nonUserEventId) await admin.from('events').delete().eq('id', nonUserEventId);
    if (itemId) await admin.from('items').delete().eq('id', itemId);
  });

  // ─── Test 1: HR creates event for a registered honoree ───────────────────

  it('HR (creator) can insert an event with honoree_id set to another user', async () => {
    const hr = await clientFor(TEST_USERS.bob);
    const { data, error } = await hr
      .from('events')
      .insert({
        title: "Jean's retirement",
        kind: 'other',
        created_by: TEST_USERS.bob,
        honoree_id: TEST_USERS.alice,
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.created_by).toBe(TEST_USERS.bob);
    expect(data!.honoree_id).toBe(TEST_USERS.alice);
    hrEventId = data!.id;
  });

  // ─── Test 2: HR creates event for a non-user honoree (text fallback) ─────

  it('HR can insert an event with honoree_id=null and honoree_name as free text', async () => {
    const hr = await clientFor(TEST_USERS.bob);
    const { data, error } = await hr
      .from('events')
      .insert({
        title: "Marc's departure",
        kind: 'other',
        created_by: TEST_USERS.bob,
        honoree_id: null,
        honoree_name: 'Marc Dupont',
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.honoree_id).toBeNull();
    expect(data!.honoree_name).toBe('Marc Dupont');
    nonUserEventId = data!.id;
    // Clean up immediately — not used by later tests.
    await admin.from('events').delete().eq('id', data!.id);
    nonUserEventId = '';
  });

  // ─── Test 3: Jean (the honoree) sees the HR-event (RLS allows it) ─────────
  //
  // The `events_select` policy grants access to `honoree_id = auth.uid()`, so
  // Jean CAN read the event row. This is intentional: Jean should know the
  // event exists. What Jean cannot see is the *claims* on curated items.

  it('Jean (the honoree) CAN select the HR-event via honoree_id policy', async () => {
    const jean = await clientFor(TEST_USERS.alice);
    const { data, error } = await jean
      .from('events')
      .select('id, title, honoree_id, created_by')
      .eq('id', hrEventId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0]!.honoree_id).toBe(TEST_USERS.alice);
    expect(data![0]!.created_by).toBe(TEST_USERS.bob);
  });

  // ─── Test 4: HR (creator) can read and update their HR-event ─────────────

  it('HR (creator) can read and update their HR-event', async () => {
    const hr = await clientFor(TEST_USERS.bob);

    const { data: read, error: readErr } = await hr
      .from('events')
      .select('id, title, created_by')
      .eq('id', hrEventId)
      .single();
    expect(readErr).toBeNull();
    expect(read!.title).toBe("Jean's retirement");
    expect(read!.created_by).toBe(TEST_USERS.bob);

    const { error: updateErr } = await hr
      .from('events')
      .update({ note: 'Updated by HR' })
      .eq('id', hrEventId);
    expect(updateErr).toBeNull();
  });

  // ─── Test 5: claims privacy invariant in HR-mode ─────────────────────────
  //
  // Setup: attach the event to the office circle so carol can see the items.
  // HR creates an item (owner = bob) and curates it into the event.
  // Carol (colleague) claims the item.
  //
  // Invariants:
  //   - Jean (honoree, alice) sees [] on claims for this item.
  //     (is_honoree_of_item returns true for alice because
  //      events.honoree_id = alice's UUID → blind to claims)
  //   - HR (bob, creator) sees the claim.
  //     (is_honoree_of_item returns false for bob because bob is
  //      not the honoree — HR is the curator, not the recipient)

  it('claims privacy: Jean (honoree) is blind; HR (creator) sees the claim', async () => {
    const colleague = await clientFor(TEST_USERS.carol);
    const hr = await clientFor(TEST_USERS.bob);
    const jean = await clientFor(TEST_USERS.alice);

    // Attach the HR-event to the office circle so carol can see curated items.
    const { error: ecErr } = await admin
      .from('event_circles')
      .insert({ event_id: hrEventId, group_id: circleId });
    expect(ecErr).toBeNull();

    // HR creates an item owned by bob (HR), then curates it into the event.
    const { data: item, error: itemErr } = await admin
      .from('items')
      .insert({ owner_id: TEST_USERS.bob, title: 'Decanter set' })
      .select('id')
      .single();
    expect(itemErr).toBeNull();
    itemId = item!.id;

    // Publish the item to the office circle so it's visible to audience members.
    const { error: igErr } = await admin
      .from('item_groups')
      .insert({ item_id: itemId, group_id: circleId });
    expect(igErr).toBeNull();

    const { error: eiErr } = await admin
      .from('event_items')
      .insert({ event_id: hrEventId, item_id: itemId });
    expect(eiErr).toBeNull();

    // Carol (colleague, audience member) claims the item.
    const { error: claimErr } = await colleague
      .from('claims')
      .insert({ item_id: itemId, user_id: TEST_USERS.carol, share: 100 });
    expect(claimErr).toBeNull();

    // Jean (honoree, alice) must see zero claims — is_honoree_of_item(itemId)
    // returns true for alice (events.honoree_id = alice), blocking the SELECT.
    const { data: jeanSees, error: jeanErr } = await jean
      .from('claims')
      .select('*')
      .eq('item_id', itemId);
    expect(jeanErr).toBeNull();
    expect(jeanSees).toEqual([]);

    // HR (bob, creator) is NOT the honoree, so is_honoree_of_item returns false
    // for bob → bob can see claims like any other audience member.
    const { data: hrSees, error: hrErr } = await hr
      .from('claims')
      .select('user_id')
      .eq('item_id', itemId);
    expect(hrErr).toBeNull();
    expect(hrSees).toHaveLength(1);
    expect(hrSees![0]!.user_id).toBe(TEST_USERS.carol);
  });
});
