// supabase/tests/integration/cagnotte-rls.test.ts
//
// Integration smoke-test matrix for cagnotte RLS + get_cagnotte_view RPC.
// Proves the privacy invariants from migrations 20260521120000/130000.
//
// Self-event mode (6 cases):
//   alice = honoree (owns item + created event)
//   bob   = coordinator (audience member)
//   carol = contributor (audience member)
//   dave  = outsider (not in audience circle)
//
// HR-event mode (4 cases):
//   bob   = HR creator + coordinator (owns curated items)
//   alice = Jean (registered honoree — blind to cagnotte)
//   carol = colleague contributor (audience member)

import { describe, it, expect, beforeAll } from 'vitest';
import { adminClient, clientFor } from './helpers/client.ts';
import { ensureTestUsers, TEST_USERS, truncateBetweenTests } from './helpers/seed.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

// ─── helpers ──────────────────────────────────────────────────────────────────

function uuid(): string {
  return crypto.randomUUID();
}

interface CagnotteView {
  cagnotte: Record<string, unknown>;
  is_coordinator: boolean;
  contributions: Array<{
    id: string;
    contributor_id: string;
    contributor_name: string;
    amount_cents: number | null;
    status: string;
    created_at: string;
  }>;
}

async function callView(
  client: SupabaseClient,
  cagnotteId: string,
): Promise<{ data: CagnotteView | null; error: { message: string } | null }> {
  const { data, error } = await client.rpc('get_cagnotte_view', {
    _cagnotte_id: cagnotteId,
  });
  return { data: data as CagnotteView | null, error };
}

// ─── Self-event mode ───────────────────────────────────────────────────────────

