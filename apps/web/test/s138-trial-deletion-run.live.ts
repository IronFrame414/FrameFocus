/**
 * S138 — runTrialDeletion(), ACTUALLY RUN, against a company built to be
 * destroyed — and a second company built to be SPARED.
 *
 * ============================================================================
 * ⚠️ READ THIS BEFORE RUNNING OR EDITING THIS FILE.
 * ============================================================================
 * This file executes the deletion job for real. It permanently destroys a
 * company, its storage objects and its auth user. Three things keep that
 * safe, and all three must stay true:
 *
 *   1. REBUILD-TEST ONLY — `assertRebuildTest()` throws otherwise.
 *   2. The doomed fixture is created HERE, and the safety gate verifies it is
 *      the ONLY company on the database due for deletion before the job runs.
 *   3. The deletion cron is still not scheduled (Q8's chain gates that);
 *      running the function from a test is not turning it on.
 *
 * REWRITTEN for the Phase-3 rulings on deletion-sweep-analysis.md [S176+]:
 * the pre-ruling version of this file asserted `companyRowsRemaining: 1` and
 * "the company SHELL remains — recorded as the current behaviour, not
 * endorsed" (#3-trial). Q2 unpinned the shell and Q3 archives the signed
 * documents, so this file now asserts the OPPOSITE — inverted per the S157
 * rule, with the superseded assertions quoted at their sites.
 *
 * What it proves now (the sweep's acceptance list):
 *   * a company PAST delete_after is deleted — rows (scanned across the FULL
 *     census, not the walk's own list), storage objects, auth user, and the
 *     companies row itself;
 *   * ⚠️ a company BEFORE delete_after is UNTOUCHED — the one that matters
 *     most, asserted by the same scan;
 *   * executed instruments land in archived_documents before the originals go;
 *   * running twice is safe (deleted_at takes the company out of the walk);
 *   * the survivors survive (ai_tag_logs nulled, trial_emails, lifecycle
 *     stamp).
 * ============================================================================
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  admin,
  assertRebuildTest,
  deleteCompanies,
  purgeCompaniesNamed,
  TEST_PASSWORD,
} from './live-session';
import { runTrialDeletion, SURVIVES } from '@/lib/trial/deletion';

const EMAIL = 'josh+s138doomed@worthprop.com';

let companyId = '';
let userId = '';
let aiLogId = '';
let sparedCompanyId = '';
let doomedCoId = '';

/**
 * [#2-s147] Companies this file creates, purged BY NAME from both ends.
 *
 * ⚠️ THE BY-EMAIL PATH IN `nuke()` CANNOT REACH A LEAKED ONE. It finds the
 * company through the auth user's profile — and the auth user deletes
 * successfully while the company does not, so the orphan loses its only handle
 * on the very run that creates it. The name is the handle that outlives both.
 */
const MARKERS = ['S138 Doomed Co', 'S138 Spared Co'] as const;

/** The census: every table carrying company_id, parsed from the generated
 *  types — the SAME source the deletion-census unit guard uses. The scan
 *  below trusts this, not COMPANY_TABLES, which is the point: a walk that
 *  lags the schema must FAIL here, not pass by consulting itself. */
function censusTables(): string[] {
  const src = readFileSync(
    fileURLToPath(new URL('../../../packages/shared/types/database.ts', import.meta.url)),
    'utf8'
  );
  const section = src.slice(src.indexOf('  Tables: {'), src.indexOf('  Views: {'));
  const out: string[] = [];
  const re = /^      (\w+): \{\n        Row: \{([\s\S]*?)\n        \}/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(section)) !== null) {
    if (/\bcompany_id\b/.test(m[2])) out.push(m[1]);
  }
  if (out.length < 80) throw new Error('census parse failed — check the regex');
  return out;
}

/** Count rows carrying a company_id, per table, across the whole census. */
async function scanCompany(cid: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const db = admin as unknown as {
    from: (t: string) => {
      select: (
        c: string,
        o: { count: 'exact'; head: true }
      ) => { eq: (c: string, v: string) => Promise<{ count: number | null; error: { message: string } | null }> };
    };
  };
  for (const table of censusTables()) {
    const { count, error } = await db
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq('company_id', cid);
    if (error) throw new Error(`scan ${table}: ${error.message}`);
    counts[table] = count ?? 0;
  }
  return counts;
}

