import { describe, it, expect, beforeEach } from 'vitest';
import { adminClient, clientFor } from './helpers/client.ts';
import { seedFresh, type SeedContext } from './helpers/seed.ts';

describe('events RLS — link-first', () => {
  let ctx: SeedContext;
  beforeEach(async () => { ctx = await seedFresh(); });

  it('honoree can SELECT own event', async () => {
    const admin = adminClient();
    const { data: ev } = await admin.from('events')
      .insert({ honoree_id: ctx.alice, title: 'a' }).select('id').single();
    const aliceClient = await clientFor(ctx.alice);
    const { data } = await aliceClient.from('events').select('id').eq('id', ev!.id);
    expect(data).toHaveLength(1);
  });

  it('active participant can SELECT event', async () => {
    const admin = adminClient();
    const { data: ev } = await admin.from('events')
      .insert({ honoree_id: ctx.alice, title: 'b' }).select('id').single();
    await admin.from('event_participants').insert({
      event_id: ev!.id, user_id: ctx.bob, status: 'active', joined_at: new Date().toISOString(),
    });
    const bobClient = await clientFor(ctx.bob);
    const { data } = await bobClient.from('events').select('id').eq('id', ev!.id);
    expect(data).toHaveLength(1);
  });

  it('pending participant CANNOT SELECT event (until join)', async () => {
    const admin = adminClient();
    const { data: ev } = await admin.from('events')
      .insert({ honoree_id: ctx.alice, title: 'c' }).select('id').single();
    await admin.from('event_participants').insert({
      event_id: ev!.id, user_id: ctx.bob, status: 'pending',
      invited_by: ctx.alice, invited_at: new Date().toISOString(),
    });
    const bobClient = await clientFor(ctx.bob);
    const { data } = await bobClient.from('events').select('id').eq('id', ev!.id);
    expect(data).toEqual([]);
  });

  it('outsider CANNOT SELECT event', async () => {
    const admin = adminClient();
    const { data: ev } = await admin.from('events')
      .insert({ honoree_id: ctx.alice, title: 'd' }).select('id').single();
    const daveClient = await clientFor(ctx.dave);
    const { data } = await daveClient.from('events').select('id').eq('id', ev!.id);
    expect(data).toEqual([]);
  });

  it('non-honoree CANNOT UPDATE event', async () => {
    const admin = adminClient();
    const { data: ev } = await admin.from('events')
      .insert({ honoree_id: ctx.alice, title: 'e' }).select('id').single();
    await admin.from('event_participants').insert({
      event_id: ev!.id, user_id: ctx.bob, status: 'active', joined_at: new Date().toISOString(),
    });
    const bobClient = await clientFor(ctx.bob);
    await bobClient.from('events').update({ title: 'hijacked' }).eq('id', ev!.id);
    const { data: after } = await admin.from('events').select('title').eq('id', ev!.id).single();
    expect(after?.title).toBe('e');
  });
});
