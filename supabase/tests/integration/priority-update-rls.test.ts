// supabase/tests/integration/priority-update-rls.test.ts
//
// Locks the RLS contract on items.priority:
//   - Owner may UPDATE their own item's priority.
//   - Non-owner UPDATE is silently denied (PostgREST returns an empty array).
import { describe, it, expect, beforeEach } from 'vitest';
import { adminClient, clientFor } from './helpers/client.ts';
import { seedFresh, type SeedContext } from './helpers/seed.ts';

describe('items.priority UPDATE RLS', () => {
  let ctx: SeedContext;
  beforeEach(async () => { ctx = await seedFresh(); });

  it('owner can update their own item priority', async () => {
    const aliceClient = await clientFor(ctx.alice);

    // Alice inserts an item (owner_id required — INSERT policy checks it).
    const { data: created, error: createErr } = await aliceClient
      .from('items')
      .insert({ owner_id: ctx.alice, title: 'Priority test item', priority: 2 })
      .select('id')
      .single();
    expect(createErr).toBeNull();
    expect(created).not.toBeNull();

    const { error: updateErr } = await aliceClient
      .from('items')
      .update({ priority: 1 })
      .eq('id', created!.id);
    expect(updateErr).toBeNull();

    const { data: after } = await aliceClient
      .from('items')
      .select('priority')
      .eq('id', created!.id)
      .single();
    expect(after?.priority).toBe(1);
  });

  it("non-owner cannot update someone else's item priority", async () => {
    // Use the admin client to insert Alice's item, bypassing client-side RLS
    // (same pattern as helpers/seed.ts — admin inserts are service-role).
    const admin = adminClient();
    const { data: created } = await admin
      .from('items')
      .insert({ owner_id: ctx.alice, title: 'Alice item for RLS check', priority: 2 })
      .select('id')
      .single();
    expect(created).not.toBeNull();

    const bobClient = await clientFor(ctx.bob);

    // Bob tries to update Alice's item — RLS should silently no-op
    // (PostgREST returns an empty array for unauthorised UPDATEs by default).
    const { data: updated, error: updateErr } = await bobClient
      .from('items')
      .update({ priority: 1 })
      .eq('id', created!.id)
      .select();
    expect(updateErr).toBeNull();     // no explicit error — just silent denial
    expect(updated).toEqual([]);      // zero rows matched = RLS blocked it

    // Confirm Alice's item is unchanged.
    const { data: after } = await admin
      .from('items')
      .select('priority')
      .eq('id', created!.id)
      .single();
    expect(after?.priority).toBe(2);
  });
});