async function cleanTenantSeeds(cid: string): Promise<void> {
  // Seeds this file makes that COMPANY_CHILDREN does not cover.
  //
  // ⚠️ ORDER MATTERS SINCE 20261056: a SIGNED change order deletes only when
  // its archived_documents copy exists (the boundary's archive gate). So:
  // stub-archive any unarchived signed CO → delete the COs → delete the
  // archive rows. And every delete is CHECKED — a silent teardown failure
  // here surfaced three tests later as a company_members pin [this file's
  // own history, same run this comment landed].
  const { data: signedCos } = await admin
    .from('change_orders')
    .select('id')
    .eq('company_id', cid)
    .not('signed_at', 'is', null);
  for (const co of (signedCos ?? []) as Array<{ id: string }>) {
    await admin.from('archived_documents').upsert(
      {
        source_table: 'change_orders',
        source_id: co.id,
        company_id: cid,
        company_name: 'S138 teardown stub',
        document: {},
      },
      { onConflict: 'source_table,source_id', ignoreDuplicates: true }
    );
  }
  for (const table of ['change_orders', 'projects', 'contacts', 'archived_documents'] as const) {
    const { error } = await admin.from(table).delete().eq('company_id', cid);
    if (error) throw new Error(`cleanTenantSeeds ${table}: ${error.message}`);
  }
  const { data: objs } = await admin.storage.from('project-files').list(cid, { limit: 100 });
  const paths = (objs ?? []).map((o) => `${cid}/${o.name}`);
  if (paths.length) await admin.storage.from('project-files').remove(paths);
}

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
      await cleanTenantSeeds(cid);
      await deleteCompanies(admin, [cid]);
    }
    await admin.auth.admin.deleteUser(u.id);
  }
  // Leaked fixtures found by NAME (see MARKERS): clean their seeds first so
  // the purge's parent delete cannot be pinned by them.
  const { data: leaked } = await admin.from('companies').select('id').ilike('name', 'S138 %');
  for (const row of (leaked ?? []) as Array<{ id: string }>) {
    await admin.from('deletion_jobs').delete().eq('company_id', row.id);
    await cleanTenantSeeds(row.id);
  }
  await purgeCompaniesNamed(admin, MARKERS);

  // ⚠️ [S157] UNCONDITIONAL, AND OUTSIDE THE USER LOOP — see the git history
  // of this file for the four-run self-resetting cycle this line ended.
  await admin.from('trial_emails').delete().eq('email', EMAIL.toLowerCase());
}

