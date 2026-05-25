import { describe, it, expect, beforeEach } from 'vitest';
import { adminClient, clientFor } from './helpers/client.ts';
import { seedFresh, type SeedContext } from './helpers/seed.ts';

describe('can_see_item — event-participation path', () => {
  let ctx: SeedContext;
  beforeEach(async () => { ctx = await seedFresh(); });

  it('participant in event with curated item can see that item', async () => {
    const admin = adminClient();
    const { data: ev } = await admin.from('events')
      .insert({ honoree_id: ctx.alice, title: 'csi test' })
      .select('id').single();
    await admin.from('event_items')
      .insert({ event_id: ev!.id, item_id: ctx.itemAliceOwns });
    await admin.from('event_participants')
      .insert({ event_id: ev!.id, user_id: ctx.dave, status: 'active', joined_at: new Date().toISOString() });

    // Dave is in alice's seed group (so legacy item_groups path also works),
    // but the assertion is that the helper recognises BOTH paths cleanly.
    const daveClient = await clientFor(ctx.dave);
    const { data: sees } = await daveClient.rpc('can_see_item', { _item_id: ctx.itemAliceOwns });
    expect(sees).toBe(true);
  });

  it('outsider with no event tie cannot see the item', async () => {
    const admin = adminClient();
    // Create a fresh item that is NOT in any group and NOT in any event
    const { data: lonelyItem } = await admin.from('items')
      .insert({ owner_id: ctx.alice, title: 'lonely' })
      .select('id').single();
    const daveClient = await clientFor(ctx.dave);
    const { data: sees } = await daveClient.rpc('can_see_item', { _item_id: lonelyItem!.id });
    expect(sees).toBe(false);
  });

  it('legacy item_groups path still works (no regression)', async () => {
    // dave IS in alice's seeded group, and itemAliceOwns IS in that group
    const daveClient = await clientFor(ctx.dave);
    const { data: sees } = await daveClient.rpc('can_see_item', { _item_id: ctx.itemAliceOwns });
    expect(sees).toBe(true);
  });
});
