import { describe, it, expect, beforeEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { adminClient, clientFor } from './helpers/client.ts';
import { SUPABASE_URL, ANON_KEY } from './helpers/env.ts';
import { seedFresh, type SeedContext } from './helpers/seed.ts';

const anonClient = () => createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

describe('RPC get_event_view', () => {
  let ctx: SeedContext;
  let eventId: string;
  let shareToken: string;

  beforeEach(async () => {
    ctx = await seedFresh();
    const admin = adminClient();
    const { data: ev } = await admin.from('events')
      .insert({ honoree_id: ctx.alice, title: 'View Test' })
      .select('id, share_token').single();
    eventId = ev!.id;
    shareToken = ev!.share_token;
    await admin.from('event_items')
      .insert({ event_id: eventId, item_id: ctx.itemAliceOwns });
  });

  it('anon with valid token sees event + items, claim status is null', async () => {
    const { data, error } = await anonClient().rpc('get_event_view', { _token: shareToken });
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    const row = data![0];
    expect(row.event_id).toBe(eventId);
    expect(row.title).toBe('View Test');
    expect(row.my_status).toBe('anon');
    expect(row.items).toHaveLength(1);
    expect(row.items[0].id).toBe(ctx.itemAliceOwns);
    expect(row.items[0].is_claimed).toBeNull();
  });

  it('anon with invalid token raises event_not_found', async () => {
    const { error } = await anonClient().rpc('get_event_view', { _token: 'badbadbadbadbadx' });
    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/event_not_found/);
  });

  it('honoree sees event with claim status MASKED (null)', async () => {
    const aliceClient = await clientFor(ctx.alice);
    const { data } = await aliceClient.rpc('get_event_view', { _token: shareToken });
    const row = data![0];
    expect(row.my_status).toBe('honoree');
    expect(row.items[0].is_claimed).toBeNull();
  });

  it('active participant (non-honoree) sees claim status', async () => {
    const admin = adminClient();
    await admin.from('event_participants').insert({
      event_id: eventId, user_id: ctx.bob, status: 'active', joined_at: new Date().toISOString(),
    });
    const bobClient = await clientFor(ctx.bob);
    const { data } = await bobClient.rpc('get_event_view', { _token: shareToken });
    const row = data![0];
    expect(row.my_status).toBe('active');
    expect(row.items[0].is_claimed).toBe(false);
  });

  it('participant_count counts active only', async () => {
    const admin = adminClient();
    await admin.from('event_participants').insert([
      { event_id: eventId, user_id: ctx.bob, status: 'active', joined_at: new Date().toISOString() },
      { event_id: eventId, user_id: ctx.carol, status: 'pending', invited_by: ctx.alice, invited_at: new Date().toISOString() },
    ]);
    const { data } = await anonClient().rpc('get_event_view', { _token: shareToken });
    expect(data![0].participant_count).toBe(1);
  });
});

describe('RPC join_event_via_token', () => {
  let ctx: SeedContext;
  let eventId: string;
  let shareToken: string;

  beforeEach(async () => {
    ctx = await seedFresh();
    const admin = adminClient();
    const { data: ev } = await admin.from('events')
      .insert({ honoree_id: ctx.alice, title: 'Join Test' })
      .select('id, share_token').single();
    eventId = ev!.id;
    shareToken = ev!.share_token;
  });

  it('anon caller raises not_authenticated', async () => {
    const { error } = await anonClient().rpc('join_event_via_token', { _token: shareToken });
    expect(error?.message).toMatch(/not_authenticated/);
  });

  it('invalid token raises event_not_found', async () => {
    const bobClient = await clientFor(ctx.bob);
    const { error } = await bobClient.rpc('join_event_via_token', { _token: 'invalid_token_x' });
    expect(error?.message).toMatch(/event_not_found/);
  });

  it('new visitor: creates active participant row, returns event_id', async () => {
    const bobClient = await clientFor(ctx.bob);
    const { data, error } = await bobClient.rpc('join_event_via_token', { _token: shareToken });
    expect(error).toBeNull();
    expect(data).toBe(eventId);
    const admin = adminClient();
    const { data: row } = await admin.from('event_participants')
      .select('status, joined_at')
      .eq('event_id', eventId).eq('user_id', ctx.bob).single();
    expect(row?.status).toBe('active');
    expect(row?.joined_at).toBeTruthy();
  });

  it('pre-invited (pending) flips to active', async () => {
    const admin = adminClient();
    await admin.from('event_participants').insert({
      event_id: eventId, user_id: ctx.bob, status: 'pending',
      invited_by: ctx.alice, invited_at: new Date().toISOString(),
    });
    const bobClient = await clientFor(ctx.bob);
    await bobClient.rpc('join_event_via_token', { _token: shareToken });
    const { data: row } = await admin.from('event_participants')
      .select('status, joined_at')
      .eq('event_id', eventId).eq('user_id', ctx.bob).single();
    expect(row?.status).toBe('active');
    expect(row?.joined_at).toBeTruthy();
  });

  it('idempotent: calling twice does not create duplicate', async () => {
    const bobClient = await clientFor(ctx.bob);
    await bobClient.rpc('join_event_via_token', { _token: shareToken });
    await bobClient.rpc('join_event_via_token', { _token: shareToken });
    const admin = adminClient();
    const { count } = await admin.from('event_participants')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId).eq('user_id', ctx.bob);
    expect(count).toBe(1);
  });

  it('honoree calling: no participant row created, returns event_id', async () => {
    const aliceClient = await clientFor(ctx.alice);
    const { data } = await aliceClient.rpc('join_event_via_token', { _token: shareToken });
    expect(data).toBe(eventId);
    const admin = adminClient();
    const { count } = await admin.from('event_participants')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId).eq('user_id', ctx.alice);
    expect(count).toBe(0);
  });
});

