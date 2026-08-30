import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, purgeCompaniesNamed, sessionFor } from './live-session';
import { runTrashPurge, TRASH_RETENTION_MONTHS } from '@/lib/files/trash-purge';

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
