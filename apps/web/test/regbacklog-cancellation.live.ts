/**
 * Register backlog §4 — paid-cancellation retention, the three acceptance
 * proofs [spec §5]:
 *   1. a cancelled account is LOCKED (staff banned, cannot sign in) — and the
 *      Q12 carve-out holds: the CLIENT is NOT banned and still signs in;
 *   2. the clock is STORED, not computed — delete_after on the row equals
 *      locked_at + 90 days exactly, reason='cancellation';
 *   3. the way back clears BOTH the ban and the clock (the shared
 *      unlock_trial_company path), and the lock is idempotent under webhook
 *      retries.
 *
 * The s138 shape throughout: a REAL disposable company via handle_new_user(),
 * REAL auth bans, nuked by name and email from both ends. Never pointed at a
 * seeded QA identity — this file bans people.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import {
  admin,
  assertRebuildTest,
  deleteCompanies,
  purgeCompaniesNamed,
  ANON,
  TEST_PASSWORD,
  URL_,
} from './live-session';
import {
  runCancellationLock,
  unlockCompany,
  RETENTION_DAYS_CANCELLATION,
} from '@/lib/trial/lifecycle';

const OWNER_EMAIL = 'josh+regbl-cancel-owner@worthprop.com';
const CLIENT_EMAIL = 'josh+regbl-cancel-client@worthprop.com';
const MARKERS = ['RegBL Cancel Co', 'RegBL Client Spur'] as const;

let companyId: string;
let ownerUserId: string;
let clientUserId: string;

async function nuke(): Promise<void> {
  for (const email of [OWNER_EMAIL, CLIENT_EMAIL]) {
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const u of list?.users ?? []) {
      if (u.email !== email) continue;
      const { data: p } = await admin
        .from('profiles')
        .select('company_id')
        .eq('user_id', u.id)
        .maybeSingle();
      const cid = p ? (p as { company_id: string }).company_id : null;
      await admin.from('profiles').delete().eq('user_id', u.id);
      if (cid) await deleteCompanies(admin, [cid]);
      await admin.from('trial_emails').delete().eq('email', email.toLowerCase());
      await admin.auth.admin.deleteUser(u.id);
    }
  }
  await purgeCompaniesNamed(admin, MARKERS);
}

beforeAll(async () => {
  assertRebuildTest();
  await nuke();

  const { data: owner, error } = await admin.auth.admin.createUser({
    email: OWNER_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { company_name: 'RegBL Cancel Co', first_name: 'Reg', last_name: 'Cancel' },
  });
  if (error) throw new Error(`createUser owner: ${error.message}`);
  ownerUserId = owner.user.id;

  const { data: prof } = await admin
    .from('profiles')
    .select('company_id')
    .eq('user_id', ownerUserId)
    .single();
  companyId = (prof as { company_id: string }).company_id;

  // A CLIENT of the same company — adopted in, live, role='client'. The Q12
  // proof needs a real client auth user who must SURVIVE the lock.
  const { data: client, error: cErr } = await admin.auth.admin.createUser({
    email: CLIENT_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { company_name: 'RegBL Client Spur', first_name: 'Cli', last_name: 'Ent' },
  });
  if (cErr) throw new Error(`createUser client: ${cErr.message}`);
  clientUserId = client.user.id;
  const { data: cliProf } = await admin
    .from('profiles')
    .select('company_id')
    .eq('user_id', clientUserId)
    .single();
  const spurious = (cliProf as { company_id: string }).company_id;
  await admin
    .from('profiles')
    .update({ company_id: companyId, role: 'client' })
    .eq('user_id', clientUserId);
  await admin.from('company_members').delete().eq('company_id', spurious);
  await admin.from('trial_lifecycle').delete().eq('company_id', spurious);
  await admin.from('tag_options').delete().eq('company_id', spurious);
  await admin.from('subscriptions').delete().eq('company_id', spurious);
  await admin.from('companies').delete().eq('id', spurious);
  await admin.from('trial_emails').delete().eq('email', CLIENT_EMAIL.toLowerCase());
}, 180_000);

afterAll(async () => {
  await nuke();
  for (const m of MARKERS) {
    const { data } = await admin.from('companies').select('id').ilike('name', `${m}%`);
    expect(data ?? [], `${m} companies survived teardown`).toHaveLength(0);
  }
});

async function canSignIn(email: string): Promise<boolean> {
  const c = createClient(URL_, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  return !error;
}

const LOCK_MOMENT = new Date('2026-08-29T12:00:00.000Z');

describe('§4.1 — the lock: staff banned, the CLIENT is not (Q12)', () => {
  it('locks on cancellation; the owner is out, the client still signs in', async () => {
    expect(await canSignIn(OWNER_EMAIL)).toBe(true); // pre-state: both alive
    expect(await canSignIn(CLIENT_EMAIL)).toBe(true);

    const { banned, alreadyLocked } = await runCancellationLock(admin, companyId, LOCK_MOMENT);
    expect(alreadyLocked).toBe(false);
    expect(banned).toBeGreaterThanOrEqual(1); // the owner at minimum

    expect(await canSignIn(OWNER_EMAIL)).toBe(false); // locked
    expect(await canSignIn(CLIENT_EMAIL)).toBe(true); // the carve-out's ban half
  });

  it('the client session reads the lock reason the middleware branches on', async () => {
    const c = createClient(URL_, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error } = await c.auth.signInWithPassword({
      email: CLIENT_EMAIL,
      password: TEST_PASSWORD,
    });
    expect(error).toBeNull();
    const { data, error: rpcErr } = await c.rpc('my_company_lock_reason');
    expect(rpcErr).toBeNull();
    expect(data).toBe('cancellation');
  });
});

describe('§4.2 — the clock is a stored fact: locked_at + 90 days, on the row', () => {
  it('delete_after equals the lock moment plus RETENTION_DAYS_CANCELLATION exactly', async () => {
    const { data } = await admin
      .from('trial_lifecycle')
      .select('locked_at, delete_after, reason')
      .eq('company_id', companyId)
      .single();
    expect(data!.reason).toBe('cancellation');
    expect(new Date(data!.locked_at!).toISOString()).toBe(LOCK_MOMENT.toISOString());
    const expected = new Date(
      LOCK_MOMENT.getTime() + RETENTION_DAYS_CANCELLATION * 24 * 60 * 60 * 1000
    );
    expect(new Date(data!.delete_after!).toISOString()).toBe(expected.toISOString());
  });

  it('a webhook retry does not re-ban (idempotent)', async () => {
    const second = await runCancellationLock(admin, companyId, new Date('2026-08-30T00:00:00Z'));
    expect(second.alreadyLocked).toBe(true);
    expect(second.banned).toBe(0);
    // ...and the ORIGINAL clock stands — a retry must not extend retention.
    const { data } = await admin
      .from('trial_lifecycle')
      .select('locked_at')
      .eq('company_id', companyId)
      .single();
    expect(new Date(data!.locked_at!).toISOString()).toBe(LOCK_MOMENT.toISOString());
  });
});

describe('§4.3 — the way back clears BOTH the ban and the clock', () => {
  it('unlockCompany (the shared path) un-bans and nulls both stamps', async () => {
    const { unbanned } = await unlockCompany(admin, companyId);
    expect(unbanned).toBeGreaterThanOrEqual(1);

    expect(await canSignIn(OWNER_EMAIL)).toBe(true); // the ban half

    const { data } = await admin
      .from('trial_lifecycle')
      .select('locked_at, delete_after')
      .eq('company_id', companyId)
      .single();
    expect(data!.locked_at).toBeNull(); // the lock half
    expect(data!.delete_after).toBeNull(); // the clock half — a paying customer is never deleted
  });
});
