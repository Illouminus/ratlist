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
