import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, purgeCompaniesNamed, sessionFor } from './live-session';
import { runTrashPurge, TRASH_RETENTION_MONTHS } from '@/lib/files/trash-purge';
import { runArchiveChunk } from '@/lib/files/archive';

// ============================================================================
// S178 — storage measurement + the 6-month trash purge, driven live.
//
// Migration: 20261057000000_storage_measurement.sql
// Spec:      docs/specs/storage-archive-ai-spec.md §1, §3 (FINALISED)
//
// Two subjects, two fixtures:
//   * the FIXTURE tenant (real session) proves the RPC: caller-scoped,
//     matches the admin-side sum, and — the §1 ruling — trashed rows COUNT.
//   * a PROBE company (no users) proves the purge: past-boundary files lose
//     object AND row, fresh trash is untouched (the negative case), and an
//     orphaned row (object already absent) is cleared rather than wedged.
// ============================================================================

const FIXTURE_OWNER = 'josh+test50@worthprop.com';
const MARKERS = ['S178'] as const;
const DAY = 86_400_000;

let ownerC: SupabaseClient;
let fixtureCompanyId = '';
let probeCompanyId = '';

const seededFileIds: string[] = [];
const seededPaths: string[] = [];

async function seedFile(opts: {
  companyId: string;
  path: string;
  size: number;
  deletedMonthsAgo?: number;
  withObject?: boolean;
}): Promise<string> {
  if (opts.withObject !== false) {
    const { error } = await admin.storage
      .from('project-files')
      .upload(opts.path, new Blob(['x'.repeat(Math.min(opts.size, 64))]), { upsert: true });
    if (error) throw new Error(`seed object ${opts.path}: ${error.message}`);
    seededPaths.push(opts.path);
  }
  const deletedAt =
    opts.deletedMonthsAgo === undefined
      ? null
      : new Date(Date.now() - opts.deletedMonthsAgo * 30.5 * DAY).toISOString();
  const { data, error } = await admin
    .from('files')
    .insert({
      company_id: opts.companyId,
      category: 'other',
      file_name: opts.path.split('/').pop()!,
      file_path: opts.path,
      file_size: opts.size,
      mime_type: 'text/plain',
      is_deleted: opts.deletedMonthsAgo !== undefined,
      deleted_at: deletedAt,
    })
    .select('id')
    .single();
  if (error) throw new Error(`seed files row ${opts.path}: ${error.message}`);
  const id = (data as { id: string }).id;
  seededFileIds.push(id);
  return id;
}

beforeAll(async () => {
  assertRebuildTest();
  await purgeCompaniesNamed(admin, MARKERS);

  ownerC = (await sessionFor(FIXTURE_OWNER)) as SupabaseClient;
  const { data: prof } = await admin
    .from('profiles')
    .select('company_id')
    .eq('email', FIXTURE_OWNER)
    .single();
  fixtureCompanyId = (prof as { company_id: string }).company_id;

  const { data: co, error } = await admin
    .from('companies')
    .insert({ name: `S178 Probe ${Date.now()}`, slug: `s178-probe-${Date.now()}` })
    .select('id')
    .single();
  if (error) throw new Error(`probe company: ${error.message}`);
  probeCompanyId = (co as { id: string }).id;
}, 240_000);

afterAll(async () => {
  if (seededPaths.length) await admin.storage.from('project-files').remove(seededPaths);
  if (seededFileIds.length) await admin.from('files').delete().in('id', seededFileIds);
  await admin.from('files').delete().eq('company_id', probeCompanyId);
  await purgeCompaniesNamed(admin, MARKERS);
});

// ============================================================================
describe('company_storage_used_bytes() — the §1 sum', () => {
  it('matches the admin-side sum for the caller company, and NOT some other scope', async () => {
    const { data: rpc, error } = await ownerC.rpc('company_storage_used_bytes');
    expect(error?.message ?? null).toBeNull();

    const { data: rows } = await admin
      .from('files')
      .select('file_size')
      .eq('company_id', fixtureCompanyId);
    const expected = ((rows ?? []) as Array<{ file_size: number }>).reduce(
      (a, r) => a + Number(r.file_size),
      0
    );
    expect(Number(rpc)).toBe(expected);
  });

  it('⚠️ TRASHED FILES COUNT — the ruling, measured', async () => {
    const { data: before } = await ownerC.rpc('company_storage_used_bytes');

    await seedFile({
      companyId: fixtureCompanyId,
      path: `${fixtureCompanyId}/s178-trashed-counts.txt`,
      size: 7777,
      deletedMonthsAgo: 0, // trashed NOW — nowhere near the purge boundary
    });

    const { data: after } = await ownerC.rpc('company_storage_used_bytes');
    expect(Number(after) - Number(before), 'a trashed file did not count').toBe(7777);
  });
});

