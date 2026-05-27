import { describe, it, expect, beforeEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { adminClient, clientFor } from './helpers/client.ts';
import { SUPABASE_URL, ANON_KEY } from './helpers/env.ts';
import { ensureTestUsers, truncateBetweenTests, TEST_USERS } from './helpers/seed.ts';

const anonClient = () => createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

describe('friend preview RPCs', () => {
  beforeEach(async () => {
    await truncateBetweenTests();
    await ensureTestUsers();
    // truncate_test_state intentionally keeps profiles; reset the
    // transient fields tests in this file mutate so order doesn't matter.
    const admin = adminClient();
    await admin.from('profiles')
      .update({ disabled_at: null, avatar_url: null, add_me_token: null })
      .in('id', Object.values(TEST_USERS));
  });

  describe('get_add_me_preview', () => {
    it('returns the owning profile for a valid token (anon caller)', async () => {
      const admin = adminClient();
      await admin.from('profiles')
        .update({ add_me_token: 'alice_link', avatar_url: 'https://example.test/a.png' })
        .eq('id', TEST_USERS.alice);

      const { data, error } = await anonClient().rpc('get_add_me_preview', {
        _token: 'alice_link',
      });
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data![0]).toMatchObject({
        id: TEST_USERS.alice,
        display_name: 'alice',
        handle: 'alice_t',
        avatar_url: 'https://example.test/a.png',
      });
    });

    it('returns zero rows for an unknown token', async () => {
      const { data, error } = await anonClient().rpc('get_add_me_preview', {
        _token: 'definitely_not_a_token',
      });
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it('returns zero rows when the owning profile is disabled', async () => {
      const admin = adminClient();
      await admin.from('profiles')
        .update({ add_me_token: 'alice_link', disabled_at: new Date().toISOString() })
        .eq('id', TEST_USERS.alice);

      const { data, error } = await anonClient().rpc('get_add_me_preview', {
        _token: 'alice_link',
      });
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it('is callable by an authenticated user (not only anon)', async () => {
      const admin = adminClient();
      await admin.from('profiles').update({ add_me_token: 'alice_link' }).eq('id', TEST_USERS.alice);

      const bob = await clientFor(TEST_USERS.bob);
      const { data, error } = await bob.rpc('get_add_me_preview', { _token: 'alice_link' });
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data![0].id).toBe(TEST_USERS.alice);
    });
  });

  describe('get_friend_invite_preview', () => {
    it('returns sender profile + recipient email for a pending invite', async () => {
      const admin = adminClient();
      await admin.from('profiles')
        .update({ avatar_url: 'https://example.test/a.png' })
        .eq('id', TEST_USERS.alice);

      const alice = await clientFor(TEST_USERS.alice);
      const { data: token } = await alice.rpc('create_friend_invite', {
        _email: 'bob@test.local',
        _message: null,
      });

      const { data, error } = await anonClient().rpc('get_friend_invite_preview', {
        _token: token as string,
      });
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data![0]).toMatchObject({
        from_user_id: TEST_USERS.alice,
        display_name: 'alice',
        handle: 'alice_t',
        avatar_url: 'https://example.test/a.png',
        to_email: 'bob@test.local',
      });
    });

    it('returns zero rows once the invite is accepted', async () => {
      const admin = adminClient();
      const alice = await clientFor(TEST_USERS.alice);
      const { data: token } = await alice.rpc('create_friend_invite', {
        _email: 'bob@test.local',
        _message: null,
      });

      await admin.from('friend_invites')
        .update({ accepted_at: new Date().toISOString() })
        .eq('token', token as string);

      const { data, error } = await anonClient().rpc('get_friend_invite_preview', {
        _token: token as string,
      });
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it('returns zero rows when the sender profile is disabled', async () => {
      const admin = adminClient();
      const alice = await clientFor(TEST_USERS.alice);
      const { data: token } = await alice.rpc('create_friend_invite', {
        _email: 'bob@test.local',
        _message: null,
      });
      await admin.from('profiles')
        .update({ disabled_at: new Date().toISOString() })
        .eq('id', TEST_USERS.alice);

      const { data, error } = await anonClient().rpc('get_friend_invite_preview', {
        _token: token as string,
      });
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it('returns zero rows for an unknown token', async () => {
      const { data, error } = await anonClient().rpc('get_friend_invite_preview', {
        _token: 'never_was_a_token',
      });
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });
  });
});
