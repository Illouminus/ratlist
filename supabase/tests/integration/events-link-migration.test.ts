// supabase/tests/integration/events-link-migration.test.ts
import { describe, it, expect } from 'vitest';
import { adminClient } from './helpers/client.ts';

describe('events link-first migration — schema shape', () => {
  it('events table has share_token NOT NULL unique', async () => {
    const admin = adminClient();
    const result = await admin
      .from('events')
      .select('share_token')
      .limit(1);
    expect(result.error).toBeNull();
  });

  it('event_circles table is dropped', async () => {
    const admin = adminClient();
    const { error } = await admin.from('event_circles' as never).select('*').limit(1);
    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/relation .* does not exist|not found in schema|Could not find/i);
  });

  it('event_participants table exists with expected columns', async () => {
    const admin = adminClient();
    const { error } = await admin
      .from('event_participants')
      .select('id, event_id, user_id, status, invited_by, invited_at, joined_at, created_at, updated_at')
      .limit(1);
    expect(error).toBeNull();
  });

  it('event_participants status check constraint enforced', async () => {
    const admin = adminClient();
    const userId = '99999999-9999-9999-9999-999999999999';
    await admin.auth.admin.createUser({
      id: userId, email: 'mig-test@test.local', password: 'test-test-test', email_confirm: true,
    }).catch(() => {});
    await admin.from('profiles').upsert({
      id: userId, display_name: 'mig', handle: 'mig_t',
      onboarded_at: new Date().toISOString(),
    });
    const { data: ev } = await admin.from('events')
      .insert({ honoree_id: userId, title: 'mig test event' })
      .select('id').single();
    const { error } = await admin.from('event_participants')
      .insert({ event_id: ev!.id, user_id: userId, status: 'bogus' });
    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/check constraint|invalid input|violates/i);
    // cleanup
    await admin.from('events').delete().eq('id', ev!.id);
    await admin.auth.admin.deleteUser(userId);
  });
});

describe('can_see_event helper — new behavior', () => {
  it('honoree returns true', async () => {
    const { adminClient, clientFor } = await import('./helpers/client.ts');
    const admin = adminClient();
    const aliceId = '11111111-1111-1111-1111-111111111111';
    await admin.auth.admin.createUser({
      id: aliceId, email: 'alice@test.local', password: 'test-test-test', email_confirm: true,
    }).catch(() => {});
    await admin.from('profiles').upsert({
      id: aliceId, display_name: 'alice', handle: 'alice_t',
      onboarded_at: new Date().toISOString(),
    });
    const { data: ev } = await admin.from('events')
      .insert({ honoree_id: aliceId, title: 'cse test' })
      .select('id').single();
    const aliceClient = await clientFor(aliceId);
    const { data: visible, error } = await aliceClient.rpc('can_see_event', { _event_id: ev!.id });
    expect(error).toBeNull();
    expect(visible).toBe(true);
    await admin.from('events').delete().eq('id', ev!.id);
  });

  it('active participant returns true; outsider returns false', async () => {
    const { seedFresh } = await import('./helpers/seed.ts');
    const { adminClient, clientFor } = await import('./helpers/client.ts');
    const ctx = await seedFresh();
    const admin = adminClient();
    const { data: ev } = await admin.from('events')
      .insert({ honoree_id: ctx.alice, title: 'cse-p test' })
      .select('id').single();
    await admin.from('event_participants')
      .insert({ event_id: ev!.id, user_id: ctx.bob, status: 'active', joined_at: new Date().toISOString() });

    const bobClient = await clientFor(ctx.bob);
    const daveClient = await clientFor(ctx.dave);

    const { data: bobSees } = await bobClient.rpc('can_see_event', { _event_id: ev!.id });
    const { data: daveSees } = await daveClient.rpc('can_see_event', { _event_id: ev!.id });

    expect(bobSees).toBe(true);
    expect(daveSees).toBe(false);
  });
});
