/**
 * S177 — self-service name edit, the GUARD (live, against rebuild-test).
 *
 * The feature: a user may correct their OWN first/last name (profiles_update_self
 * policy). ⚠️ The safety is the enforce_profiles_self_column_scope trigger, NOT
 * the policy — a self-update arm without column scope would let a foreman flip
 * their own `role` to 'owner', which is the whole authority model. So this file
 * proves the guard REFUSES, not just that a name change works:
 *
 *   - a self-update of ONLY the name SUCCEEDS;
 *   - a self-update touching role / company_id / is_deleted RAISES and changes
 *     nothing — including the sneaky "name AND role in one update";
 *   - a user cannot touch ANOTHER user's row at all (RLS USING).
 *
 * Subject is the FOREMAN, the role that had no profiles UPDATE policy before this.
 *
 * RUN: cd apps/web && npx vitest run --config test/live.vitest.config.ts s177-self-name-edit
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, assertRebuildTest, sessionFor } from './live-session';

const FOREMAN = 'josh+qa-foreman@worthprop.com';
const OWNER = 'josh+test50@worthprop.com';
const NOWHERE = '00000000-0000-0000-0000-000000000000';

let foreman: SupabaseClient;
let owner: SupabaseClient;
let foremanProfileId: string;
let foremanUserId: string;
let origFirst: string;
let origLast: string;
let origRole: string;
let ownerProfileId: string;
let ownerUserId: string;
let ownerOrigFirst: string;

beforeAll(async () => {
  assertRebuildTest();
  foreman = await sessionFor(FOREMAN);
  owner = await sessionFor(OWNER);

  const { data: f } = await admin
    .from('profiles')
    .select('id, user_id, first_name, last_name, role')
    .eq('email', FOREMAN)
    .single();
  foremanProfileId = f!.id;
  foremanUserId = f!.user_id;
  origFirst = f!.first_name;
  origLast = f!.last_name;
  origRole = f!.role;
  expect(f!.role, 'precondition: subject is a foreman').toBe('foreman');

  const { data: o } = await admin
    .from('profiles')
    .select('id, user_id, first_name')
    .eq('email', OWNER)
    .single();
  ownerProfileId = o!.id;
  ownerUserId = o!.user_id;
  ownerOrigFirst = o!.first_name;
});

afterAll(async () => {
  // Restore, whatever happened, via the service role (bypasses the guard). Role
  // is restored too: the owner-edits-another-member test below moves it.
  await admin
    .from('profiles')
    .update({ first_name: origFirst, last_name: origLast, role: origRole })
    .eq('id', foremanProfileId);
});

async function foremanRole(): Promise<string> {
  const { data } = await admin.from('profiles').select('role').eq('id', foremanProfileId).single();
  return (data as { role: string }).role;
}

describe('the name change itself works', () => {
  it('a foreman can change their OWN first and last name', async () => {
    const { data, error } = await foreman
      .from('profiles')
      .update({ first_name: 'Renamed', last_name: 'BySelf' })
      .eq('id', foremanProfileId)
      .select('first_name, last_name');

    expect(error, error?.message).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0]).toMatchObject({ first_name: 'Renamed', last_name: 'BySelf' });
  });
});

describe('⚠️ the guard REFUSES anything but the name', () => {
  it('a self-update to role RAISES and the role does not move', async () => {
    const { error } = await foreman
      .from('profiles')
      .update({ role: 'owner' })
      .eq('id', foremanProfileId)
      .select();
    expect(error, 'changing your own role must be refused').not.toBeNull();
    expect(await foremanRole(), 'role must be unchanged after refusal').toBe('foreman');
  });

  it('a self-update to company_id RAISES', async () => {
    const { error } = await foreman
      .from('profiles')
      .update({ company_id: NOWHERE })
      .eq('id', foremanProfileId)
      .select();
    expect(error).not.toBeNull();
  });

  it('a self-update to is_deleted RAISES', async () => {
    const { error } = await foreman
      .from('profiles')
      .update({ is_deleted: true })
      .eq('id', foremanProfileId)
      .select();
    expect(error).not.toBeNull();
    const { data } = await admin
      .from('profiles')
      .select('is_deleted')
      .eq('id', foremanProfileId)
      .single();
    expect((data as { is_deleted: boolean | null }).is_deleted ?? false).toBe(false);
  });

  it('a self-update to user_id RAISES (profiles has no member_id — user_id/id are the identity cols)', async () => {
    // The acceptance names "user_id or member_id". profiles has NO member_id (the
    // member linkage lives on company_members); user_id and id are its identity
    // columns. Repointing your own row at another auth user is refused — by the
    // trigger (NEW.user_id <> OLD.user_id), and in depth by profiles_update_self's
    // WITH CHECK (user_id = auth.uid()).
    const { error } = await foreman
      .from('profiles')
      .update({ user_id: NOWHERE })
      .eq('id', foremanProfileId)
      .select();
    expect(error, 'changing your own user_id must be refused').not.toBeNull();
    const { data } = await admin
      .from('profiles')
      .select('user_id')
      .eq('id', foremanProfileId)
      .single();
    expect((data as { user_id: string }).user_id, 'user_id must be unchanged').toBe(foremanUserId);
  });

  it('⚠️ name AND role in one update is refused — you cannot smuggle a role change', async () => {
    const { error } = await foreman
      .from('profiles')
      .update({ first_name: 'Sneaky', role: 'owner' })
      .eq('id', foremanProfileId)
      .select();
    expect(error, 'a role change riding alongside a name change must be refused').not.toBeNull();
    // the whole statement rolls back: neither the name nor the role moved.
    const { data } = await admin
      .from('profiles')
      .select('first_name, role')
      .eq('id', foremanProfileId)
      .single();
    expect((data as { first_name: string }).first_name).not.toBe('Sneaky');
    expect((data as { role: string }).role).toBe('foreman');
  });
});

describe('you cannot touch another user’s row', () => {
  it('a foreman updating the OWNER’s name affects zero rows (RLS USING)', async () => {
    const { data, error } = await foreman
      .from('profiles')
      .update({ first_name: 'Hijacked' })
      .eq('id', ownerProfileId)
      .select();
    // RLS filters the row out (user_id <> auth.uid()): no error, nothing updated.
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
    const { data: o } = await admin
      .from('profiles')
      .select('first_name')
      .eq('id', ownerProfileId)
      .single();
    expect((o as { first_name: string }).first_name).toBe(ownerOrigFirst);
  });
});

describe('⚠️ the guard does NOT catch Owner editing ANOTHER member (acceptance #3)', () => {
  it('an owner changing a foreman’s ROLE via Team still works — trigger early-returns on auth.uid() <> OLD.user_id', async () => {
    // The case the guard MUST NOT touch. It moves a NON-name column (role), so a
    // trigger wrongly applied to owner-edits-other would RAISE here. It succeeds
    // because auth.uid() (owner) IS DISTINCT FROM OLD.user_id (foreman): the
    // trigger returns NEW before the column-scope check. This is the Team → Edit
    // path, proven not to regress.
    const { data, error } = await owner
      .from('profiles')
      .update({ role: 'crew_member' })
      .eq('id', foremanProfileId)
      .select('role');
    expect(error, error?.message).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0]).toMatchObject({ role: 'crew_member' });

    // Restore immediately so this file is order-independent (afterAll repeats it).
    await admin.from('profiles').update({ role: origRole }).eq('id', foremanProfileId);
  });
});
