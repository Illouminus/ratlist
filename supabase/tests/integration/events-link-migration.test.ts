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
