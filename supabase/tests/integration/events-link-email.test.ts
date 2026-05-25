import { describe, it, expect } from 'vitest';
import { adminClient } from './helpers/client.ts';

describe('event_email_log table', () => {
  it('exists with expected columns', async () => {
    const admin = adminClient();
    const { error } = await admin
      .from('event_email_log')
      .select('id, event_id, recipient_id, email_type, sent_at, created_at')
      .limit(1);
    expect(error).toBeNull();
  });

  it('UNIQUE (event_id, recipient_id, email_type) enforced', async () => {
    const admin = adminClient();
    const userId = '55555555-5555-5555-5555-555555555555';
    await admin.auth.admin
      .createUser({
        id: userId,
        email: 'eel@test.local',
        password: 'test-test-test',
        email_confirm: true,
      })
      .catch(() => {});
    await admin
      .from('profiles')
      .upsert({ id: userId, display_name: 'eel', handle: 'eel' });
    const { data: ev } = await admin
      .from('events')
      .insert({ honoree_id: userId, title: 'eel test' })
      .select('id')
      .single();

    const { error: err1 } = await admin.from('event_email_log').insert({
      event_id: ev!.id,
      recipient_id: userId,
      email_type: 'invite',
    });
    expect(err1).toBeNull();

    const { error: err2 } = await admin.from('event_email_log').insert({
      event_id: ev!.id,
      recipient_id: userId,
      email_type: 'invite',
    });
    expect(err2?.code).toBe('23505');

    // cleanup
    await admin.from('events').delete().eq('id', ev!.id);
    await admin.auth.admin.deleteUser(userId);
  });

  it('rejects unknown email_type via CHECK constraint', async () => {
    const admin = adminClient();
    const userId = '55555555-5555-5555-5555-555555555556';
    await admin.auth.admin
      .createUser({
        id: userId,
        email: 'eel2@test.local',
        password: 'test-test-test',
        email_confirm: true,
      })
      .catch(() => {});
    await admin
      .from('profiles')
      .upsert({ id: userId, display_name: 'eel2', handle: 'eel2' });
    const { data: ev } = await admin
      .from('events')
      .insert({ honoree_id: userId, title: 'eel2 test' })
      .select('id')
      .single();

    const { error } = await admin.from('event_email_log').insert({
      event_id: ev!.id,
      recipient_id: userId,
      email_type: 'bogus_type',
    });
    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/check constraint|invalid input/i);

    // cleanup
    await admin.from('events').delete().eq('id', ev!.id);
    await admin.auth.admin.deleteUser(userId);
  });
});
