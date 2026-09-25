import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { thumbPathFor } from '@framefocus/shared/utils/markup';
import { admin, assertRebuildTest, sessionFor, sweepProjectsNamed } from './live-session';

// ============================================================================
// S111 D, option A — who may READ a stored grid thumbnail (`.thumb.webp`).
// rebuild-test only.
// ============================================================================
// A thumbnail is a derivative with NO `files` row — exactly the shape whose
// authority 20261790000000 / 20261800000000 stopped borrowing from the
// original's row. Ruling [Josh]: its read rule checks PROJECT ASSIGNMENT
// directly, never "can you see the original's row".
//
// WRITTEN AND RUN FIRST, before any thumbnail policy existed. At that point:
//   * section 2 (unassigned: 0 readable) is expected to PASS — nothing lets a
//     non owner/admin read a `.thumb.webp` at all;
//   * section 3's CONTROL (assigned: readable) is expected to FAIL, for the
//     same reason. That red run is the proof the policy is what grants it.
//
// ACTOR: a subcontractor (non-client, so it reaches every non-client arm).
// TWO THUMBNAILS on a project the sub is NOT assigned to: a plain photo's
// (`{path}.thumb.webp`) and an annotated photo's (`{path}.m{hex}.thumb.webp`),
// the second on the estimates/ path a converted photo keeps.
//
// "READABLE" is measured three ways, because the grid uses the third:
// download (GET), a single signed URL, and the BATCH sign the grid calls.
// ============================================================================

const MARKER = 'S111THUMBFLOOR';
const OWNER = 'josh+test50@worthprop.com';
const SUB = 'josh+qa-sub@worthprop.com';
const BUCKET = 'project-files';
const WEBP = Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64'); // 1x1
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAHElEQVQoz2P8z8Dwn4GKgIlqJo0aOGrgqIHDwEAAaSgDBaMLcOgAAAAASUVORK5CYII=',
  'base64'
);
const MARKUP = { version: 1, imageWidth: 8, imageHeight: 8, shapes: [{ kind: 'line', x1: 0, y1: 0, x2: 8, y2: 8 }] };
const KEYS = ['plain', 'annotated'] as const;
type Key = (typeof KEYS)[number];

let subC: SupabaseClient;
let companyId = '';
let projectId = '';
let subMemberId = '';
const originals: Record<Key, string> = { plain: '', annotated: '' };
const thumbs: Record<Key, string> = { plain: '', annotated: '' };

async function sweep() {
  const { data: files } = await admin.from('files').select('id, file_path, markup_data').like('file_name', `${MARKER}%`);
  const rows = (files ?? []) as { id: string; file_path: string; markup_data: unknown }[];
  if (rows.length) {
    await admin.storage
      .from(BUCKET)
      .remove(rows.flatMap((r) => [r.file_path, thumbPathFor(r.file_path, r.markup_data), thumbPathFor(r.file_path, null)]));
    await admin.from('files').delete().in('id', rows.map((r) => r.id));
  }
  await sweepProjectsNamed(MARKER);
}

async function seed(key: Key) {
  const id = crypto.randomUUID();
  const name = `${MARKER}-${key}.png`;
  const path =
    key === 'plain'
      ? `${companyId}/${projectId}/${id}-${name}`
      : `${companyId}/estimates/${crypto.randomUUID()}/${id}-${name}`;
  const markup = key === 'annotated' ? MARKUP : null;
  expect((await admin.storage.from(BUCKET).upload(path, PNG, { contentType: 'image/png' })).error).toBeNull();
  const ins = await admin.from('files').insert({
    id,
    company_id: companyId,
    project_id: projectId,
    category: 'photos',
    file_name: name,
    file_path: path,
    file_size: PNG.length,
    mime_type: 'image/png',
    markup_data: markup,
  });
  expect(ins.error, ins.error?.message).toBeNull();
  // Read the row back so the fingerprint is computed from what Postgres stores.
  const { data: back } = await admin.from('files').select('markup_data').eq('id', id).single();
  const thumb = thumbPathFor(path, (back as { markup_data: unknown }).markup_data);
  expect((await admin.storage.from(BUCKET).upload(thumb, WEBP, { contentType: 'image/webp' })).error).toBeNull();
  originals[key] = path;
  thumbs[key] = thumb;
}