beforeAll(async () => {
  assertRebuildTest();
  await nuke();

  // ── the DOOMED company: auth user, tenant rows, a signed CO, storage ──────
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

  const { data: contact, error: contactErr } = await admin
    .from('contacts')
    .insert({ company_id: companyId, first_name: 'Doomed', last_name: 'Contact', contact_type: 'lead' })
    .select('id')
    .single();
  if (contactErr) throw new Error(`seed contact: ${contactErr.message}`);

  // A SIGNED change order → the Q3 archive path runs for real. A CO carries
  // no PDF column, so this exercises the row+line-item embed without storage.
  // project_number given explicitly: its DEFAULT calls next_project_number(),
  // which reads get_my_company_id() and raises for the service role.
  const { data: proj, error: projErr } = await admin
    .from('projects')
    .insert({
      company_id: companyId,
      name: 'Doomed Project',
      project_number: 'PRJ-DOOM-1',
      // Same reason as project_number: the DEFAULT reads the caller's company.
      project_internal_seq: 1,
      contact_id: (contact as { id: string }).id,
    })
    .select('id')
    .single();
  if (projErr) throw new Error(`seed project: ${projErr.message}`);
  const projectId = (proj as { id: string }).id;
  // author_member_id is NOT NULL: the signup trigger made exactly one member.
  const { data: member } = await admin
    .from('company_members')
    .select('id')
    .eq('company_id', companyId)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  const { data: co, error: coErr } = await admin
    .from('change_orders')
    .insert({
      company_id: companyId,
      project_id: projectId,
      co_number: 'CO-DOOM-1',
      title: 'Signed and doomed',
      status: 'signed',
      signed_at: new Date().toISOString(),
      author_member_id: (member as { id: string }).id,
    })
    .select('id')
    .single();
  if (coErr) throw new Error(`seed change order: ${coErr.message}`);
  doomedCoId = (co as { id: string }).id;

  // A storage object under the company prefix — the scan checks the BUCKET.
  const { error: upErr } = await admin.storage
    .from('project-files')
    .upload(`${companyId}/doomed.txt`, new Blob(['doomed']), { upsert: true });
  if (upErr) throw new Error(`seed storage: ${upErr.message}`);

  // The survivor under test [Josh, S137 Q1]. `model` is NOT NULL.
  const { data: log, error: logErr } = await admin
    .from('ai_tag_logs')
    .insert({ company_id: companyId, model: 'gpt-4o-2024-08-06', success: true, estimated_cost_usd: 0.00382 })
    .select('id')
    .single();
  if (logErr) throw new Error(`seed ai_tag_logs: ${logErr.message}`);
  aiLogId = (log as { id: string }).id;

  await admin
    .from('trial_lifecycle')
    .update({
      locked_at: new Date(Date.now() - 15 * 86400_000).toISOString(),
      delete_after: new Date(Date.now() - 86400_000).toISOString(),
    })
    .eq('company_id', companyId);

  // ── the SPARED company: locked, delete_after in the FUTURE ────────────────
  const { data: spared, error: spErr } = await admin
    .from('companies')
    .insert({ name: `S138 Spared Co ${Date.now()}`, slug: `s138-spared-${Date.now()}` })
    .select('id')
    .single();
  if (spErr) throw new Error(`spared company: ${spErr.message}`);
  sparedCompanyId = (spared as { id: string }).id;
  await admin
    .from('contacts')
    .insert({ company_id: sparedCompanyId, first_name: 'Spared', last_name: 'Contact', contact_type: 'lead' });
  await admin.storage
    .from('project-files')
    .upload(`${sparedCompanyId}/spared.txt`, new Blob(['spared']), { upsert: true });
  await admin.from('trial_lifecycle').insert({
    company_id: sparedCompanyId,
    trial_end: new Date(Date.now() - 20 * 86400_000).toISOString(),
    locked_at: new Date(Date.now() - 5 * 86400_000).toISOString(),
    delete_after: new Date(Date.now() + 9 * 86400_000).toISOString(),
    reason: 'trial',
  });
}, 240_000);

afterAll(async () => {
  await admin.from('trial_lifecycle').delete().eq('company_id', sparedCompanyId);
  await nuke();
});

