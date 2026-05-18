// supabase/tests/integration/santa-assignments-privacy.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { adminClient, clientFor } from './helpers/client.ts';
import {
  seedFresh,
  seedSantaEvent,
  insertAssignment,
  type SeedContext,
} from './helpers/seed.ts';

describe('Invariant B — santa_assignments giver-only until reveal', () => {
  let ctx: SeedContext;

  beforeEach(async () => {
    ctx = await seedFresh();
  });

  it('giver sees own assignment in collecting/drawn state', async () => {
    const santa = await seedSantaEvent(ctx, 'alice', ['alice', 'bob', 'carol'], { status: 'drawn' });
    await insertAssignment(santa.eventId, ctx.bob, ctx.carol);

    const bobClient = await clientFor(ctx.bob);
    const { data, error } = await bobClient
      .from('santa_assignments')
      .select('giver_id, receiver_id')
      .eq('event_id', santa.eventId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]).toEqual({ giver_id: ctx.bob, receiver_id: ctx.carol });
  });

  it('receiver does NOT see their own assignment before reveal', async () => {
    const santa = await seedSantaEvent(ctx, 'alice', ['alice', 'bob', 'carol'], { status: 'drawn' });
    await insertAssignment(santa.eventId, ctx.bob, ctx.carol);

    const carolClient = await clientFor(ctx.carol);
    const { data, error } = await carolClient
      .from('santa_assignments')
      .select('giver_id, receiver_id')
      .eq('event_id', santa.eventId)
      .eq('receiver_id', ctx.carol);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('organiser who is NOT a participant sees nothing before reveal', async () => {
    const santa = await seedSantaEvent(ctx, 'alice', ['bob', 'carol', 'dave'], { status: 'drawn' });
    await insertAssignment(santa.eventId, ctx.bob, ctx.carol);
    await insertAssignment(santa.eventId, ctx.carol, ctx.dave);
    await insertAssignment(santa.eventId, ctx.dave, ctx.bob);

    const aliceClient = await clientFor(ctx.alice);
    const { data, error } = await aliceClient
      .from('santa_assignments')
      .select('giver_id')
      .eq('event_id', santa.eventId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('group member who did NOT join the event sees nothing', async () => {
    const santa = await seedSantaEvent(ctx, 'alice', ['alice', 'bob', 'carol'], { status: 'drawn' });
    await insertAssignment(santa.eventId, ctx.bob, ctx.carol);

    const daveClient = await clientFor(ctx.dave);
    const { data, error } = await daveClient
      .from('santa_assignments')
      .select('giver_id')
      .eq('event_id', santa.eventId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('after reveal, all group members see all assignments', async () => {
    const santa = await seedSantaEvent(ctx, 'alice', ['alice', 'bob', 'carol'], { status: 'collecting' });
    await insertAssignment(santa.eventId, ctx.alice, ctx.bob);
    await insertAssignment(santa.eventId, ctx.bob, ctx.carol);
    await insertAssignment(santa.eventId, ctx.carol, ctx.alice);

    const admin = adminClient();
    await admin.from('santa_events').update({ status: 'revealed' }).eq('id', santa.eventId);

    const daveClient = await clientFor(ctx.dave);
    const { data, error } = await daveClient
      .from('santa_assignments')
      .select('giver_id, receiver_id')
      .eq('event_id', santa.eventId);
    expect(error).toBeNull();
    expect(data).toHaveLength(3);
  });

  it('direct INSERT into santa_assignments by client is blocked', async () => {
    const santa = await seedSantaEvent(ctx, 'alice', ['alice', 'bob'], { status: 'drawn' });

    const aliceClient = await clientFor(ctx.alice);
    const { data, error } = await aliceClient.from('santa_assignments').insert({
      event_id: santa.eventId,
      giver_id: ctx.alice,
      receiver_id: ctx.bob,
    });
    expect(data).toBeNull();
    expect(error).toBeTruthy();
    expect(error?.code).toBe('42501');
  });
});
