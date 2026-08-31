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
let foremanProfileId: string;
let foremanUserId: string;
let origFirst: string;
let origLast: string;
let ownerProfileId: string;
let ownerUserId: string;
let ownerOrigFirst: string;

beforeAll(async () => {
  assertRebuildTest();
  foreman = await sessionFor(FOREMAN);

  const { data: f } = await admin
    .from('profiles')
    .select('id, user_id, first_name, last_name, role')
    .eq('email', FOREMAN)
    .single();
  foremanProfileId = f!.id;
  foremanUserId = f!.user_id;
  origFirst = f!.first_name;
  origLast = f!.last_name;
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
  // Restore, whatever happened, via the service role (bypasses the guard).
  await admin
    .from('profiles')
    .update({ first_name: origFirst, last_name: origLast })
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
