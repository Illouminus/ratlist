import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { adminClient } from './helpers/client.ts';
import { ensureTestUsers, truncateBetweenTests, TEST_USERS } from './helpers/seed.ts';

describe('friend_graph_add migration — schema', () => {
  beforeAll(async () => {
    await ensureTestUsers();
  });
  beforeEach(async () => {
    await truncateBetweenTests();
    await ensureTestUsers();
  });

  it('creates friendships table with canonical-order check constraint', async () => {
    const admin = adminClient();
    const u1 = TEST_USERS.alice;
    const u2 = TEST_USERS.bob;
    // Insert canonical pair: user_a < user_b
    const { error: ok } = await admin.from('friendships').insert({
      user_a: u1 < u2 ? u1 : u2,
      user_b: u1 < u2 ? u2 : u1,
    });
    expect(ok).toBeNull();
    // Reverse-order insert must fail the check constraint
    const { error: fail } = await admin.from('friendships').insert({
      user_a: u1 < u2 ? u2 : u1,
      user_b: u1 < u2 ? u1 : u2,
    });
    expect(fail).toBeTruthy();
    expect(fail?.message).toMatch(/check/i);
  });

  it('creates friend_invites table with unique (from_user, to_email)', async () => {
    const admin = adminClient();
    const u1 = TEST_USERS.alice;
    // First insert OK
    const { error: ok } = await admin.from('friend_invites').insert({
      token: 'tok_alice_to_x_1',
      from_user: u1,
      to_email: 'x@test.local',
    });
    expect(ok).toBeNull();
    // Duplicate (from_user, to_email) must fail
    const { error: dup } = await admin.from('friend_invites').insert({
      token: 'tok_alice_to_x_2',
      from_user: u1,
      to_email: 'x@test.local',
    });
    expect(dup).toBeTruthy();
    expect(dup?.message).toMatch(/duplicate|unique/i);
  });

  it('adds items.visibility enum-checked column, default shared', async () => {
    const admin = adminClient();
    const u1 = TEST_USERS.alice;
    const { data, error } = await admin
      .from('items')
      .insert({ owner_id: u1, title: 'Default visibility item' })
      .select('id, visibility')
      .single();
    expect(error).toBeNull();
    expect(data?.visibility).toBe('shared');
    // Bad value must fail
    const { error: bad } = await admin
      .from('items')
      .insert({ owner_id: u1, title: 'Bad', visibility: 'everyone' });
    expect(bad).toBeTruthy();
    expect(bad?.message).toMatch(/check/i);
  });

  it('adds items.category nullable text', async () => {
    const admin = adminClient();
    const u1 = TEST_USERS.alice;
    const { data, error } = await admin
      .from('items')
      .insert({ owner_id: u1, title: 'Cat item', category: 'Кухня' })
      .select('id, category')
      .single();
    expect(error).toBeNull();
    expect(data?.category).toBe('Кухня');
  });

  it('add_me_token is unique (now on profile_secrets)', async () => {
    const admin = adminClient();
    await admin.from('profile_secrets').update({ add_me_token: 'collision' }).eq('user_id', TEST_USERS.alice);
    const { error: dup } = await admin
      .from('profile_secrets')
      .update({ add_me_token: 'collision' })
      .eq('user_id', TEST_USERS.bob);
    expect(dup).toBeTruthy();
    expect(dup?.message).toMatch(/duplicate|unique/i);
  });
});
