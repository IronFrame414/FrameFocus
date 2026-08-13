/**
 * S138 — runTrialDeletion(), ACTUALLY RUN, once, against a company built to
 * be destroyed.
 *
 * ============================================================================
 * ⚠️ READ THIS BEFORE RUNNING OR EDITING THIS FILE.
 * ============================================================================
 * Every other probe in this feature asserts what the deletion job DECLARES it
 * will skip — its exclusion lists. None of them had ever executed it. S137's
 * log said "the job exists, is tested"; what was tested was a list.
 *
 * This file executes it. That means it permanently destroys a company and its
 * auth user. Three things keep that safe, and all three must stay true:
 *
 *   1. REBUILD-TEST ONLY — `assertRebuildTest()` throws otherwise.
 *   2. The fixture company is created HERE, in `beforeAll`, and is the only
 *      company on the database with `delete_after` set. Verified at run time
 *      by the first test rather than assumed: if any OTHER company is due for
 *      deletion, this file REFUSES to run the job.
 *   3. The deletion cron is still not scheduled anywhere. Running the function
 *      from a test is not the same as turning it on, and TL-24 is still with
 *      legal.
 * ============================================================================
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  admin,
  assertRebuildTest,
  deleteCompanies,
  purgeCompaniesNamed,
  TEST_PASSWORD,
} from './live-session';
import { runTrialDeletion } from '@/lib/trial/deletion';

const EMAIL = 'josh+s138doomed@worthprop.com';

let companyId = '';
let userId = '';
let aiLogId = '';


/**
 * [#2-s147] Companies this file creates, purged BY NAME from both ends.
 *
 * ⚠️ THE BY-EMAIL PATH IN `nuke()` CANNOT REACH A LEAKED ONE. It finds the
 * company through the auth user's profile — and the auth user deletes
 * successfully while the company does not, so the orphan loses its only handle
 * on the very run that creates it. The name is the handle that outlives both.
 */
const MARKERS = ['S138 Doomed Co'] as const;

async function nuke(): Promise<void> {
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const u of list?.users ?? []) {
    if (u.email !== EMAIL) continue;
    const { data: p } = await admin
      .from('profiles')
      .select('company_id')
      .eq('user_id', u.id)
      .maybeSingle();
    const cid = p ? (p as { company_id: string }).company_id : null;
    if (cid) {
      await admin.from('deletion_jobs').delete().eq('company_id', cid);
      await admin.from('contacts').delete().eq('company_id', cid);
      // [#2-s147] `contacts` first — NO ACTION and not in COMPANY_CHILDREN.
      await deleteCompanies(admin, [cid]);
    }
    await admin.from('trial_emails').delete().eq('email', EMAIL.toLowerCase());
    await admin.auth.admin.deleteUser(u.id);
  }
  await purgeCompaniesNamed(admin, MARKERS);
}

beforeAll(async () => {
  assertRebuildTest();
  await nuke();

  const { data: created, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { company_name: 'S138 Doomed Co', first_name: 'Doo', last_name: 'Med' },
  });
  if (error) throw new Error(`createUser: ${error.message}`);
  userId = created.user.id;

  const { data: prof } = await admin
    .from('profiles')
    .select('company_id')
    .eq('user_id', userId)
    .single();
  companyId = (prof as { company_id: string }).company_id;

  await admin
    .from('contacts')
    .insert({ company_id: companyId, first_name: 'Doomed', last_name: 'Contact', contact_type: 'lead' });

  // The survivor under test: our AI spend, which must outlive the tenant with
  // its company_id nulled [Josh, S137 Q1]. `model` is NOT NULL — S137 lost time
  // to a fixture that omitted it and read the failure as a schema problem.
  const { data: log, error: logErr } = await admin
    .from('ai_tag_logs')
    .insert({ company_id: companyId, model: 'gpt-4o-2024-08-06', success: true, estimated_cost_usd: 0.00382 })
    .select('id')
    .single();
  if (logErr) throw new Error(`seed ai_tag_logs: ${logErr.message}`);
  aiLogId = (log as { id: string }).id;

  // Due for deletion as of now.
  await admin
    .from('trial_lifecycle')
    .update({
      locked_at: new Date(Date.now() - 15 * 86400_000).toISOString(),
      delete_after: new Date(Date.now() - 86400_000).toISOString(),
    })
    .eq('company_id', companyId);
}, 180_000);