describe('Cagnotte RLS — self-event mode', () => {
  const admin = adminClient();

  let honoree: SupabaseClient; // alice
  let coordinator: SupabaseClient; // bob
  let contributor: SupabaseClient; // carol
  let outsider: SupabaseClient; // dave

  let itemId: string;
  let cagnotteId: string;
  let groupId: string;

  beforeAll(async () => {
    await truncateBetweenTests();
    await ensureTestUsers();

    // ── 1. Audience circle: bob + carol (NOT alice — she's the honoree) ──
    const { data: circle, error: circleErr } = await admin
      .from('groups')
      .insert({ name: 'Friends circle', created_by: TEST_USERS.bob })
      .select('id')
      .single();
    if (circleErr || !circle) throw new Error(`insert group: ${circleErr?.message}`);
    groupId = circle.id;

    // groups_bootstrap_admin trigger inserts bob as admin automatically.
    const { error: memErr } = await admin.from('group_members').insert([
      { group_id: groupId, user_id: TEST_USERS.carol, role: 'member' },
      // alice NOT added — she's the honoree, not an audience member
    ]);
    if (memErr) throw new Error(`insert group_members: ${memErr.message}`);

    // ── 2. Item owned by alice, published to the audience circle ──
    const { data: item, error: itemErr } = await admin
      .from('items')
      .insert({ owner_id: TEST_USERS.alice, title: 'Gift for Alice' })
      .select('id')
      .single();
    if (itemErr || !item) throw new Error(`insert item: ${itemErr?.message}`);
    itemId = item.id;

    const { error: igErr } = await admin
      .from('item_groups')
      .insert({ item_id: itemId, group_id: groupId });
    if (igErr) throw new Error(`insert item_group: ${igErr.message}`);

    // ── 3. Self-event: alice is both creator and honoree ──
    const { data: ev, error: evErr } = await admin
      .from('events')
      .insert({
        title: "Alice's birthday",
        kind: 'birthday',
        occurs_on: '2026-12-31',
        honoree_id: TEST_USERS.alice,
        created_by: TEST_USERS.alice,
      })
      .select('id')
      .single();
    if (evErr || !ev) throw new Error(`insert event: ${evErr?.message}`);

    // Attach audience circle + curated item to the event.
    const { error: ecErr } = await admin
      .from('event_circles')
      .insert({ event_id: ev.id, group_id: groupId });
    if (ecErr) throw new Error(`insert event_circle: ${ecErr.message}`);

    const { error: eiErr } = await admin
      .from('event_items')
      .insert({ event_id: ev.id, item_id: itemId });
    if (eiErr) throw new Error(`insert event_item: ${eiErr.message}`);

    // ── 4. Cagnotte via service role (bypasses RLS INSERT check) ──
    //    coordinator = bob, wallet id must be globally unique.
    const { data: cag, error: cagErr } = await admin
      .from('cagnottes')
      .insert({
        item_id: itemId,
        coordinator_id: TEST_USERS.bob,
        goal_amount_cents: 5000,
        deadline: '2026-11-30T23:59:59Z',
        mangopay_wallet_id: 'test_wallet_' + uuid(),
        status: 'open',
      })
      .select('id')
      .single();
    if (cagErr || !cag) throw new Error(`insert cagnotte: ${cagErr?.message}`);
    cagnotteId = cag.id;

    // ── 5. Carol contributes (via admin — client INSERT is blocked by RLS) ──
    const { error: contErr } = await admin.from('cagnotte_contributions').insert({
      cagnotte_id: cagnotteId,
      contributor_id: TEST_USERS.carol,
      amount_cents: 2000,
      mangopay_payin_id: 'test_payin_' + uuid(),
      status: 'succeeded',
    });
    if (contErr) throw new Error(`insert contribution (carol): ${contErr.message}`);

    // ── 6. Bob also contributes (so coordinator has a row too) ──
    const { error: contBobErr } = await admin.from('cagnotte_contributions').insert({
      cagnotte_id: cagnotteId,
      contributor_id: TEST_USERS.bob,
      amount_cents: 3000,
      mangopay_payin_id: 'test_payin_' + uuid(),
      status: 'succeeded',
    });
    if (contBobErr) throw new Error(`insert contribution (bob): ${contBobErr.message}`);

    // ── Build per-user clients ──
    honoree = await clientFor(TEST_USERS.alice);
    coordinator = await clientFor(TEST_USERS.bob);
    contributor = await clientFor(TEST_USERS.carol);
    outsider = await clientFor(TEST_USERS.dave);
  });

  // ── Case 1 ─────────────────────────────────────────────────────────────────
  it('honoree cannot SELECT cagnotte on their own item → []', async () => {
    const { data } = await honoree
      .from('cagnottes')
      .select()
      .eq('id', cagnotteId);
    expect(data).toEqual([]);
  });

  // ── Case 2 ─────────────────────────────────────────────────────────────────
  it('honoree calling get_cagnotte_view → cagnotte_forbidden', async () => {
    const { error } = await callView(honoree, cagnotteId);
    expect(error).not.toBeNull();
    expect(error?.message).toContain('cagnotte_forbidden');
  });

  // ── Case 3 ─────────────────────────────────────────────────────────────────
  it('contributor (carol) sees own amount, others masked as null', async () => {
    const { data: view, error } = await callView(contributor, cagnotteId);
    expect(error).toBeNull();
    expect(view).not.toBeNull();

    const contributions = view!.contributions;
    expect(contributions.length).toBeGreaterThan(0);

    const ownRow = contributions.find((c) => c.contributor_id === TEST_USERS.carol);
    const otherRow = contributions.find((c) => c.contributor_id !== TEST_USERS.carol);

    expect(ownRow).toBeDefined();
    expect(ownRow?.amount_cents).not.toBeNull();
    expect(ownRow?.amount_cents).toBe(2000);

    // Bob is the coordinator, so his amount should also be visible — but from
    // carol's perspective (non-coordinator) bob's amount is masked.
    expect(otherRow).toBeDefined();
    expect(otherRow?.amount_cents).toBeNull();
  });

  // ── Case 4 ─────────────────────────────────────────────────────────────────
  it('coordinator (bob) sees ALL contribution amounts', async () => {
    const { data: view, error } = await callView(coordinator, cagnotteId);
    expect(error).toBeNull();
    expect(view).not.toBeNull();
    expect(view!.is_coordinator).toBe(true);

    const contributions = view!.contributions;
    expect(contributions.length).toBe(2);
    contributions.forEach((c) => {
      expect(c.amount_cents).not.toBeNull();
    });
  });

  // ── Case 5 ─────────────────────────────────────────────────────────────────
  it('contributor sees own amount not null, coordinator amount is null (masked)', async () => {
    // This is implied by Case 3 but we assert it explicitly for clarity.
    const { data: view } = await callView(contributor, cagnotteId);
    const bobRow = view!.contributions.find((c) => c.contributor_id === TEST_USERS.bob);
    const carolRow = view!.contributions.find((c) => c.contributor_id === TEST_USERS.carol);
    expect(carolRow?.amount_cents).toBe(2000); // own — visible
    expect(bobRow?.amount_cents).toBeNull(); // coordinator's — masked for non-coordinator
  });

  // ── Case 6 ─────────────────────────────────────────────────────────────────
  it('non-audience caller (dave) → cagnotte_forbidden', async () => {
    const { error } = await callView(outsider, cagnotteId);
    expect(error).not.toBeNull();
    expect(error?.message).toContain('cagnotte_forbidden');
  });
});

// ─── HR-event mode ─────────────────────────────────────────────────────────────

