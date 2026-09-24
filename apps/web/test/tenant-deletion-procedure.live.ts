/**
 * TENANT DELETION PROCEDURE — the production runbook, rehearsed end to end on
 * rebuild-test against a throwaway tenant [Josh, 2026-09-24].
 *
 * ============================================================================
 * ⚠️ THIS FILE PERMANENTLY DELETES A COMPANY, ITS STORAGE AND ITS AUTH USERS.
 * ============================================================================
 * Same three fences as s138-trial-deletion-run.live.ts:
 *   1. REBUILD-TEST ONLY — assertRebuildTest(), plus the live-guard setup.
 *   2. The doomed tenant is built HERE, and step 2's SAFETY GATE requires it to
 *      be the ONLY company due before the job runs.
 *   3. Nothing else on the database is touched: every read of "before" and
 *      "after" is scoped to the doomed company id.
 *
 * WHY THIS EXISTS WHEN s138 ALREADY RUNS THE JOB. s138 deletes a tenant built by
 * the signup trigger, which gives it a `trial_lifecycle` row. The three tenants
 * Josh wants gone from production (bishop-contracting, test-const,
 * bis-contracting) PREDATE 20260918 and have NO lifecycle row — the job cannot
 * see them until one is written by hand. This file rehearses exactly that:
 *
 *   step 1  INSERT the lifecycle row, already locked and past delete_after
 *   step 2  the dry-run selection returns EXACTLY this company
 *   step 3  runTrialDeletion — the function the cron route calls
 *   step 4  verify rows, storage, auth users, job state
 *
 * with an OLD-TENANT shape: no lifecycle row, TWO auth users (the job deletes
 * every profile's auth user, owner included), and storage objects NESTED below
 * the company prefix in all three buckets the walk covers.
 *
 * ⚠️ STORAGE IS COUNTED FROM `storage.objects`, NOT FROM A list(). The job
 * itself walks with list(), so a count taken with list() would share any blind
 * spot it has (a folder over 1,000 entries, a prefix it never descends into).
 * The catalogue table is the independent instrument. Read-only, through the
 * Management API, ref re-checked on every call.
 *
 * The before/after figures are written to TDPROC_REPORT (default: the OS temp
 * dir) so a passing run still leaves its evidence behind.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  admin,
  adoptSignupProfile,
  assertRebuildTest,
  deleteCompanies,
  purgeCompaniesNamed,
  REQUIRED_PROJECT_REF,
  TEST_PASSWORD,
} from './live-session';
import { listDueForDeletion, runTrialDeletion, SURVIVES } from '@/lib/trial/deletion';

const MARKER = 'TDPROC Old Tenant';
const OWNER_EMAIL = 'josh+tdproc-owner@worthprop.com';
const CREW_EMAIL = 'josh+tdproc-crew@worthprop.com';
const BUCKETS = ['project-files', 'company-logos', 'exports', 'archives'] as const;
const REPORT = process.env.TDPROC_REPORT ?? join(tmpdir(), 'tenant-deletion-procedure.json');

let companyId = '';
const userIds: string[] = [];
/** deletion_jobs ids that existed before the run — the job's company_id is
 *  NULLED when the company goes (ON DELETE SET NULL), so the new job is found
 *  as "the id that was not there before", not by an unordered pick. */
let jobIdsBefore = new Set<string>();
const report: Record<string, unknown> = {};

async function catalogue<T>(sql: string): Promise<T[]> {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').match(
    /https:\/\/([a-z0-9]+)\.supabase\.co/
  )?.[1];
  if (!token) throw new Error('SUPABASE_ACCESS_TOKEN is not set; cannot read storage.objects.');
  if (ref !== REQUIRED_PROJECT_REF) throw new Error(`REFUSING: project is ${ref}.`);
  if (!/^\s*select\s/i.test(sql)) throw new Error(`REFUSING: read-only. Got: ${sql}`);
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) throw new Error(`catalogue read failed ${res.status}: ${await res.text()}`);
  return (await res.json()) as T[];
}

/** Objects under `{cid}/` per bucket, from the catalogue. */
async function storageCounts(cid: string): Promise<Record<string, number>> {
  if (!/^[0-9a-f-]{36}$/.test(cid)) throw new Error(`not a uuid: ${cid}`);
  const rows = await catalogue<{ bucket_id: string; n: number }>(
    `select bucket_id, count(*)::int as n from storage.objects
      where name like '${cid}/%' group by bucket_id`
  );
  const out: Record<string, number> = {};
  for (const b of BUCKETS) out[b] = rows.find((r) => r.bucket_id === b)?.n ?? 0;
  return out;
}

/** Every table with company_id, from the generated types (as s138 does). */
function censusTables(): string[] {
  const src = readFileSync(
    fileURLToPath(new URL('../../../packages/shared/types/database.ts', import.meta.url)),
    'utf8'
  );
  const section = src.slice(src.indexOf('  Tables: {'), src.indexOf('  Views: {'));
  const out: string[] = [];
  const re = /^      (\w+): \{\n        Row: \{([\s\S]*?)\n        \}/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(section)) !== null) if (/\bcompany_id\b/.test(m[2])) out.push(m[1]);
  if (out.length < 80) throw new Error('census parse failed');
  return out;
}