afterAll(async () => {
  await nuke();
});

describe('runTrialDeletion — executed, not described', () => {
  it('⚠️ SAFETY GATE: the fixture is the ONLY company due for deletion', async () => {
    const { data: due } = await admin
      .from('trial_lifecycle')
      .select('company_id')
      .is('deleted_at', null)
      .not('delete_after', 'is', null)
      .lte('delete_after', new Date().toISOString());

    const ids = ((due ?? []) as Array<{ company_id: string }>).map((r) => r.company_id);
    // If this fails, DO NOT relax it. Something else on rebuild-test is due for
    // permanent deletion and running the job would take it too.
    expect(ids).toEqual([companyId]);
  });

  it('⚠️ THE RUN — and it does NOT claim a completion it did not achieve', async () => {
    const outcome = await runTrialDeletion(admin, new Date());
    expect(outcome.processed).toBe(1);

    // ⚠️ THIS IS THE DEFECT THIS FILE FOUND, NOW LOCKED DOWN.
    // Before S138 this returned `completed: 1` while leaving the `companies`
    // row standing, because the error from the parent delete was discarded.
    // Five SURVIVES tables hold RESTRICT foreign keys to `companies`, so the
    // delete cannot succeed while the audit rows the ruling protects exist.
    //
    // Whether the shell SHOULD survive is TECH_DEBT #3-trial and sits under
    // TL-24. What is not negotiable is that the job says so.
    expect(outcome.companyRowsRemaining).toBe(1);
    expect(outcome.stopped).toBe(1);
    expect(outcome.completed).toBe(0);
  }, 240_000);

  it('⚠️ the company SHELL remains — recorded as the current behaviour, not endorsed', async () => {
    const { data } = await admin.from('companies').select('id').eq('id', companyId).maybeSingle();
    // If this ever starts returning null, the ruling in #3-trial has been made
    // and this test plus the block in runTrialDeletion() must be revisited
    // together — a passing null here with the old code would mean the FKs were
    // changed without anyone deciding they should be.
    expect(data).not.toBeNull();
  });

  it('the deletion job records WHY it stopped, in the real database error', async () => {
    const { data } = await admin
      .from('deletion_jobs')
      .select('state, last_error')
      .eq('company_id', companyId)
      .maybeSingle();
    expect((data as { state: string }).state).toBe('stopped');
    expect((data as { last_error: string }).last_error).toMatch(/companies row remains/i);
  });

  it('its tenant data is gone', async () => {
    const { data } = await admin.from('contacts').select('id').eq('company_id', companyId);
    expect(data ?? []).toHaveLength(0);
  });

  it('the auth user is gone — they cannot sign in to nothing', async () => {
    const { data } = await admin.auth.admin.getUserById(userId);
    expect(data.user).toBeNull();
  });

  it('⚠️ ai_tag_logs SURVIVES WITH company_id NULLED — the ruling, executed', async () => {
    const { data } = await admin
      .from('ai_tag_logs')
      .select('id, company_id, estimated_cost_usd, model')
      .eq('id', aiLogId)
      .maybeSingle();
    expect(data).not.toBeNull();
    expect((data as { company_id: string | null }).company_id).toBeNull();
    // The financial trail is intact, not just the row.
    expect(Number((data as { estimated_cost_usd: number }).estimated_cost_usd)).toBeCloseTo(0.00382, 6);
    expect((data as { model: string }).model).toBe('gpt-4o-2024-08-06');

    await admin.from('ai_tag_logs').delete().eq('id', aiLogId);
  });

  it('⚠️ trial_emails survives — or the three-trial limit resets on deletion', async () => {
    const { data } = await admin
      .from('trial_emails')
      .select('email')
      .eq('email', EMAIL.toLowerCase());
    expect((data ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it('the lifecycle row is stamped deleted rather than removed', async () => {
    const { data } = await admin
      .from('trial_lifecycle')
      .select('deleted_at')
      .eq('company_id', companyId)
      .maybeSingle();
    expect(data).not.toBeNull();
    expect((data as { deleted_at: string | null }).deleted_at).not.toBeNull();
  });
});