describe('runTrialDeletion — executed, not described', () => {
  let sparedBefore: Record<string, number> = {};

  it('⚠️ SAFETY GATE: the doomed fixture is the ONLY company due for deletion', async () => {
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

    sparedBefore = await scanCompany(sparedCompanyId);
    expect(sparedBefore.contacts, 'the spared fixture has no rows to protect').toBeGreaterThan(0);
  }, 240_000);

  it('⚠️ THE RUN — completes, and the completion is REAL', async () => {
    const outcome = await runTrialDeletion(admin, new Date());
    expect(outcome.processed).toBe(1);

    // Superseded assertions, quoted rather than erased [S157]:
    //   `expect(outcome.companyRowsRemaining).toBe(1)` and
    //   `expect(outcome.stopped).toBe(1)` — the #3-trial era, when five audit
    // FKs RESTRICTed the parent delete and honesty was the best available
    // outcome. Q2 (20261054) unpinned the shell; a stop here is now a defect.
    // On failure, say WHY: the job row holds the real error and the teardown
    // wipes it before anyone can look.
    if (outcome.completed !== 1) {
      const { data: job } = await admin
        .from('deletion_jobs')
        .select('state, attempts, last_error, tables_done')
        .eq('company_id', companyId)
        .maybeSingle();
      const j = job as { state: string; last_error: string | null; tables_done: string[] | null } | null;
      expect.fail(
        `run did not complete: outcome=${JSON.stringify(outcome)} job.state=${j?.state} ` +
          `tables_done=${(j?.tables_done ?? []).length} last_error=${j?.last_error}`
      );
    }
    expect(outcome.completed).toBe(1);
    expect(outcome.stopped).toBe(0);
    expect(outcome.companyRowsRemaining).toBe(0);
  }, 480_000);

  it('⚠️ the companies row is GONE — deleted means deleted, name included', async () => {
    // Superseded: "the company SHELL remains — recorded as the current
    // behaviour, not endorsed". The ruling (#3-trial → Q2) has been made.
    const { data } = await admin.from('companies').select('id').eq('id', companyId).maybeSingle();
    expect(data).toBeNull();
  });

  it('⚠️ THE SCAN: no census table holds a doomed row the walk missed', async () => {
    // Every table with company_id, from the generated types — NOT from
    // COMPANY_TABLES. The walk is not allowed to grade its own work.
    const counts = await scanCompany(companyId);
    const leftovers = Object.entries(counts)
      .filter(([table, n]) => n > 0 && !SURVIVES[table])
      .map(([table, n]) => `${table}:${n}`);
    expect(leftovers, 'rows survived a deletion the policy says happened').toEqual([]);
  }, 240_000);

  it('⚠️ the storage prefix is empty — objects went with the rows', async () => {
    const { data } = await admin.storage.from('project-files').list(companyId, { limit: 10 });
    expect((data ?? []).map((o) => o.name)).toEqual([]);
  });

  it('⚠️ THE NEGATIVE CASE: the spared company is UNTOUCHED — scanned, not assumed', async () => {
    const after = await scanCompany(sparedCompanyId);
    expect(after, 'the sweep touched a company before its delete_after').toEqual(sparedBefore);

    const { data: co } = await admin
      .from('companies')
      .select('id')
      .eq('id', sparedCompanyId)
      .maybeSingle();
    expect(co).not.toBeNull();

    const { data: objs } = await admin.storage
      .from('project-files')
      .list(sparedCompanyId, { limit: 10 });
    expect((objs ?? []).map((o) => o.name)).toContain('spared.txt');
  }, 240_000);

  it('⚠️ RUNNING TWICE IS SAFE — the second run processes nothing', async () => {
    const second = await runTrialDeletion(admin, new Date());
    expect(second.processed).toBe(0);
    expect(second.completed).toBe(0);
  }, 240_000);

  it('⚠️ the signed change order is ARCHIVED — and the original is gone [Q3]', async () => {
    const { data } = await admin
      .from('archived_documents')
      .select('company_name, project_name, document, source_id')
      .eq('company_id', companyId)
      .eq('source_table', 'change_orders');
    const rows = (data ?? []) as Array<{
      company_name: string;
      project_name: string | null;
      document: Record<string, unknown>;
      source_id: string;
    }>;
    expect(rows.map((r) => r.source_id)).toEqual([doomedCoId]);
    // Identifiable after the tenant is gone: names are denormalized, and the
    // line items ride inside the document.
    expect(rows[0].company_name).toBe('S138 Doomed Co');
    expect(rows[0].project_name).toBe('Doomed Project');
    expect(rows[0].document.title).toBe('Signed and doomed');
    expect(Array.isArray(rows[0].document._archived_line_items)).toBe(true);
  });

  it('the deletion job finished honestly: complete, storage_done, auth_done', async () => {
    const { data } = await admin
      .from('deletion_jobs')
      .select('state, storage_done, auth_done')
      .eq('company_id', companyId)
      .maybeSingle();
    // Superseded: `state: 'stopped'` + last_error 'companies row remains'.
    // NOTE company_id on this row went NULL with the parent delete (Q2 SET
    // NULL) — so a null read here means the linkage worked; assert via the
    // most recent job instead.
    if (data) {
      expect((data as { state: string }).state).toBe('complete');
    } else {
      const { data: latest } = await admin
        .from('deletion_jobs')
        .select('state, storage_done, auth_done, company_id')
        .is('company_id', null)
        .order('finished_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      expect(latest, 'no completed job row found at all').not.toBeNull();
      expect((latest as { state: string }).state).toBe('complete');
      expect((latest as { storage_done: boolean }).storage_done).toBe(true);
      expect((latest as { auth_done: boolean }).auth_done).toBe(true);
    }
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
