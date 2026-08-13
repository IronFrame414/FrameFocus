/**
 * S138 — the export, RUN FOR REAL against rebuild-test.
 *
 * ⚠️ THIS RUNS THE JOB, it does not assert what the job declares it will do.
 * The S137 deletion probes asserted exclusion LISTS and were mistaken for
 * evidence that the job worked; this file writes real rows, runs the real
 * sweeper, downloads the real zip out of the real bucket and reads its
 * entries.
 *
 * Disposable company, created and destroyed here.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import {
  admin,
  assertRebuildTest,
  deleteCompanies,
  purgeCompaniesNamed,
  TEST_PASSWORD,
} from './live-session';
import { runExportSweep } from '@/lib/trial/export-sweep';
import { initialCursor } from '@/lib/trial/export';

const EMAIL = 'josh+s138export@worthprop.com';

let companyId = '';
let profileId = '';
let userId = '';


/**
 * [#2-s147] Companies this file creates, purged BY NAME from both ends.
 *
 * ⚠️ THE BY-EMAIL PATH IN `nuke()` CANNOT REACH A LEAKED ONE. It finds the
 * company through the auth user's profile — and the auth user deletes
 * successfully while the company does not, so the orphan loses its only handle
 * on the very run that creates it. The name is the handle that outlives both.
 */
const MARKERS = ['S138 Export Co'] as const;

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
      const { data: objs } = await admin.storage.from('exports').list(cid, { limit: 1000 });
      for (const dir of objs ?? []) {
        const { data: inner } = await admin.storage
          .from('exports')
          .list(`${cid}/${dir.name}`, { limit: 1000 });
        const paths = (inner ?? []).map((o) => `${cid}/${dir.name}/${o.name}`);
        if (paths.length) await admin.storage.from('exports').remove(paths);
      }
      await admin.from('export_jobs').delete().eq('company_id', cid);
      await admin.from('contacts').delete().eq('company_id', cid);
      // [#2-s147] `contacts` stays above — it is NOT in COMPANY_CHILDREN and
      // is NO ACTION, so it must go first or deleteCompanies() will raise it.
      await deleteCompanies(admin, [cid]);
    }
    await admin.from('trial_emails').delete().eq('email', EMAIL.toLowerCase());
    await admin.auth.admin.deleteUser(u.id);
  }
  await purgeCompaniesNamed(admin, MARKERS);
}

/** Enqueue a job the way the route does, and drive it to completion. */
async function runToCompletion(
  categories: string[],
  format: 'zip' | 'zip_csv'
): Promise<{ jobId: string; state: string }> {
  const { data: job, error } = await admin
    .from('export_jobs')
    .insert({
      company_id: companyId,
      requested_by: profileId,
      categories,
      format,
      state: 'pending',
      cursor: initialCursor() as never,
    })
    .select('id')
    .single();
  if (error) throw new Error(`enqueue: ${error.message}`);
  const jobId = (job as { id: string }).id;

  // Bounded: the sweeper advances one job per invocation, and these fixtures
  // are tiny. A runaway loop here would be a test that hangs CI, so it stops.
  for (let i = 0; i < 20; i += 1) {
    await runExportSweep(admin, new Date());
    const { data: row } = await admin
      .from('export_jobs')
      .select('state')
      .eq('id', jobId)
      .single();
    const state = (row as { state: string }).state;
    if (state === 'complete' || state === 'failed') return { jobId, state };
  }
  return { jobId, state: 'timeout' };
}

async function readPart(jobId: string, part = 'part-001.zip'): Promise<Record<string, string>> {
  const { data, error } = await admin.storage
    .from('exports')
    .download(`${companyId}/${jobId}/${part}`);
  if (error || !data) throw new Error(`download ${part}: ${error?.message}`);
  const unzipped = unzipSync(new Uint8Array(await data.arrayBuffer()));
  const out: Record<string, string> = {};
  for (const [name, bytes] of Object.entries(unzipped)) out[name] = strFromU8(bytes);
  return out;
}

beforeAll(async () => {
  assertRebuildTest();
  await nuke();

  const { data: created, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { company_name: 'S138 Export Co', first_name: 'Ex', last_name: 'Port' },
  });
  if (error) throw new Error(`createUser: ${error.message}`);
  userId = created.user.id;

  const { data: prof } = await admin
    .from('profiles')
    .select('id, company_id')
    .eq('user_id', userId)
    .single();
  profileId = (prof as { id: string }).id;
  companyId = (prof as { company_id: string }).company_id;

  // Real content to export, including the values that break a naive CSV.
  const { error: cErr } = await admin.from('contacts').insert([
    {
      company_id: companyId,
      first_name: 'Comma',
      last_name: 'Test',
      contact_type: 'lead',
      notes: 'framing, drywall\nsecond line with "quotes"',
    },
    { company_id: companyId, first_name: 'Plain', last_name: 'Contact', contact_type: 'lead' },
  ]);
  if (cErr) throw new Error(`seed contacts: ${cErr.message}`);
}, 180_000);

