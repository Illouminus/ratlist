// supabase/tests/integration/santa-draw.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { adminClient, clientFor } from './helpers/client.ts';
import {
  seedFresh,
  seedSantaEvent,
  insertExclusion,
  type SeedContext,
} from './helpers/seed.ts';

describe('run_santa_draw correctness', () => {
  let ctx: SeedContext;

  beforeEach(async () => {
    ctx = await seedFresh();
  });

  it('produces a valid derangement (no self-gifting) for 4 participants', async () => {
    const santa = await seedSantaEvent(ctx, 'alice', ['alice', 'bob', 'carol', 'dave']);
    const aliceClient = await clientFor(ctx.alice);
    const { error } = await aliceClient.rpc('run_santa_draw', { _event_id: santa.eventId });
    expect(error).toBeNull();

    const admin = adminClient();
    const { data, error: aErr } = await admin
      .from('santa_assignments')
      .select('giver_id, receiver_id')
      .eq('event_id', santa.eventId);
    expect(aErr).toBeNull();
    expect(data).toHaveLength(4);
    for (const a of data ?? []) {
      expect(a.giver_id).not.toBe(a.receiver_id);
    }
    const givers = new Set((data ?? []).map((r) => r.giver_id));
    const receivers = new Set((data ?? []).map((r) => r.receiver_id));
    expect(givers.size).toBe(4);
    expect(receivers.size).toBe(4);
  });

  it('respects exclusions (alice excludes bob → alice does not give to bob)', async () => {
    const santa = await seedSantaEvent(ctx, 'alice', ['alice', 'bob', 'carol', 'dave']);
    await insertExclusion(santa.eventId, ctx.alice, ctx.bob);

    const aliceClient = await clientFor(ctx.alice);
    const { error } = await aliceClient.rpc('run_santa_draw', { _event_id: santa.eventId });
    expect(error).toBeNull();

    const admin = adminClient();
    const { data } = await admin
      .from('santa_assignments')
      .select('giver_id, receiver_id')
      .eq('event_id', santa.eventId);
    const aliceAssignment = (data ?? []).find((a) => a.giver_id === ctx.alice);
    expect(aliceAssignment).toBeTruthy();
    expect(aliceAssignment?.receiver_id).not.toBe(ctx.bob);
  });

  it('rejects fewer than 2 participants', async () => {
    const santa = await seedSantaEvent(ctx, 'alice', ['alice']);
    const aliceClient = await clientFor(ctx.alice);
    const { error } = await aliceClient.rpc('run_santa_draw', { _event_id: santa.eventId });
    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/too_few_participants/);
  });

  it('rejects impossible exclusion graph', async () => {
    const santa = await seedSantaEvent(ctx, 'alice', ['alice', 'bob']);
    await insertExclusion(santa.eventId, ctx.alice, ctx.bob);
    await insertExclusion(santa.eventId, ctx.bob, ctx.alice);
    const aliceClient = await clientFor(ctx.alice);
    const { error } = await aliceClient.rpc('run_santa_draw', { _event_id: santa.eventId });
    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/no_valid_assignment/);
  });

  it('non-organiser caller is rejected', async () => {
    const santa = await seedSantaEvent(ctx, 'alice', ['alice', 'bob', 'carol']);
    const bobClient = await clientFor(ctx.bob);
    const { error } = await bobClient.rpc('run_santa_draw', { _event_id: santa.eventId });
    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/not_organi[sz]er/);
  });

  it('drawing twice keeps status drawn (wrong_status second time)', async () => {
    const santa = await seedSantaEvent(ctx, 'alice', ['alice', 'bob', 'carol']);
    const aliceClient = await clientFor(ctx.alice);
    const first = await aliceClient.rpc('run_santa_draw', { _event_id: santa.eventId });
    expect(first.error).toBeNull();

    const second = await aliceClient.rpc('run_santa_draw', { _event_id: santa.eventId });
    expect(second.error).toBeTruthy();
    expect(second.error?.message).toMatch(/wrong_status/);

    const admin = adminClient();
    const { data: ev } = await admin
      .from('santa_events')
      .select('status')
      .eq('id', santa.eventId)
      .maybeSingle();
    expect(ev?.status).toBe('drawn');
  });
});
