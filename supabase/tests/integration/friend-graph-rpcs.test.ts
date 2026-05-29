import { describe, it, expect, beforeEach } from 'vitest';
import { adminClient, clientFor } from './helpers/client.ts';
import { ensureTestUsers, truncateBetweenTests, TEST_USERS } from './helpers/seed.ts';

describe('friend RPCs', () => {
  beforeEach(async () => {
    await truncateBetweenTests();
    await ensureTestUsers();
  });

  it('create_friend_invite returns token, upserts on (from_user, to_email)', async () => {
    const alice = await clientFor(TEST_USERS.alice);
    const { data: t1, error: e1 } = await alice.rpc('create_friend_invite', {
      _email: 'bob@external.test',
      _message: 'hey bob',
    });
    expect(e1).toBeNull();
    expect(typeof t1).toBe('string');
    expect((t1 as string).length).toBeGreaterThan(20);

    // Second call to same email replaces the token (resend behaviour)
    const { data: t2, error: e2 } = await alice.rpc('create_friend_invite', {
      _email: 'bob@external.test',
      _message: null,
    });
    expect(e2).toBeNull();
    expect(t2).not.toBe(t1);

    // Only one row in the table
    const admin = adminClient();
    const { data: rows } = await admin
      .from('friend_invites')
      .select('token')
      .eq('from_user', TEST_USERS.alice)
      .eq('to_email', 'bob@external.test');
    expect(rows).toHaveLength(1);
    expect(rows![0].token).toBe(t2);
  });

  it('accept_friend_invite inserts friendship when email matches', async () => {
    const admin = adminClient();
    // ensureTestUsers sets bob's email to 'bob@test.local'
    const alice = await clientFor(TEST_USERS.alice);
    const { data: token } = await alice.rpc('create_friend_invite', {
      _email: 'bob@test.local',
      _message: null,
    });
    const bob = await clientFor(TEST_USERS.bob);
    const { data: friendId, error } = await bob.rpc('accept_friend_invite', {
      _token: token,
    });
    expect(error).toBeNull();
    expect(friendId).toBe(TEST_USERS.alice);

    const lo = TEST_USERS.alice < TEST_USERS.bob ? TEST_USERS.alice : TEST_USERS.bob;
    const hi = TEST_USERS.alice < TEST_USERS.bob ? TEST_USERS.bob : TEST_USERS.alice;
    const { data: edge } = await admin
      .from('friendships')
      .select('user_a, user_b')
      .eq('user_a', lo)
      .eq('user_b', hi)
      .maybeSingle();
    expect(edge).not.toBeNull();

    const { data: inv } = await admin
      .from('friend_invites')
      .select('accepted_at')
      .eq('token', token as string)
      .single();
    expect(inv?.accepted_at).not.toBeNull();
  });

  it('accept_friend_invite rejects on mismatched email', async () => {
    const alice = await clientFor(TEST_USERS.alice);
    const { data: token } = await alice.rpc('create_friend_invite', {
      _email: 'bob@test.local',
      _message: null,
    });
    const carol = await clientFor(TEST_USERS.carol);
    const { error } = await carol.rpc('accept_friend_invite', { _token: token });
    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/email_mismatch/);
  });

  it('accept_friend_invite rejects on already-accepted token', async () => {
    const alice = await clientFor(TEST_USERS.alice);
    const { data: token } = await alice.rpc('create_friend_invite', {
      _email: 'bob@test.local',
      _message: null,
    });
    const bob = await clientFor(TEST_USERS.bob);
    await bob.rpc('accept_friend_invite', { _token: token });
    const { error } = await bob.rpc('accept_friend_invite', { _token: token });
    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/already_accepted/);
  });

  it('revoke_friend_invite removes sender\'s own pending invite', async () => {
    const admin = adminClient();
    const alice = await clientFor(TEST_USERS.alice);
    const { data: token } = await alice.rpc('create_friend_invite', {
      _email: 'someone@external.test',
      _message: null,
    });
    expect(typeof token).toBe('string');

    const { error } = await alice.rpc('revoke_friend_invite', { _token: token as string });
    expect(error).toBeNull();

    const { data: rows } = await admin
      .from('friend_invites')
      .select('token')
      .eq('token', token as string);
    expect(rows).toEqual([]);
  });

  it('revoke_friend_invite called by someone else leaves the row in place', async () => {
    // Alice creates an invite; Bob calls revoke. The RPC's
    // `from_user = caller` filter scopes the delete to Alice's own
    // rows, so Bob's call no-ops without raising.
    const admin = adminClient();
    const alice = await clientFor(TEST_USERS.alice);
    const { data: token } = await alice.rpc('create_friend_invite', {
      _email: 'someone-else@external.test',
      _message: null,
    });
    expect(typeof token).toBe('string');

    const bob = await clientFor(TEST_USERS.bob);
    const { error } = await bob.rpc('revoke_friend_invite', { _token: token as string });
    expect(error).toBeNull();

    const { data: rows } = await admin
      .from('friend_invites')
      .select('token')
      .eq('token', token as string);
    expect(rows).toHaveLength(1);
  });

  it('rotate_add_me_token gives new token, old one stops working', async () => {
    const admin = adminClient();
    const alice = await clientFor(TEST_USERS.alice);
    await admin.from('profiles').update({ add_me_token: 'old_token' }).eq('id', TEST_USERS.alice);

    const { data: newToken, error } = await alice.rpc('rotate_add_me_token');
    expect(error).toBeNull();
    expect(typeof newToken).toBe('string');
    expect(newToken).not.toBe('old_token');

    const { data: prof } = await admin
      .from('profiles')
      .select('add_me_token')
      .eq('id', TEST_USERS.alice)
      .single();
    expect(prof?.add_me_token).toBe(newToken);
  });

  it('accept_add_me inserts friendship', async () => {
    const admin = adminClient();
    await admin.from('profiles').update({ add_me_token: 'alice_link' }).eq('id', TEST_USERS.alice);
    const bob = await clientFor(TEST_USERS.bob);
    const { data: friendId, error } = await bob.rpc('accept_add_me', { _token: 'alice_link' });
    expect(error).toBeNull();
    expect(friendId).toBe(TEST_USERS.alice);

    const lo = TEST_USERS.alice < TEST_USERS.bob ? TEST_USERS.alice : TEST_USERS.bob;
    const hi = TEST_USERS.alice < TEST_USERS.bob ? TEST_USERS.bob : TEST_USERS.alice;
    const { data: edge } = await admin
      .from('friendships')
      .select('user_a')
      .eq('user_a', lo)
      .eq('user_b', hi)
      .maybeSingle();
    expect(edge).not.toBeNull();
  });

  it('accept_add_me rejects self', async () => {
    const admin = adminClient();
    await admin.from('profiles').update({ add_me_token: 'alice_link' }).eq('id', TEST_USERS.alice);
    const alice = await clientFor(TEST_USERS.alice);
    const { error } = await alice.rpc('accept_add_me', { _token: 'alice_link' });
    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/self_link/);
  });

  it('accept_add_me rejects unknown token', async () => {
    const bob = await clientFor(TEST_USERS.bob);
    const { error } = await bob.rpc('accept_add_me', { _token: 'nope' });
    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/token_not_found/);
  });

  it('unfriend deletes the edge symmetrically (either side can call)', async () => {
    const admin = adminClient();
    const lo = TEST_USERS.alice < TEST_USERS.bob ? TEST_USERS.alice : TEST_USERS.bob;
    const hi = TEST_USERS.alice < TEST_USERS.bob ? TEST_USERS.bob : TEST_USERS.alice;
    await admin.from('friendships').insert({ user_a: lo, user_b: hi });

    const alice = await clientFor(TEST_USERS.alice);
    const { error } = await alice.rpc('unfriend', { _other: TEST_USERS.bob });
    expect(error).toBeNull();

    const { data: edge } = await admin
      .from('friendships')
      .select('user_a')
      .eq('user_a', lo)
      .eq('user_b', hi)
      .maybeSingle();
    expect(edge).toBeNull();
  });

  it('unfriend is idempotent (no row → no error)', async () => {
    const alice = await clientFor(TEST_USERS.alice);
    const { error } = await alice.rpc('unfriend', { _other: TEST_USERS.bob });
    expect(error).toBeNull();
  });

  it('get_friends returns the caller\'s friends, both sides of the edge', async () => {
    const admin = adminClient();
    const ab_lo = TEST_USERS.alice < TEST_USERS.bob ? TEST_USERS.alice : TEST_USERS.bob;
    const ab_hi = TEST_USERS.alice < TEST_USERS.bob ? TEST_USERS.bob : TEST_USERS.alice;
    const ac_lo = TEST_USERS.alice < TEST_USERS.carol ? TEST_USERS.alice : TEST_USERS.carol;
    const ac_hi = TEST_USERS.alice < TEST_USERS.carol ? TEST_USERS.carol : TEST_USERS.alice;
    await admin.from('friendships').insert([
      { user_a: ab_lo, user_b: ab_hi },
      { user_a: ac_lo, user_b: ac_hi },
    ]);

    const alice = await clientFor(TEST_USERS.alice);
    const { data, error } = await alice.rpc('get_friends');
    expect(error).toBeNull();
    expect(data).toHaveLength(2);
    const ids = (data as Array<{ id: string }>).map((r) => r.id).sort();
    expect(ids).toEqual([TEST_USERS.bob, TEST_USERS.carol].sort());
  });

  it('get_friend_list returns friend\'s visible items, respects category filter', async () => {
    const admin = adminClient();
    const lo = TEST_USERS.alice < TEST_USERS.bob ? TEST_USERS.alice : TEST_USERS.bob;
    const hi = TEST_USERS.alice < TEST_USERS.bob ? TEST_USERS.bob : TEST_USERS.alice;
    await admin.from('friendships').insert({ user_a: lo, user_b: hi });

    await admin.from('items').insert([
      { owner_id: TEST_USERS.bob, title: 'Pan',   visibility: 'shared', category: 'Кухня' },
      { owner_id: TEST_USERS.bob, title: 'Book',  visibility: 'shared', category: 'Книги' },
      { owner_id: TEST_USERS.bob, title: 'Diary', visibility: 'private', category: null },
    ]);

    const alice = await clientFor(TEST_USERS.alice);

    const { data: all } = await alice.rpc('get_friend_list', {
      _friend_id: TEST_USERS.bob,
      _category: null,
    });
    expect(all).toHaveLength(2);

    const { data: kitchen } = await alice.rpc('get_friend_list', {
      _friend_id: TEST_USERS.bob,
      _category: 'Кухня',
    });
    expect(kitchen).toHaveLength(1);
    expect((kitchen as Array<{ title: string }>)[0].title).toBe('Pan');
  });

  it('get_friend_list returns 0 rows for non-friend', async () => {
    const admin = adminClient();
    await admin.from('items').insert({
      owner_id: TEST_USERS.bob,
      title: 'Secret',
      visibility: 'shared',
    });
    const alice = await clientFor(TEST_USERS.alice);
    const { data } = await alice.rpc('get_friend_list', {
      _friend_id: TEST_USERS.bob,
      _category: null,
    });
    expect(data).toEqual([]);
  });
});