async function rowCounts(cid: string): Promise<Record<string, number>> {
  const db = admin as unknown as {
    from: (t: string) => {
      select: (c: string, o: { count: 'exact'; head: true }) => {
        eq: (c: string, v: string) => Promise<{ count: number | null; error: { message: string } | null }>;
      };
    };
  };
  const out: Record<string, number> = {};
  for (const t of censusTables()) {
    const { count, error } = await db.from(t).select('*', { count: 'exact', head: true }).eq('company_id', cid);
    if (error) throw new Error(`count ${t}: ${error.message}`);
    if (count) out[t] = count;
  }
  return out;
}

async function removeUploads(cid: string): Promise<void> {
  for (const b of ['project-files', 'company-logos', 'exports'] as const) {
    await admin.storage.from(b).remove([
      `${cid}/proj/photo.png`,
      `${cid}/proj/generated/co.pdf`,
      `${cid}/signatures/signature.png`,
      `${cid}/logo.png`,
      `${cid}/export.zip`,
    ]);
  }
}

/** Remove any leftover from a crashed run. */
async function nuke(): Promise<void> {
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const u of list?.users ?? []) {
    if (u.email !== OWNER_EMAIL && u.email !== CREW_EMAIL) continue;
    const { data: p } = await admin.from('profiles').select('company_id').eq('user_id', u.id).maybeSingle();
    const cid = p ? (p as { company_id: string }).company_id : null;
    if (cid) {
      await admin.from('deletion_jobs').delete().eq('company_id', cid);
      await admin.from('trial_lifecycle').delete().eq('company_id', cid);
      await admin.from('projects').delete().eq('company_id', cid);
      await admin.from('contacts').delete().eq('company_id', cid);
      await removeUploads(cid);
      await deleteCompanies(admin, [cid]);
    }
    await admin.auth.admin.deleteUser(u.id);
  }
  await purgeCompaniesNamed(admin, [MARKER]);
  for (const e of [OWNER_EMAIL, CREW_EMAIL]) await admin.from('trial_emails').delete().eq('email', e);
}

beforeAll(async () => {
  assertRebuildTest();
  await nuke();

  // The owner — signup trigger builds company, profile, member, subscription.
  const { data: o, error: oErr } = await admin.auth.admin.createUser({
    email: OWNER_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { company_name: MARKER, first_name: 'TD', last_name: 'Owner' },
  });
  if (oErr) throw new Error(`owner: ${oErr.message}`);
  userIds.push(o.user!.id);
  const { data: prof } = await admin.from('profiles').select('company_id').eq('user_id', o.user!.id).single();
  companyId = (prof as { company_id: string }).company_id;

  // A second auth user IN the tenant, as the real ones have (bishop-contracting: 5).
  const { data: c, error: cErr } = await admin.auth.admin.createUser({
    email: CREW_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { company_name: 'TDPROC spurious', first_name: 'TD', last_name: 'Crew' },
  });
  if (cErr) throw new Error(`crew: ${cErr.message}`);
  userIds.push(c.user!.id);
  await adoptSignupProfile(c.user!.id, { companyId, email: CREW_EMAIL, role: 'crew_member' });

  // ⚠️ THE OLD-TENANT SHAPE: no lifecycle row, as on the three production tenants.
  const del = await admin.from('trial_lifecycle').delete().eq('company_id', companyId).select('company_id');
  if (del.error) throw new Error(`lifecycle: ${del.error.message}`);

  // Rows.
  const { data: contact, error: ctErr } = await admin
    .from('contacts')
    .insert({ company_id: companyId, contact_type: 'client', first_name: 'TD', last_name: 'Client' })
    .select('id')
    .single();
  if (ctErr) throw new Error(`contact: ${ctErr.message}`);
  const { error: pErr } = await admin
    .from('projects')
    // project_number / project_internal_seq given explicitly: their DEFAULTs
    // read get_my_company_id(), which raises for the service role (as s138).
    .insert({
      company_id: companyId,
      name: `${MARKER} project`,
      project_number: 'PRJ-TDPROC-1',
      project_internal_seq: 1,
      contact_id: (contact as { id: string }).id,
    });
  if (pErr) throw new Error(`project: ${pErr.message}`);

  // Storage — NESTED, in every bucket the walk covers.
  // Typed per extension: company-logos only accepts image/png and image/jpeg.
  const typeOf = (path: string) =>
    path.endsWith('.png') ? 'image/png' : path.endsWith('.pdf') ? 'application/pdf' : 'application/zip';
  const uploads: Array<[string, string]> = [
    ['project-files', `${companyId}/proj/photo.png`],
    ['project-files', `${companyId}/proj/generated/co.pdf`],
    ['project-files', `${companyId}/signatures/signature.png`],
    ['company-logos', `${companyId}/logo.png`],
    ['exports', `${companyId}/export.zip`],
  ];
  for (const [bucket, path] of uploads) {
    const blob = new Blob(['tdproc'], { type: typeOf(path) });
    const { error } = await admin.storage
      .from(bucket)
      .upload(path, blob, { upsert: true, contentType: typeOf(path) });
    if (error) throw new Error(`upload ${bucket}/${path}: ${error.message}`);
  }
}, 240_000);