// ============================================================================
describe(`the ${TRASH_RETENTION_MONTHS}-month purge`, () => {
  let oldId = '';
  let freshId = '';
  let orphanId = '';
  const oldPath = () => `${probeCompanyId}/s178-old.txt`;
  const freshPath = () => `${probeCompanyId}/s178-fresh.txt`;

  it('⚠️ past the boundary: object AND row are gone; fresh trash is UNTOUCHED', async () => {
    oldId = await seedFile({
      companyId: probeCompanyId,
      path: oldPath(),
      size: 100,
      deletedMonthsAgo: 7,
    });
    freshId = await seedFile({
      companyId: probeCompanyId,
      path: freshPath(),
      size: 100,
      deletedMonthsAgo: 0,
    });

    // ⚠️ SAFETY GATE (the s138 doctrine): the purge is company-agnostic and
    // this file runs it FOR REAL. If anything outside the probe is past the
    // boundary, REFUSE rather than eat another harness's fixture data.
    const boundary = new Date(Date.now() - TRASH_RETENTION_MONTHS * 30.5 * DAY);
    const { data: due } = await admin
      .from('files')
      .select('id, company_id')
      .eq('is_deleted', true)
      .not('deleted_at', 'is', null)
      .lte('deleted_at', boundary.toISOString());
    const foreign = ((due ?? []) as Array<{ company_id: string }>).filter(
      (r) => r.company_id !== probeCompanyId
    );
    expect(foreign, 'files OUTSIDE the probe are due — do not relax this; investigate').toEqual([]);

    const outcome = await runTrashPurge(admin as never, new Date());
    expect(outcome.errors, `purge errors: ${outcome.errors.join('; ')}`).toEqual([]);
    expect(outcome.purged).toBeGreaterThanOrEqual(1);

    const { data: oldRow } = await admin.from('files').select('id').eq('id', oldId).maybeSingle();
    expect(oldRow, 'the expired row survived').toBeNull();

    const { data: objs } = await admin.storage
      .from('project-files')
      .list(probeCompanyId, { limit: 100 });
    const names = (objs ?? []).map((o) => o.name);
    expect(names, 'the expired OBJECT survived — bytes still held').not.toContain('s178-old.txt');

    // ⚠️ The negative case: trashed yesterday is nobody's business for months.
    const { data: freshRow } = await admin
      .from('files')
      .select('id')
      .eq('id', freshId)
      .maybeSingle();
    expect(freshRow, 'the purge took a file INSIDE retention').not.toBeNull();
    expect(names).toContain('s178-fresh.txt');
  }, 120_000);

  it('an ORPHANED row (object already absent) is cleared, counted separately — not wedged forever', async () => {
    orphanId = await seedFile({
      companyId: probeCompanyId,
      path: `${probeCompanyId}/s178-never-existed.txt`,
      size: 100,
      deletedMonthsAgo: 8,
      withObject: false,
    });

    const outcome = await runTrashPurge(admin as never, new Date());
    expect(outcome.objectMissing).toBeGreaterThanOrEqual(1);
    expect(outcome.errors).toEqual([]);

    const { data } = await admin.from('files').select('id').eq('id', orphanId).maybeSingle();
    expect(data, 'the orphan row survived to hold phantom bytes in the §1 sum').toBeNull();
  }, 120_000);

  it('running twice finds nothing new — idempotent by emptiness', async () => {
    const again = await runTrashPurge(admin as never, new Date());
    expect(again.due, 'rows reappeared for a second purge').toBe(0);
  });
});

