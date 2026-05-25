// supabase/tests/integration/event-items-visibility.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { adminClient, clientFor } from './helpers/client.ts';
import { seedFresh, seedEvent, type SeedContext } from './helpers/seed.ts';

describe('Invariant C — event_items visibility through audience circles', () => {
  let ctx: SeedContext;

  beforeEach(async () => {
    ctx = await seedFresh();
  });

  it('active participant sees event_items the honoree added', async () => {
    const ev = await seedEvent(ctx, 'alice', {
      participants: ['bob'],
      curatedItems: [ctx.itemAliceOwns],
    });
    const bobClient = await clientFor(ctx.bob);
    const { data, error } = await bobClient
      .from('event_items')
      .select('event_id, item_id')
      .eq('event_id', ev.eventId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]?.item_id).toBe(ctx.itemAliceOwns);
  });

  it('active participant does NOT see honoree items not added to the event', async () => {
    const admin = adminClient();
    const { data: item2, error: i2err } = await admin
      .from('items')
      .insert({ owner_id: ctx.alice, title: 'Second alice item, NOT on event' })
      .select('id')
      .single();
    expect(i2err).toBeNull();

    await seedEvent(ctx, 'alice', {
      participants: ['bob'],
      curatedItems: [ctx.itemAliceOwns],
    });

    const bobClient = await clientFor(ctx.bob);
    const { data, error } = await bobClient
      .from('items')
      .select('id')
      .in('id', [ctx.itemAliceOwns, item2!.id]);
    expect(error).toBeNull();
    const ids = data?.map((r) => r.id);
    expect(ids).toContain(ctx.itemAliceOwns);
    expect(ids).not.toContain(item2!.id);
  });

  it('non-participant user sees nothing about the event', async () => {
    // Event with only carol as participant — bob is in seed group with alice but
    // is NOT a participant in this event.
    const ev = await seedEvent(ctx, 'alice', {
      participants: ['carol'],
      curatedItems: [ctx.itemAliceOwns],
    });

    const bobClient = await clientFor(ctx.bob);
    const { data: events, error: eErr } = await bobClient
      .from('events')
      .select('id')
      .eq('id', ev.eventId);
    expect(eErr).toBeNull();
    expect(events).toEqual([]);
  });

  it("honoree cannot insert into event_items pointing at someone else's item", async () => {
    const admin = adminClient();
    const { data: bobItem, error: bErr } = await admin
      .from('items')
      .insert({ owner_id: ctx.bob, title: 'Bob owns this' })
      .select('id')
      .single();
    expect(bErr).toBeNull();
    const ev = await seedEvent(ctx, 'alice');

    const aliceClient = await clientFor(ctx.alice);
    const { data, error } = await aliceClient
      .from('event_items')
      .insert({ event_id: ev.eventId, item_id: bobItem!.id });
    expect(data).toBeNull();
    expect(error).toBeTruthy();
    expect(error?.code).toBe('42501');
  });

  it("honoree cannot add event_items to someone else's event", async () => {
    const ev = await seedEvent(ctx, 'bob');
    const aliceClient = await clientFor(ctx.alice);
    const { data, error } = await aliceClient
      .from('event_items')
      .insert({ event_id: ev.eventId, item_id: ctx.itemAliceOwns });
    expect(data).toBeNull();
    expect(error).toBeTruthy();
    expect(error?.code).toBe('42501');
  });
});
