// supabase/tests/integration/claims-privacy.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { clientFor } from './helpers/client.ts';
import { seedFresh, type SeedContext } from './helpers/seed.ts';

describe('Invariant A — claims hidden from item owner', () => {
  let ctx: SeedContext;

  beforeEach(async () => {
    ctx = await seedFresh();
  });

  it("owner does not see another user's claim on their own item", async () => {
    const bobClient = await clientFor(ctx.bob);
    const { error: claimErr } = await bobClient
      .from('claims')
      .insert({ item_id: ctx.itemAliceOwns, user_id: ctx.bob, share: 100 });
    expect(claimErr).toBeNull();

    const aliceClient = await clientFor(ctx.alice);
    const { data: aliceView, error: aliceErr } = await aliceClient
      .from('claims')
      .select('*')
      .eq('item_id', ctx.itemAliceOwns);
    expect(aliceErr).toBeNull();
    expect(aliceView).toEqual([]);
  });

  it('non-owner who can see the item sees its claims', async () => {
    const bobClient = await clientFor(ctx.bob);
    await bobClient
      .from('claims')
      .insert({ item_id: ctx.itemAliceOwns, user_id: ctx.bob, share: 100 });

    const carolClient = await clientFor(ctx.carol);
    const { data: carolView, error: carolErr } = await carolClient
      .from('claims')
      .select('user_id')
      .eq('item_id', ctx.itemAliceOwns);
    expect(carolErr).toBeNull();
    expect(carolView).toHaveLength(1);
    expect(carolView?.[0]?.user_id).toBe(ctx.bob);
  });

  it('claim is not leaked via items?select=*,claims(*) embed (owner view)', async () => {
    const bobClient = await clientFor(ctx.bob);
    await bobClient
      .from('claims')
      .insert({ item_id: ctx.itemAliceOwns, user_id: ctx.bob, share: 100 });

    const aliceClient = await clientFor(ctx.alice);
    const { data, error } = await aliceClient
      .from('items')
      .select('id, claims(user_id)')
      .eq('id', ctx.itemAliceOwns);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]?.claims).toEqual([]);
  });

  it('export_my_data() does not include claims on own items for the owner', async () => {
    const bobClient = await clientFor(ctx.bob);
    await bobClient
      .from('claims')
      .insert({ item_id: ctx.itemAliceOwns, user_id: ctx.bob, share: 100 });

    const aliceClient = await clientFor(ctx.alice);
    const { data, error } = await aliceClient.rpc('export_my_data');
    expect(error).toBeNull();
    expect(data).toBeTruthy();
    const exportObj = data as Record<string, unknown>;
    const myClaims = exportObj.my_claims;
    if (Array.isArray(myClaims)) {
      for (const c of myClaims) {
        const claim = c as { user_id?: string };
        expect(claim.user_id ?? ctx.alice).toBe(ctx.alice);
      }
    }
    expect(exportObj).not.toHaveProperty('claims_on_my_items');
  });
});
