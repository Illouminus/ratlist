import { describe, it, expect, beforeEach } from 'vitest';
import { adminClient, clientFor } from './helpers/client.ts';
import { seedFresh, type SeedContext } from './helpers/seed.ts';

describe('Privacy invariant — claims hidden from item owner (regression guard)', () => {
  let ctx: SeedContext;
  beforeEach(async () => { ctx = await seedFresh(); });

  it('honoree does NOT see claims on own items via direct SELECT', async () => {
    const admin = adminClient();
    const { data: ev } = await admin.from('events')
      .insert({ honoree_id: ctx.alice, title: 'privacy test' }).select('id').single();
    await admin.from('event_items').insert({ event_id: ev!.id, item_id: ctx.itemAliceOwns });
    await admin.from('event_participants').insert({
      event_id: ev!.id, user_id: ctx.bob, status: 'active', joined_at: new Date().toISOString(),
    });
    const bobClient = await clientFor(ctx.bob);
    await bobClient.from('claims').insert({ item_id: ctx.itemAliceOwns, user_id: ctx.bob });

    // Alice (honoree, owner) queries claims — must see nothing
    const aliceClient = await clientFor(ctx.alice);
    const { data: claims } = await aliceClient.from('claims')
      .select('id, user_id').eq('item_id', ctx.itemAliceOwns);
    expect(claims).toEqual([]);

    // Bob (claimer) sees his own claim
    const { data: bobClaims } = await bobClient.from('claims')
      .select('id, user_id').eq('item_id', ctx.itemAliceOwns);
    expect(bobClaims).toHaveLength(1);
  });

  it('honoree does NOT see is_claimed via get_event_view (masked null)', async () => {
    const admin = adminClient();
    const { data: ev } = await admin.from('events')
      .insert({ honoree_id: ctx.alice, title: 'mask test' })
      .select('id, share_token').single();
    await admin.from('event_items').insert({ event_id: ev!.id, item_id: ctx.itemAliceOwns });
    await admin.from('event_participants').insert({
      event_id: ev!.id, user_id: ctx.bob, status: 'active', joined_at: new Date().toISOString(),
    });
    const bobClient = await clientFor(ctx.bob);
    await bobClient.from('claims').insert({ item_id: ctx.itemAliceOwns, user_id: ctx.bob });

    const aliceClient = await clientFor(ctx.alice);
    const { data } = await aliceClient.rpc('get_event_view', { _token: ev!.share_token });
    expect(data![0].items[0].is_claimed).toBeNull();
  });

  it('honoree does NOT see claimers via People list (events-only derivation)', async () => {
    // get_my_people derives from event_participants only, NOT claims —
    // a user who claims an item but is not a participant should NOT
    // appear in honoree's People list.
    const admin = adminClient();
    // Dave is in alice's seed group (legacy item_groups path), so he CAN claim
    // alice's item. But he's NOT a participant in any event.
    await admin.from('claims').insert({ item_id: ctx.itemAliceOwns, user_id: ctx.dave });

    const aliceClient = await clientFor(ctx.alice);
    const { data: people } = await aliceClient.rpc('get_my_people');
    expect(people!.map((p: { user_id: string }) => p.user_id)).not.toContain(ctx.dave);
  });
});
