// supabase/tests/integration/cagnotte-mutual-exclusion.test.ts
//
// Verifies the trigger-enforced mutual exclusion rule:
//   - An item can have either a solo claim OR an open cagnotte, never both.
//   - Terminal-state cagnottes (refunded / cancelled) release the lock.
//
// Trigger lives in migration 20260521120000 (check_claim_cagnotte_mutex
// on cagnottes) and its counterpart on claims.

import { describe, it, expect, beforeAll } from 'vitest';
import { adminClient, clientFor } from './helpers/client.ts';
import { ensureTestUsers, TEST_USERS, truncateBetweenTests } from './helpers/seed.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

// ─── helpers ──────────────────────────────────────────────────────────────────

function uuid(): string {
  return crypto.randomUUID();
}

/**
 * Create a fresh item owned by alice, published to a circle that contains
 * carol (and bob as admin via trigger). Returns { itemId, groupId }.
 */
async function makeItemWithAudience(
  admin: ReturnType<typeof adminClient>,
): Promise<{ itemId: string; groupId: string }> {
  const { data: circle, error: circleErr } = await admin
    .from('groups')
    .insert({ name: 'Audience ' + uuid(), created_by: TEST_USERS.bob })
    .select('id')
    .single();
  if (circleErr || !circle) throw new Error(`insert group: ${circleErr?.message}`);

  // bob is auto-inserted as admin by groups_bootstrap_admin trigger.
  const { error: memErr } = await admin.from('group_members').insert([
    { group_id: circle.id, user_id: TEST_USERS.carol, role: 'member' },
  ]);
  if (memErr) throw new Error(`insert group_members: ${memErr.message}`);

  const { data: item, error: itemErr } = await admin
    .from('items')
    .insert({ owner_id: TEST_USERS.alice, title: 'Gift ' + uuid() })
    .select('id')
    .single();
  if (itemErr || !item) throw new Error(`insert item: ${itemErr?.message}`);

  const { error: igErr } = await admin
    .from('item_groups')
    .insert({ item_id: item.id, group_id: circle.id });
  if (igErr) throw new Error(`insert item_group: ${igErr.message}`);

  return { itemId: item.id, groupId: circle.id };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Cagnotte ↔ claim mutual exclusion', () => {
  const admin = adminClient();
  let carol: SupabaseClient;

  beforeAll(async () => {
    await truncateBetweenTests();
    await ensureTestUsers();
    carol = await clientFor(TEST_USERS.carol);
  });

  // ── Case 1 ──────────────────────────────────────────────────────────────────
  it('cannot create cagnotte when solo claim exists on the same item', async () => {
    // Fresh item owned by alice, visible to carol (audience member).
    const { itemId } = await makeItemWithAudience(admin);

    // Carol claims the item (she can see it via item_groups → group_members).
    const { error: claimErr } = await carol.from('claims').insert({
      item_id: itemId,
      user_id: TEST_USERS.carol,
    });
    expect(claimErr).toBeNull();

    // Admin (service role) tries to open a cagnotte on the same item.
    // Trigger fires even though service role bypasses RLS.
    const { error } = await admin.from('cagnottes').insert({
      item_id: itemId,
      coordinator_id: TEST_USERS.bob,
      goal_amount_cents: 5000,
      deadline: new Date(Date.now() + 86400000).toISOString(),
      mangopay_wallet_id: 'test_wallet_' + uuid(),
      status: 'open',
    });

    expect(error).not.toBeNull();
    expect(error?.message).toContain('item_has_solo_claim');
  });

  // ── Case 2 ──────────────────────────────────────────────────────────────────
  it('cannot create solo claim when open cagnotte exists on the same item', async () => {
    // Fresh item + audience circle.
    const { itemId } = await makeItemWithAudience(admin);

    // Admin opens a cagnotte on the item.
    const { error: cagErr } = await admin.from('cagnottes').insert({
      item_id: itemId,
      coordinator_id: TEST_USERS.bob,
      goal_amount_cents: 3000,
      deadline: new Date(Date.now() + 86400000).toISOString(),
      mangopay_wallet_id: 'test_wallet_' + uuid(),
      status: 'open',
    });
    expect(cagErr).toBeNull();

    // Carol tries to add a solo claim — trigger should block it.
    const { error } = await carol.from('claims').insert({
      item_id: itemId,
      user_id: TEST_USERS.carol,
    });

    expect(error).not.toBeNull();
    expect(error?.message).toContain('item_has_open_cagnotte');
  });

  // ── Case 3 ──────────────────────────────────────────────────────────────────
  it('CAN create solo claim when cagnotte is in refunded (terminal) state', async () => {
    // Fresh item + audience circle.
    const { itemId } = await makeItemWithAudience(admin);

    // Admin inserts a cagnotte that is already refunded (terminal state).
    const { error: cagErr } = await admin.from('cagnottes').insert({
      item_id: itemId,
      coordinator_id: TEST_USERS.bob,
      goal_amount_cents: 2000,
      deadline: new Date(Date.now() + 86400000).toISOString(),
      mangopay_wallet_id: 'test_wallet_' + uuid(),
      status: 'refunded',
    });
    expect(cagErr).toBeNull();

    // Carol inserts a solo claim — should succeed because terminal cagnotte
    // releases the lock.
    const { error } = await carol.from('claims').insert({
      item_id: itemId,
      user_id: TEST_USERS.carol,
    });

    expect(error).toBeNull();
  });

  // ── Case 4 (bonus) ──────────────────────────────────────────────────────────
  it('CAN create solo claim when cagnotte is in cancelled (terminal) state', async () => {
    const { itemId } = await makeItemWithAudience(admin);

    const { error: cagErr } = await admin.from('cagnottes').insert({
      item_id: itemId,
      coordinator_id: TEST_USERS.bob,
      goal_amount_cents: 2000,
      deadline: new Date(Date.now() + 86400000).toISOString(),
      mangopay_wallet_id: 'test_wallet_' + uuid(),
      status: 'cancelled',
    });
    expect(cagErr).toBeNull();

    const { error } = await carol.from('claims').insert({
      item_id: itemId,
      user_id: TEST_USERS.carol,
    });

    expect(error).toBeNull();
  });
});