async function readable(c: SupabaseClient, path: string) {
  const dl = await c.storage.from(BUCKET).download(path);
  const one = await c.storage.from(BUCKET).createSignedUrl(path, 60);
  const batch = await c.storage.from(BUCKET).createSignedUrls([path], 60);
  const inBatch = (batch.data ?? []).filter((d) => d.signedUrl && !d.error).length;
  return { download: dl.data ? 1 : 0, signed: one.data?.signedUrl ? 1 : 0, batch: inBatch };
}

beforeAll(async () => {
  assertRebuildTest();
  await sweep();
  subC = await sessionFor(SUB);
  const { data: owner } = await admin.from('profiles').select('company_id').eq('email', OWNER).eq('is_deleted', false).single();
  companyId = (owner as { company_id: string }).company_id;
  const { data: sub } = await admin.from('profiles').select('id, role, company_id').eq('email', SUB).eq('is_deleted', false).single();
  const s = sub as { id: string; role: string; company_id: string };
  expect(s.role).toBe('subcontractor');
  expect(s.company_id).toBe(companyId);
  const { data: m } = await admin.from('company_members').select('id').eq('profile_id', s.id).eq('is_deleted', false).single();
  subMemberId = (m as { id: string }).id;
  // Any contact will do; ordered so the pick is stable (CLAUDE.md, .limit(1)).
  const { data: c } = await admin
    .from('contacts')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .single();
  const { data: counters } = await admin.from('companies').select('project_internal_sequence').eq('id', companyId).single();
  const internal = (counters as { project_internal_sequence: number }).project_internal_sequence + 1;
  const { data: project, error: pErr } = await admin
    .from('projects')
    .insert({
      company_id: companyId,
      name: `${MARKER} unassigned`,
      contact_id: (c as { id: string }).id,
      project_type: 'fixed_price',
      project_number: `PRJ-${MARKER}`,
      project_internal_seq: internal,
    })
    .select('id')
    .single();
  expect(pErr, pErr?.message).toBeNull();
  projectId = (project as { id: string }).id;
  await admin.from('companies').update({ project_internal_sequence: internal }).eq('id', companyId);
  for (const k of KEYS) await seed(k);
}, 120_000);

afterAll(async () => {
  await sweep();
}, 120_000);

describe('S111 thumbnail read floor — 1. fixture', () => {
  it('1a — the sub is NOT assigned (0 rows); both thumbnails exist (service role reads each)', async () => {
    const { data } = await admin
      .from('project_assignments')
      .select('id')
      .eq('project_id', projectId)
      .eq('member_id', subMemberId)
      .eq('is_deleted', false);
    expect(data ?? []).toHaveLength(0);
    expect(thumbs.plain.endsWith(`${originals.plain}.thumb.webp`)).toBe(true);
    expect(thumbs.annotated).toMatch(/\.m[0-9a-f]{8}\.thumb\.webp$/);
    for (const k of KEYS) expect((await readable(admin, thumbs[k])).download, `${k} thumb exists`).toBe(1);
  });
});

describe('S111 thumbnail read floor — 2. an UNASSIGNED subcontractor cannot read a thumbnail', () => {
  for (const k of KEYS) {
    it(`2-${k} — 0 readable (download, signed URL, batch sign)`, async () => {
      const r = await readable(subC, thumbs[k]);
      console.log(`[S111 thumb floor 2-${k}] ${JSON.stringify(r)} (expected all 0)`);
      expect(r, `LEAK — an unassigned subcontractor read ${thumbs[k]}`).toEqual({ download: 0, signed: 0, batch: 0 });
    });
  }
});

describe('S111 thumbnail read floor — 3. CONTROL: the same sub, once assigned, CAN read', () => {
  it('3a — assign the sub', async () => {
    const ins = await admin
      .from('project_assignments')
      .insert({ company_id: companyId, project_id: projectId, member_id: subMemberId, role_on_project: 'crew' });
    expect(ins.error, ins.error?.message).toBeNull();
  });
  for (const k of KEYS) {
    it(`3b-${k} — 1 readable each way`, async () => {
      const r = await readable(subC, thumbs[k]);
      console.log(`[S111 thumb floor 3b-${k}] ${JSON.stringify(r)} (expected all 1)`);
      expect(r).toEqual({ download: 1, signed: 1, batch: 1 });
    });
  }
});