afterAll(async () => {
  await nuke();
  for (const m of MARKERS) {
    const { data } = await admin.from('companies').select('id').ilike('name', `${m}%`);
    expect(data ?? [], `${m} companies survived teardown`).toHaveLength(0);
  }
});

describe('the export actually produces a zip with the data in it', () => {
  it('⚠️ completes, and the archive contains the rows that were written', async () => {
    const { jobId, state } = await runToCompletion(['contacts'], 'zip');
    expect(state).toBe('complete');

    const entries = await readPart(jobId);
    expect(Object.keys(entries)).toContain('data/contacts.json');
    expect(Object.keys(entries)).toContain('MANIFEST.txt');

    const rows = JSON.parse(entries['data/contacts.json']) as Array<{ first_name: string }>;
    expect(rows.map((r) => r.first_name).sort()).toEqual(['Comma', 'Plain']);
  }, 180_000);

  it('⚠️ the CSV bundle round-trips a value with a comma, a newline and quotes', async () => {
    const { jobId, state } = await runToCompletion(['contacts'], 'zip_csv');
    expect(state).toBe('complete');

    const entries = await readPart(jobId);
    const csv = entries['data/contacts.csv'];
    expect(csv).toBeTruthy();
    // The dangerous value survives as ONE quoted field, not three broken ones.
    expect(csv).toContain('"framing, drywall\nsecond line with ""quotes"""');
  }, 180_000);
});

describe('the broken-reference rule — keep the filename, omit the file', () => {
  it('⚠️ an export without "files" says so in MISSING-FILES.txt', async () => {
    const { jobId, state } = await runToCompletion(['contacts'], 'zip');
    expect(state).toBe('complete');
    const entries = await readPart(jobId);
    expect(Object.keys(entries)).toContain('MISSING-FILES.txt');
    expect(entries['MANIFEST.txt']).toContain('Files included: NO');
  }, 180_000);

  it('an export WITH "files" carries no missing-files notice', async () => {
    const { jobId, state } = await runToCompletion(['files'], 'zip');
    expect(state).toBe('complete');
    const entries = await readPart(jobId);
    expect(Object.keys(entries)).not.toContain('MISSING-FILES.txt');
    expect(entries['MANIFEST.txt']).toContain('Files included: yes');
  }, 180_000);
});

describe('no export after expiry', () => {
  it('⚠️ a job for a LOCKED company fails instead of handing over the data', async () => {
    await admin
      .from('trial_lifecycle')
      .update({ locked_at: new Date().toISOString() })
      .eq('company_id', companyId);

    const { data: job } = await admin
      .from('export_jobs')
      .insert({
        company_id: companyId,
        requested_by: profileId,
        categories: ['contacts'],
        format: 'zip',
        state: 'pending',
        cursor: initialCursor() as never,
      })
      .select('id')
      .single();
    const jobId = (job as { id: string }).id;

    await runExportSweep(admin, new Date());

    const { data: after } = await admin
      .from('export_jobs')
      .select('state, last_error')
      .eq('id', jobId)
      .single();
    expect((after as { state: string }).state).toBe('failed');
    expect((after as { last_error: string }).last_error).toMatch(/expired/i);

    await admin
      .from('trial_lifecycle')
      .update({ locked_at: null })
      .eq('company_id', companyId);
  }, 180_000);
});

describe('the 24-hour sweep', () => {
  it('⚠️ removes the objects but KEEPS the audit row', async () => {
    const { jobId, state } = await runToCompletion(['contacts'], 'zip');
    expect(state).toBe('complete');

    // Age the link past its life.
    await admin
      .from('export_jobs')
      .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', jobId);

    const outcome = await runExportSweep(admin, new Date());
    expect(outcome.expired).toBeGreaterThanOrEqual(1);
    expect(outcome.objectsRemoved).toBeGreaterThanOrEqual(1);

    const { data: objs } = await admin.storage
      .from('exports')
      .list(`${companyId}/${jobId}`, { limit: 100 });
    expect(objs ?? []).toHaveLength(0);

    // ⚠️ The row survives — export_jobs is the audit of who took what.
    const { data: row } = await admin
      .from('export_jobs')
      .select('state, requested_by')
      .eq('id', jobId)
      .single();
    expect((row as { state: string }).state).toBe('expired');
    expect((row as { requested_by: string }).requested_by).toBe(profileId);
  }, 180_000);
});