describe('Cagnotte RLS — HR-event mode', () => {
  const admin = adminClient();

  let alice: SupabaseClient; // Jean, the honoree — blind
  let bob: SupabaseClient; // HR creator + coordinator
  let carol: SupabaseClient; // colleague contributor

  let itemId: string;
  let cagnotteId: string;
  let groupId: string;

  beforeAll(async () => {
    await truncateBetweenTests();
    await ensureTestUsers();

    // ── 1. Office circle: bob (HR, admin via trigger) + carol (colleague) ──
    //    Alice (Jean) is added so bob shares_group_with(alice) — required by
    //    the events_insert RLS policy when honoree_id ≠ created_by.
    const { data: circle, error: circleErr } = await admin
      .from('groups')
      .insert({ name: 'Office', created_by: TEST_USERS.bob })
      .select('id')
      .single();
    if (circleErr || !circle) throw new Error(`insert group: ${circleErr?.message}`);
    groupId = circle.id;

    const { error: memErr } = await admin.from('group_members').insert([
      { group_id: groupId, user_id: TEST_USERS.alice, role: 'member' },
      { group_id: groupId, user_id: TEST_USERS.carol, role: 'member' },
    ]);
    if (memErr) throw new Error(`insert group_members: ${memErr.message}`);

    // ── 2. Item owned by bob (HR creator), published to the office circle ──
    const { data: item, error: itemErr } = await admin
      .from('items')
      .insert({ owner_id: TEST_USERS.bob, title: 'Decanter set for Jean' })
      .select('id')
      .single();
    if (itemErr || !item) throw new Error(`insert item: ${itemErr?.message}`);
    itemId = item.id;

    const { error: igErr } = await admin
      .from('item_groups')
      .insert({ item_id: itemId, group_id: groupId });
    if (igErr) throw new Error(`insert item_group: ${igErr.message}`);

    // ── 3. HR-event: bob = creator, alice = honoree ──
    const { data: ev, error: evErr } = await admin
      .from('events')
      .insert({
        title: "Jean's retirement",
        kind: 'other',
        occurs_on: '2026-12-01',
        honoree_id: TEST_USERS.alice,
        created_by: TEST_USERS.bob,
      })
      .select('id')
      .single();
    if (evErr || !ev) throw new Error(`insert HR event: ${evErr?.message}`);

    const { error: ecErr } = await admin
      .from('event_circles')
      .insert({ event_id: ev.id, group_id: groupId });
    if (ecErr) throw new Error(`insert event_circle: ${ecErr.message}`);

    const { error: eiErr } = await admin
      .from('event_items')
      .insert({ event_id: ev.id, item_id: itemId });
    if (eiErr) throw new Error(`insert event_item: ${eiErr.message}`);

    // ── 4. Cagnotte: coordinator = bob ──
    const { data: cag, error: cagErr } = await admin
      .from('cagnottes')
      .insert({
        item_id: itemId,
        coordinator_id: TEST_USERS.bob,
        goal_amount_cents: 10000,
        deadline: '2026-11-01T23:59:59Z',
        mangopay_wallet_id: 'test_wallet_hr_' + uuid(),
        status: 'open',
      })
      .select('id')
      .single();
    if (cagErr || !cag) throw new Error(`insert HR cagnotte: ${cagErr?.message}`);
    cagnotteId = cag.id;

    // ── 5. Carol contributes ──
    const { error: contErr } = await admin.from('cagnotte_contributions').insert({
      cagnotte_id: cagnotteId,
      contributor_id: TEST_USERS.carol,
      amount_cents: 5000,
      mangopay_payin_id: 'test_payin_hr_' + uuid(),
      status: 'succeeded',
    });
    if (contErr) throw new Error(`insert contribution (carol, HR): ${contErr.message}`);

    // ── Build per-user clients ──
    alice = await clientFor(TEST_USERS.alice);
    bob = await clientFor(TEST_USERS.bob);
    carol = await clientFor(TEST_USERS.carol);
  });

  // ── Case 7 ─────────────────────────────────────────────────────────────────
  it('Jean (honoree, alice) blind: SELECT returns []', async () => {
    const { data } = await alice.from('cagnottes').select().eq('id', cagnotteId);
    expect(data).toEqual([]);
  });

  // ── Case 8 ─────────────────────────────────────────────────────────────────
  it('Jean calling get_cagnotte_view → cagnotte_forbidden', async () => {
    const { error } = await callView(alice, cagnotteId);
    expect(error).not.toBeNull();
    expect(error?.message).toContain('cagnotte_forbidden');
  });

  // ── Case 9 ─────────────────────────────────────────────────────────────────
  it('HR creator (bob, coordinator) sees ALL contribution amounts', async () => {
    const { data: view, error } = await callView(bob, cagnotteId);
    expect(error).toBeNull();
    expect(view).not.toBeNull();
    expect(view!.is_coordinator).toBe(true);

    const contributions = view!.contributions;
    expect(contributions).toHaveLength(1);
    contributions.forEach((c) => {
      expect(c.amount_cents).not.toBeNull();
    });
    expect(contributions[0]?.contributor_name).toBeTruthy();
  });

  // ── Case 10 ────────────────────────────────────────────────────────────────
  it('HR creator (bob) can UPDATE their own item during open cagnotte (no item_lock)', async () => {
    // item_lock trigger fires only when is_honoree_of_item() = true for the
    // calling user. Bob owns the item but is NOT the honoree of the event
    // (alice is) — so the trigger should NOT block bob's UPDATE.
    const { error } = await bob
      .from('items')
      .update({ title: 'Decanter set for Jean (updated)' })
      .eq('id', itemId);
    expect(error).toBeNull();
  });
});
