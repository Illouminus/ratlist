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

describe('event_participants RLS', () => {
  let ctx: SeedContext;
  beforeEach(async () => { ctx = await seedFresh(); });

  async function makeEvent(honoree: string): Promise<string> {
    const admin = adminClient();
    const { data: ev } = await admin.from('events')
      .insert({ honoree_id: honoree, title: 'p-test' }).select('id').single();
    return ev!.id;
  }

  it('SELECT: own row visible, even when pending', async () => {
    const admin = adminClient();
    const evId = await makeEvent(ctx.alice);
    await admin.from('event_participants').insert({
      event_id: evId, user_id: ctx.bob, status: 'pending',
      invited_by: ctx.alice, invited_at: new Date().toISOString(),
    });
    const bobClient = await clientFor(ctx.bob);
    const { data } = await bobClient.from('event_participants').select('id, status').eq('event_id', evId);
    expect(data).toHaveLength(1);
    expect(data?.[0]?.status).toBe('pending');
  });

  it('SELECT: honoree sees all (active + pending)', async () => {
    const admin = adminClient();
    const evId = await makeEvent(ctx.alice);
    await admin.from('event_participants').insert([
      { event_id: evId, user_id: ctx.bob, status: 'active', joined_at: new Date().toISOString() },
      { event_id: evId, user_id: ctx.carol, status: 'pending', invited_by: ctx.alice, invited_at: new Date().toISOString() },
    ]);
    const aliceClient = await clientFor(ctx.alice);
    const { data } = await aliceClient.from('event_participants').select('user_id, status').eq('event_id', evId);
    expect(data).toHaveLength(2);
  });

  it('SELECT: co-active sees others (including pending)', async () => {
    const admin = adminClient();
    const evId = await makeEvent(ctx.alice);
    await admin.from('event_participants').insert([
      { event_id: evId, user_id: ctx.bob, status: 'active', joined_at: new Date().toISOString() },
      { event_id: evId, user_id: ctx.carol, status: 'pending', invited_by: ctx.alice, invited_at: new Date().toISOString() },
    ]);
    const bobClient = await clientFor(ctx.bob);
    const { data } = await bobClient.from('event_participants').select('user_id, status').eq('event_id', evId);
    // Bob (active) sees Carol (pending) via is_active_event_participant helper path
    expect(data).toHaveLength(2);
  });

  it('SELECT: pending only sees own row', async () => {
    const admin = adminClient();
    const evId = await makeEvent(ctx.alice);
    await admin.from('event_participants').insert([
      { event_id: evId, user_id: ctx.bob, status: 'active', joined_at: new Date().toISOString() },
      { event_id: evId, user_id: ctx.carol, status: 'pending', invited_by: ctx.alice, invited_at: new Date().toISOString() },
    ]);
    const carolClient = await clientFor(ctx.carol);
    const { data } = await carolClient.from('event_participants').select('user_id').eq('event_id', evId);
    expect(data).toHaveLength(1);
    expect(data?.[0]?.user_id).toBe(ctx.carol);
  });

  it('INSERT: honoree can pre-invite as pending', async () => {
    const evId = await makeEvent(ctx.alice);
    const aliceClient = await clientFor(ctx.alice);
    const { error } = await aliceClient.from('event_participants').insert({
      event_id: evId, user_id: ctx.bob, status: 'pending',
      invited_by: ctx.alice, invited_at: new Date().toISOString(),
    });
    expect(error).toBeNull();
  });

  it('INSERT: non-honoree CANNOT insert', async () => {
    const evId = await makeEvent(ctx.alice);
    const bobClient = await clientFor(ctx.bob);
    const { error } = await bobClient.from('event_participants').insert({
      event_id: evId, user_id: ctx.carol, status: 'pending',
      invited_by: ctx.bob, invited_at: new Date().toISOString(),
    });
    expect(error).toBeTruthy();
    expect(error?.code).toBe('42501');
  });

  it('INSERT: honoree CANNOT insert active status directly (policy requires pending)', async () => {
    const evId = await makeEvent(ctx.alice);
    const aliceClient = await clientFor(ctx.alice);
    const { error } = await aliceClient.from('event_participants').insert({
      event_id: evId, user_id: ctx.bob, status: 'active', joined_at: new Date().toISOString(),
    });
    expect(error).toBeTruthy();
  });

  it('UPDATE: own row — can flip to declined', async () => {
    const admin = adminClient();
    const evId = await makeEvent(ctx.alice);
    await admin.from('event_participants').insert({
      event_id: evId, user_id: ctx.bob, status: 'pending',
      invited_by: ctx.alice, invited_at: new Date().toISOString(),
    });
    const bobClient = await clientFor(ctx.bob);
    const { error } = await bobClient.from('event_participants')
      .update({ status: 'declined' })
      .eq('event_id', evId).eq('user_id', ctx.bob);
    expect(error).toBeNull();
  });

  it('DELETE: only honoree can delete (kick)', async () => {
    const admin = adminClient();
    const evId = await makeEvent(ctx.alice);
    await admin.from('event_participants').insert({
      event_id: evId, user_id: ctx.bob, status: 'active', joined_at: new Date().toISOString(),
    });
    const bobClient = await clientFor(ctx.bob);
    await bobClient.from('event_participants').delete().eq('event_id', evId).eq('user_id', ctx.bob);
    const { count: stillThere } = await admin.from('event_participants')
      .select('*', { count: 'exact', head: true }).eq('event_id', evId);
    expect(stillThere).toBe(1);

    const aliceClient = await clientFor(ctx.alice);
    const { error: aliceErr } = await aliceClient.from('event_participants')
      .delete().eq('event_id', evId).eq('user_id', ctx.bob);
    expect(aliceErr).toBeNull();
  });
});