describe('RPC invite_to_event', () => {
  let ctx: SeedContext;
  let eventId: string;

  beforeEach(async () => {
    ctx = await seedFresh();
    const admin = adminClient();
    const { data: ev } = await admin.from('events')
      .insert({ honoree_id: ctx.alice, title: 'Invite Test' })
      .select('id').single();
    eventId = ev!.id;
  });

  it('honoree inserts pending invites for multiple users', async () => {
    const aliceClient = await clientFor(ctx.alice);
    const { data, error } = await aliceClient.rpc('invite_to_event', {
      _event_id: eventId, _user_ids: [ctx.bob, ctx.carol],
    });
    expect(error).toBeNull();
    expect(data).toBe(2);
    const admin = adminClient();
    const { data: rows } = await admin.from('event_participants')
      .select('user_id, status, invited_by').eq('event_id', eventId);
    expect(rows).toHaveLength(2);
    rows!.forEach((r) => {
      expect(r.status).toBe('pending');
      expect(r.invited_by).toBe(ctx.alice);
    });
  });

  it('non-honoree cannot invite — RLS blocks INSERT', async () => {
    const bobClient = await clientFor(ctx.bob);
    const { error } = await bobClient.rpc('invite_to_event', {
      _event_id: eventId, _user_ids: [ctx.carol],
    });
    expect(error).toBeTruthy();
    expect(error?.code).toBe('42501');
  });

  it('duplicate invite is skipped, returns count of NEW inserts only', async () => {
    const admin = adminClient();
    await admin.from('event_participants').insert({
      event_id: eventId, user_id: ctx.bob, status: 'pending',
      invited_by: ctx.alice, invited_at: new Date().toISOString(),
    });
    const aliceClient = await clientFor(ctx.alice);
    const { data } = await aliceClient.rpc('invite_to_event', {
      _event_id: eventId, _user_ids: [ctx.bob, ctx.carol],
    });
    expect(data).toBe(1);
  });
});

