// supabase/tests/integration/helpers/seed.ts
import { adminClient } from './client.ts';

export const TEST_USERS = {
  alice: '11111111-1111-1111-1111-111111111111',
  bob:   '22222222-2222-2222-2222-222222222222',
  carol: '33333333-3333-3333-3333-333333333333',
  dave:  '44444444-4444-4444-4444-444444444444',
} as const;

export type TestUserName = keyof typeof TEST_USERS;

export interface SeedContext {
  alice: string;
  bob: string;
  carol: string;
  dave: string;
  groupId: string;
  itemAliceOwns: string;
}

export async function ensureTestUsers(): Promise<typeof TEST_USERS> {
  const admin = adminClient();
  for (const [name, id] of Object.entries(TEST_USERS)) {
    const { error } = await admin.auth.admin.createUser({
      id,
      email: `${name}@test.local`,
      email_confirm: true,
      password: 'test-test-test',
      user_metadata: { display_name: name },
    });
    if (error && !/already|exists/i.test(error.message)) {
      throw new Error(`createUser(${name}) failed: ${error.message}`);
    }
    const { error: profErr } = await admin.from('profiles').upsert({
      id,
      display_name: name,
      handle: `${name}_t`,
      onboarded_at: new Date().toISOString(),
    });
    if (profErr) throw new Error(`upsert profile(${name}) failed: ${profErr.message}`);
  }
  return TEST_USERS;
}

export async function truncateBetweenTests(): Promise<void> {
  const admin = adminClient();
  const { error } = await admin.rpc('truncate_test_state');
  if (error) throw new Error(`truncate_test_state failed: ${error.message}`);
}

export async function seedFresh(): Promise<SeedContext> {
  await truncateBetweenTests();
  const users = await ensureTestUsers();
  const admin = adminClient();

  const { data: grp, error: grpErr } = await admin
    .from('groups')
    .insert({ name: 'Test Circle', created_by: users.alice })
    .select('id')
    .single();
  if (grpErr || !grp) throw new Error(`insert group failed: ${grpErr?.message}`);

  // Note: the groups_bootstrap_admin trigger auto-inserts alice (created_by)
  // as admin when the group is created, so we only need to add the other members.
  const { error: memErr } = await admin.from('group_members').insert([
    { group_id: grp.id, user_id: users.bob,   role: 'member' },
    { group_id: grp.id, user_id: users.carol, role: 'member' },
    { group_id: grp.id, user_id: users.dave,  role: 'member' },
  ]);
  if (memErr) throw new Error(`insert members failed: ${memErr.message}`);

  const { data: item, error: itemErr } = await admin
    .from('items')
    .insert({ owner_id: users.alice, title: 'A test thing alice wants' })
    .select('id')
    .single();
  if (itemErr || !item) throw new Error(`insert item failed: ${itemErr?.message}`);
  const { error: igErr } = await admin
    .from('item_groups')
    .insert({ item_id: item.id, group_id: grp.id });
  if (igErr) throw new Error(`insert item_group failed: ${igErr.message}`);

  return {
    alice: users.alice,
    bob: users.bob,
    carol: users.carol,
    dave: users.dave,
    groupId: grp.id,
    itemAliceOwns: item.id,
  };
}

export interface SantaSeed {
  eventId: string;
  organiserId: string;
  participantIds: string[];
}

/**
 * Build on top of seedFresh(): create a santa_events row owned by the
 * organiser in the seeded group, and (optionally) sign up participants.
 */
export async function seedSantaEvent(
  ctx: SeedContext,
  organiser: TestUserName,
  participants: TestUserName[],
  opts?: { status?: 'collecting' | 'drawn' | 'revealed' },
): Promise<SantaSeed> {
  const admin = adminClient();
  const organiserId = ctx[organiser];
  const { data: ev, error: evErr } = await admin
    .from('santa_events')
    .insert({
      group_id: ctx.groupId,
      created_by: organiserId,
      name: 'Test Santa',
      status: opts?.status ?? 'collecting',
    })
    .select('id')
    .single();
  if (evErr || !ev) throw new Error(`insert santa_event failed: ${evErr?.message}`);

  for (const p of participants) {
    const { error } = await admin.from('santa_participants').insert({
      event_id: ev.id,
      user_id: ctx[p],
    });
    if (error) throw new Error(`insert santa_participant(${p}) failed: ${error.message}`);
  }

  return {
    eventId: ev.id,
    organiserId,
    participantIds: participants.map((p) => ctx[p]),
  };
}

export async function insertAssignment(
  eventId: string,
  giverId: string,
  receiverId: string,
): Promise<void> {
  const admin = adminClient();
  const { error } = await admin.from('santa_assignments').insert({
    event_id: eventId,
    giver_id: giverId,
    receiver_id: receiverId,
  });
  if (error) throw new Error(`insert assignment failed: ${error.message}`);
}