// ============================================================================
describe('the project archive — built for real, downloaded, OPENED', () => {
  let projectId = '';
  let jobId = '';

  afterAll(async () => {
    if (jobId) {
      const { data: objs } = await admin.storage
        .from('exports')
        .list(`${probeCompanyId}/${jobId}`);
      const paths = (objs ?? []).map((o) => `${probeCompanyId}/${jobId}/${o.name}`);
      if (paths.length) await admin.storage.from('exports').remove(paths);
      await admin.from('export_jobs').delete().eq('id', jobId);
    }
    if (projectId) {
      await admin.from('files').delete().eq('project_id', projectId);
      await admin.from('projects').delete().eq('id', projectId);
      await admin.from('contacts').delete().eq('company_id', probeCompanyId);
    }
  });

  it('⚠️ every file including TRASH, in category folders, with an honest manifest — and it opens', async () => {
    // A project with one live photo and one trashed document.
    const { data: contact } = await admin
      .from('contacts')
      .insert({
        company_id: probeCompanyId,
        first_name: 'Archive',
        last_name: 'Client',
        contact_type: 'lead',
      })
      .select('id')
      .single();
    const { data: project, error: projErr } = await admin
      .from('projects')
      .insert({
        company_id: probeCompanyId,
        name: 'S178 Archive Project',
        project_number: 'PRJ-S178-1',
        project_internal_seq: 1,
        contact_id: (contact as { id: string }).id,
      })
      .select('id')
      .single();
    if (projErr) throw new Error(`seed project: ${projErr.message}`);
    projectId = (project as { id: string }).id;

    const seedInProject = async (name: string, category: string, trashed: boolean) => {
      const path = `${probeCompanyId}/${projectId}/${name}`;
      await admin.storage
        .from('project-files')
        .upload(path, new Blob([`content of ${name}`]), { upsert: true });
      seededPaths.push(path);
      const { data, error } = await admin
        .from('files')
        .insert({
          company_id: probeCompanyId,
          project_id: projectId,
          category,
          file_name: name,
          file_path: path,
          file_size: 100,
          mime_type: 'text/plain',
          is_deleted: trashed,
          deleted_at: trashed ? new Date().toISOString() : null,
        })
        .select('id')
        .single();
      if (error) throw new Error(`seed ${name}: ${error.message}`);
      seededFileIds.push((data as { id: string }).id);
    };
    await seedInProject('site-photo.jpg', 'photos', false);
    await seedInProject('old-contract.txt', 'contracts', true);

    const { data: job, error: jobErr } = await admin
      .from('export_jobs')
      .insert({
        company_id: probeCompanyId,
        requested_by: null,
        categories: [],
        kind: 'project_archive',
        project_id: projectId,
        state: 'pending',
      })
      .select('id, company_id, project_id, cursor, bytes_written')
      .single();
    if (jobErr) throw new Error(`seed job: ${jobErr.message}`);
    jobId = (job as { id: string }).id;

    const result = await runArchiveChunk(admin as never, job as never, new Date());
    expect(result.done, 'the archive did not finish in one chunk on a 2-file project').toBe(true);
    expect(result.notes, `unreadable files: ${result.notes.join('; ')}`).toEqual([]);

    // Download the part and OPEN it — the acceptance is "and opens".
    const { data: blob, error: dlErr } = await admin.storage
      .from('exports')
      .download(`${probeCompanyId}/${jobId}/part-001.zip`);
    expect(dlErr?.message ?? null).toBeNull();
    const entries = unzipSync(new Uint8Array(await blob!.arrayBuffer()));
    const names = Object.keys(entries).sort();

    expect(names).toContain('photos/site-photo.jpg');
    // ⚠️ The trashed file is IN, in its own folder — ruled.
    expect(names).toContain('trash/old-contract.txt');
    expect(names).toContain('MANIFEST.txt');

    const manifest = strFromU8(entries['MANIFEST.txt']);
    expect(manifest).toContain('S178 Archive Project');
    expect(manifest).toContain('photos/: 1');
    expect(manifest).toContain('trash/: 1');
    expect(manifest).toContain('Files unreadable and NOT included: 0');
    // The bytes round-tripped, not just the names.
    expect(strFromU8(entries['photos/site-photo.jpg'])).toBe('content of site-photo.jpg');
  }, 120_000);
});