afterAll(async () => {
  writeFileSync(REPORT, JSON.stringify(report, null, 2));
  await nuke();
}, 240_000);

describe('tenant deletion procedure — rehearsed on an old-tenant shape', () => {
  it('0 — BEFORE: the tenant is real, has no lifecycle row, and is not yet due', async () => {
    const rows = await rowCounts(companyId);
    const storage = await storageCounts(companyId);
    report.before = { rows, storage, authUsers: userIds.length };

    expect(rows.companies ?? 0, 'census reads companies by id, not company_id').toBe(0);
    expect(rows.profiles).toBe(2);
    expect(rows.contacts).toBe(1);
    expect(rows.projects).toBe(1);
    expect(storage).toEqual({ 'project-files': 3, 'company-logos': 1, exports: 1, archives: 0 });

    const { data: lc } = await admin.from('trial_lifecycle').select('company_id').eq('company_id', companyId);
    expect(lc, 'the fixture still has a lifecycle row — not the old-tenant shape').toEqual([]);

    const due = await listDueForDeletion(admin as never, new Date());
    expect(due.map((d) => d.companyId)).not.toContain(companyId);
  });

  it('1 — the production step: write the lifecycle row, locked and already past delete_after', async () => {
    const day = 86_400_000;
    const now = Date.now();
    const { error } = await admin.from('trial_lifecycle').insert({
      company_id: companyId,
      trial_end: new Date(now - 60 * day).toISOString(),
      locked_at: new Date(now - 45 * day).toISOString(),
      delete_after: new Date(now - 1 * day).toISOString(),
    });
    expect(error).toBeNull();
  });

  it('2 — ⚠️ SAFETY GATE: the dry-run selection is EXACTLY this company', async () => {
    const due = await listDueForDeletion(admin as never, new Date());
    const ids = due.map((d) => d.companyId);
    report.dryRun = due;
    // Do NOT relax this. Anything else due would be deleted by the same run.
    expect(ids).toEqual([companyId]);
  });

  it('3 — the run: runTrialDeletion, the function the cron route calls', async () => {
    const { data: jobs, error } = await admin.from('deletion_jobs').select('id');
    if (error) throw new Error(`deletion_jobs snapshot: ${error.message}`);
    jobIdsBefore = new Set(((jobs ?? []) as Array<{ id: string }>).map((j) => j.id));

    const outcome = await runTrialDeletion(admin as never, new Date());
    report.outcome = outcome;
    expect(outcome.processed).toBe(1);
    expect(outcome.completed).toBe(1);
    expect(outcome.stopped).toBe(0);
  }, 300_000);

  it('4 — AFTER: no rows, no storage, no auth users; the job and lifecycle record it', async () => {
    const rows = await rowCounts(companyId);
    const storage = await storageCounts(companyId);
    const { data: co } = await admin.from('companies').select('id').eq('id', companyId);
    const authLeft: string[] = [];
    for (const id of userIds) {
      const { data } = await admin.auth.admin.getUserById(id);
      if (data?.user) authLeft.push(id);
    }
    const { data: allJobs } = await admin
      .from('deletion_jobs')
      .select('id, company_id, state, storage_done, auth_done, last_error');
    const newJobs = ((allJobs ?? []) as Array<{ id: string }>).filter((j) => !jobIdsBefore.has(j.id));
    const { data: lc } = await admin
      .from('trial_lifecycle')
      .select('deleted_at')
      .eq('company_id', companyId)
      .single();
    report.after = { rows, storage, companiesRow: co?.length ?? 0, authLeft, jobs: newJobs, lifecycle: lc };

    // SURVIVES are kept by design; trial_lifecycle is keyed by the dead id
    // (no FK) and carries deleted_at. Everything else must be gone.
    const leftovers = Object.entries(rows).filter(([t]) => !SURVIVES[t]);
    expect(leftovers, 'rows survived the walk').toEqual([]);
    expect(storage).toEqual({ 'project-files': 0, 'company-logos': 0, exports: 0, archives: 0 });
    expect(co).toEqual([]);
    expect(authLeft, 'an auth user survived').toEqual([]);
    expect(newJobs, 'expected exactly one new deletion job').toHaveLength(1);
    expect(newJobs[0]).toMatchObject({ state: 'complete', storage_done: true, auth_done: true });
    expect((lc as { deleted_at: string | null }).deleted_at).not.toBeNull();
  });
});
