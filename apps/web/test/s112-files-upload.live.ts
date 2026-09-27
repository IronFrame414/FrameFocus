/**
 * S112 queue 2a + 2b — measured against rebuild-test with the Owner's REAL
 * session driving the REAL services (getFiles / getDocumentFiles / uploadFile).
 *
 * 2a: on a disposable project, a `photos` image, an `other` IMAGE (a permit
 *     photographed on site) and an `other` PDF → Documents shows exactly the
 *     two non-photos rows, INCLUDING the image. By category, never by MIME.
 * 2b: 10 real uploads through runUploadBatch at concurrency 1 and 3 — wall
 *     time, max in flight, every file landed.
 *
 * ⚠️ DISPOSABLE: a project + contact named S112UP, every file row and Storage
 * object on it removed in afterAll (and swept on the way in). RUN ONLY WHILE NO
 * CI IS LIVE — it writes Storage.
 *
 *   S112_UP_OUT=/tmp/up.json npx vitest run --config test/live.vitest.config.ts s112-files-upload
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';
import { admin, assertRebuildTest, deleteProjects, sessionFor } from './live-session';

const state = vi.hoisted(() => ({ client: null as unknown as SupabaseClient }));
vi.mock('@/lib/supabase-browser', () => ({ createClient: () => state.client }));
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.client }));

import { getDocumentFiles, getFiles } from '@/lib/services/files';
import { uploadFile } from '@/lib/services/files-client';
import { runUploadBatch, toUploadItems } from '@/lib/uploads/upload-batch';

const OWNER = 'josh+test50@worthprop.com';
const MARKER = 'S112UP';
const OUT: Record<string, unknown> = {};
const record = (k: string, v: unknown) => {
  OUT[k] = v;
  if (process.env.S112_UP_OUT) writeFileSync(process.env.S112_UP_OUT, JSON.stringify(OUT, null, 2));
};

let companyId = '';
let projectId = '';

async function sweep() {
  const { data: ps } = await admin.from('projects').select('id').like('name', `${MARKER} %`);
  const ids = (ps ?? []).map((p) => p.id as string);
  if (ids.length) {
    const { data: fs } = await admin.from('files').select('file_path').in('project_id', ids);
    const paths = (fs ?? []).map((f) => f.file_path as string).filter(Boolean);
    for (let i = 0; i < paths.length; i += 100) await admin.storage.from('project-files').remove(paths.slice(i, i + 100));
    await admin.from('files').delete().in('project_id', ids);
    await deleteProjects(admin, ids);
  }
  await admin.from('contacts').delete().eq('last_name', `${MARKER} Client`);
}

beforeAll(async () => {
  assertRebuildTest();
  state.client = await sessionFor(OWNER);
  const { data: u } = await state.client.auth.getUser();
  const { data: p } = await admin.from('profiles').select('company_id').eq('user_id', u.user!.id).single();
  companyId = p!.company_id as string;
  await sweep();
  const { data: c } = await admin
    .from('contacts')
    .insert({ company_id: companyId, first_name: 'Up', last_name: `${MARKER} Client`, contact_type: 'client' })
    .select('id')
    .single();
  const { data: seq } = await admin
    .from('projects').select('project_internal_seq').eq('company_id', companyId)
    .order('project_internal_seq', { ascending: false }).limit(1).maybeSingle();
  const { data: proj, error } = await admin
    .from('projects')
    .insert({
      company_id: companyId,
      contact_id: c!.id,
      project_number: 'PRJ-S112UP',
      name: `${MARKER} project`,
      status: 'active',
      project_internal_seq: (seq?.project_internal_seq ?? 0) + 5000,
    })
    .select('id')
    .single();
  if (error) throw new Error(`project: ${error.message}`);
  projectId = proj!.id as string;
}, 180_000);

afterAll(async () => {
  await sweep();
  const { count } = await admin.from('projects').select('id', { count: 'exact', head: true }).like('name', `${MARKER} %`);
  record('teardown_projects_left', count ?? 0);
  expect(count ?? 0).toBe(0);
}, 300_000);

describe('2a — Documents → Files by CATEGORY, through the real service', () => {
  it('a photos image leaves; an image filed as a document STAYS; a PDF stays', async () => {
    const rows = [
      { file_name: `${MARKER}-site-photo.jpg`, category: 'photos', mime_type: 'image/jpeg' },
      { file_name: `${MARKER}-permit-photographed.jpg`, category: 'other', mime_type: 'image/jpeg' },
      { file_name: `${MARKER}-plan.pdf`, category: 'plans', mime_type: 'application/pdf' },
    ].map((r) => ({
      ...r,
      company_id: companyId,
      project_id: projectId,
      file_path: `${companyId}/${projectId}/${r.file_name}`,
      file_size: 10,
    }));
    const { error } = await admin.from('files').insert(rows);
    expect(error?.message ?? null).toBeNull();

    const all = await getFiles({ project_id: projectId });
    const docs = await getDocumentFiles(projectId);
    record('2a', { all: all.map((f) => f.file_name).sort(), documents: docs.map((f) => f.file_name).sort() });
    // CONTROL: the owner really reads all three (a pass on zero rows is a failure).
    expect(all).toHaveLength(3);
    expect(docs.map((f) => f.file_name).sort()).toEqual([
      `${MARKER}-permit-photographed.jpg`,
      `${MARKER}-plan.pdf`,
    ]);
    await admin.from('files').delete().eq('project_id', projectId);
  });
});

describe('2b — 10 real uploads through the shared queue', () => {
  const tenPdfs = (tag: string) =>
    Array.from({ length: 10 }, (_, i) => {
      const bytes = new Uint8Array(256 * 1024).map((_, j) => (j * 31 + i) % 251);
      return new File([bytes], `${MARKER}-${tag}-${i}.pdf`, { type: 'application/pdf' });
    });

  for (const concurrency of [1, 3]) {
    it(`concurrency ${concurrency}: all 10 land; wall time recorded`, async () => {
      let inFlight = 0;
      let maxInFlight = 0;
      const worker = async (f: File) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        try {
          return await uploadFile(f, { project_id: projectId, category: 'other' });
        } finally {
          inFlight -= 1;
        }
      };
      const t0 = performance.now();
      const out = await runUploadBatch(toUploadItems(tenPdfs(`c${concurrency}`)), worker, { concurrency });
      const ms = Math.round(performance.now() - t0);
      const failed = out.filter((i) => i.status !== 'done').map((i) => `${i.file.name}: ${i.error}`);
      const { count } = await admin
        .from('files').select('id', { count: 'exact', head: true })
        .eq('project_id', projectId).like('file_name', `${MARKER}-c${concurrency}-%`);
      record(`2b_c${concurrency}`, { ms, maxInFlight, done: out.length - failed.length, failed, rowsInDb: count, bytesPerFile: 256 * 1024 });
      expect(failed).toEqual([]);
      expect(count).toBe(10);
      expect(maxInFlight).toBe(concurrency);
    }, 300_000);
  }
});