describe('RPC get_my_people', () => {
  let ctx: SeedContext;
  beforeEach(async () => { ctx = await seedFresh(); });

  it('returns co-active-participants from my events', async () => {
    const admin = adminClient();
    const { data: ev } = await admin.from('events')
      .insert({ honoree_id: ctx.alice, title: 'p test' }).select('id').single();
    await admin.from('event_participants').insert([
      { event_id: ev!.id, user_id: ctx.bob, status: 'active', joined_at: new Date().toISOString() },
      { event_id: ev!.id, user_id: ctx.carol, status: 'active', joined_at: new Date().toISOString() },
    ]);
    const aliceClient = await clientFor(ctx.alice);
    const { data } = await aliceClient.rpc('get_my_people');
    expect(data).toHaveLength(2);
    const ids = data!.map((r: { user_id: string }) => r.user_id).sort();
    expect(ids).toEqual([ctx.bob, ctx.carol].sort());
  });

  it('excludes self', async () => {
    const admin = adminClient();
    const { data: ev } = await admin.from('events')
      .insert({ honoree_id: ctx.alice, title: 'exclude self' }).select('id').single();
    await admin.from('event_participants').insert({
      event_id: ev!.id, user_id: ctx.bob, status: 'active', joined_at: new Date().toISOString(),
    });
    const aliceClient = await clientFor(ctx.alice);
    const { data } = await aliceClient.rpc('get_my_people');
    expect(data!.map((r: { user_id: string }) => r.user_id)).not.toContain(ctx.alice);
  });

  it('excludes pending participants', async () => {
    const admin = adminClient();
    const { data: ev } = await admin.from('events')
      .insert({ honoree_id: ctx.alice, title: 'pending' }).select('id').single();
    await admin.from('event_participants').insert({
      event_id: ev!.id, user_id: ctx.bob, status: 'pending',
      invited_by: ctx.alice, invited_at: new Date().toISOString(),
    });
    const aliceClient = await clientFor(ctx.alice);
    const { data } = await aliceClient.rpc('get_my_people');
    expect(data).toHaveLength(0);
  });

  it('empty for user with no events', async () => {
    const daveClient = await clientFor(ctx.dave);
    const { data } = await daveClient.rpc('get_my_people');
    expect(data).toEqual([]);
  });
});

describe('RPC get_my_events — updated shape', () => {
  let ctx: SeedContext;
  beforeEach(async () => { ctx = await seedFresh(); });

  it('returns share_token, participant_count, my_status; does NOT return audience_circle_count', async () => {
    const admin = adminClient();
    const { data: ev } = await admin.from('events')
      .insert({ honoree_id: ctx.alice, title: 'shape test' })
      .select('id, share_token').single();
    await admin.from('event_participants').insert({
      event_id: ev!.id, user_id: ctx.bob, status: 'active', joined_at: new Date().toISOString(),
    });

    const aliceClient = await clientFor(ctx.alice);
    const { data, error } = await aliceClient.rpc('get_my_events');
    expect(error).toBeNull();
    const row = (data as Array<{ id: string; share_token: string; participant_count: number; my_status: string }>).find((r) => r.id === ev!.id)!;
    expect(row.share_token).toBe(ev!.share_token);
    expect(row.participant_count).toBe(1);
    expect(row.my_status).toBe('honoree');
    expect((row as Record<string, unknown>).audience_circle_count).toBeUndefined();
  });

  it('includes events where I am active participant', async () => {
    const admin = adminClient();
    const { data: ev } = await admin.from('events')
      .insert({ honoree_id: ctx.alice, title: 'bob-as-active' }).select('id').single();
    await admin.from('event_participants').insert({
      event_id: ev!.id, user_id: ctx.bob, status: 'active', joined_at: new Date().toISOString(),
    });
    const bobClient = await clientFor(ctx.bob);
    const { data } = await bobClient.rpc('get_my_events');
    const row = (data as Array<{ id: string; my_status: string }>).find((r) => r.id === ev!.id);
    expect(row).toBeTruthy();
    expect(row!.my_status).toBe('active');
  });

  it('includes events where I am pending invitee with my_status=pending', async () => {
    const admin = adminClient();
    const { data: ev } = await admin.from('events')
      .insert({ honoree_id: ctx.alice, title: 'pending-bob' }).select('id').single();
    await admin.from('event_participants').insert({
      event_id: ev!.id, user_id: ctx.bob, status: 'pending',
      invited_by: ctx.alice, invited_at: new Date().toISOString(),
    });
    const bobClient = await clientFor(ctx.bob);
    const { data } = await bobClient.rpc('get_my_events');
    const row = (data as Array<{ id: string; my_status: string }>).find((r) => r.id === ev!.id);
    expect(row).toBeTruthy();
    expect(row!.my_status).toBe('pending');
  });

  it('participant_count counts active only (not pending)', async () => {
    const admin = adminClient();
    const { data: ev } = await admin.from('events')
      .insert({ honoree_id: ctx.alice, title: 'count test' }).select('id').single();
    await admin.from('event_participants').insert([
      { event_id: ev!.id, user_id: ctx.bob, status: 'active', joined_at: new Date().toISOString() },
      { event_id: ev!.id, user_id: ctx.carol, status: 'pending', invited_by: ctx.alice, invited_at: new Date().toISOString() },
    ]);
    const aliceClient = await clientFor(ctx.alice);
    const { data } = await aliceClient.rpc('get_my_events');
    expect((data as Array<{ id: string; participant_count: number }>).find((r) => r.id === ev!.id)!.participant_count).toBe(1);
  });
});
