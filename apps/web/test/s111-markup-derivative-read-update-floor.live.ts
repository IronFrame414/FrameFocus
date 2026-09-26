import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor, sweepProjectsNamed } from './live-session';

// ============================================================================
// S111 hardening, ruling B — the `.markup.jpg` arms of
// project_files_select_non_client and project_files_update_non_client.
// rebuild-test only. Companion to s111-markup-derivative-floor.live.ts (INSERT).
// ============================================================================
// Both arms read, as of 20261008000000 / 20261780000000:
//   name LIKE '%.markup.jpg' AND EXISTS (SELECT 1 FROM files f WHERE f.file_path = <original>)
// scoped ONLY by the caller's `files` RLS — the coupling 20261790000000 removed
// from INSERT. Ruling B, on record: a loose UPDATE lets someone not on the
// project OVERWRITE an existing markup; a loose READ lets them see it.
//
// WRITTEN AND RUN FIRST, AGAINST THE CURRENT POLICIES, before either changed.
// If an unassigned user gets through here, that is a live production leak and
// the session stops (ruling B2).
//
// THE ACTOR is a subcontractor — in both policies' role gate (`role <> 'client'`),
// so a refusal cannot come from the role check; it has to come from scoping.
//
// TWO ORIGINALS on a project the sub is NOT assigned to, each with a derivative
// ALREADY in storage (written by the service role, with known bytes):
//   projpath  `{company}/{projectId}/…`
//   estpath   `{company}/estimates/{uuid}/…`, project_id set — a converted photo
//
// ⚠️ WHAT "ZERO" IS COUNTED WITH.
//   READ   — objects the sub can DOWNLOAD (storage GET is the SELECT policy).
//            The service role first counts the object as present (1), so a 0
//            for the sub is a refusal, not a missing object.
//   UPDATE — objects whose storage.objects ROW changed (size or updated_at),
//            read with the service role before and after the attempt. NOT the
//            downloaded bytes — see objectMeta() for why.
// ⚠️ CONTROLS THAT MUST FIRE (section 4): the same sub, once assigned, downloads
// 1 and overwrites 1 (the service role sees the new bytes).
// ============================================================================

const MARKER = 'S111MKRW';
const OWNER = 'josh+test50@worthprop.com';
const SUB = 'josh+qa-sub@worthprop.com';
const BUCKET = 'project-files';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAHElEQVQoz2P8z8Dwn4GKgIlqJo0aOGrgqIHDwEAAaSgDBaMLcOgAAAAASUVORK5CYII=',
  'base64'
);
const SEEDED = 'SEEDED-DERIVATIVE';
const OVERWRITE = 'OVERWRITTEN-BY-SUB';
const KEYS = ['projpath', 'estpath'] as const;
type Key = (typeof KEYS)[number];

let subC: SupabaseClient;
let companyId = '';
let projectId = '';
let subMemberId = '';
const paths: Record<Key, string> = { projpath: '', estpath: '' };
const deriv = (k: Key) => `${paths[k]}.markup.jpg`;

/** Service-role count of storage objects with exactly this name. */
async function objectCount(name: string): Promise<number> {
  const slash = name.lastIndexOf('/');
  const { data, error } = await admin.storage
    .from(BUCKET)
    .list(name.slice(0, slash), { search: name.slice(slash + 1), limit: 100 });
  expect(error, error?.message).toBeNull();
  return (data ?? []).filter((o) => o.name === name.slice(slash + 1)).length;
}

/**
 * Service-role read of the object's DATABASE row — size and updated_at from
 * storage.objects via list(). ⚠️ This, not download(), is the UPDATE
 * instrument: the first run of this file read the bytes back with download()
 * and saw the SEEDED bytes after an assigned sub's update returned no error —
 * a cached read cannot see a change, so it could not prove "0 changed" either.
 */
async function objectMeta(name: string): Promise<{ size: number; updated_at: string }> {
  const slash = name.lastIndexOf('/');
  const { data, error } = await admin.storage
    .from(BUCKET)
    .list(name.slice(0, slash), { search: name.slice(slash + 1), limit: 100 });
  expect(error, error?.message).toBeNull();
  const rows = (data ?? []).filter((o) => o.name === name.slice(slash + 1));
  expect(rows, `exactly one object named ${name}`).toHaveLength(1);
  const meta = (rows[0].metadata ?? {}) as { size?: number };
  return { size: Number(meta.size), updated_at: String(rows[0].updated_at) };
}

/** Service-role read of the object's bytes as text — printed only, see objectMeta(). */
async function bytesOf(name: string): Promise<string> {
  const { data, error } = await admin.storage.from(BUCKET).download(name);
  expect(error, error?.message).toBeNull();
  return await data!.text();
}

async function sweep() {
  const { data: files } = await admin.from('files').select('id, file_path').like('file_name', `${MARKER}%`);
  const rows = (files ?? []) as { id: string; file_path: string }[];
  if (rows.length) {
    await admin.storage.from(BUCKET).remove(rows.flatMap((r) => [r.file_path, `${r.file_path}.markup.jpg`]));
    await admin.from('files').delete().in('id', rows.map((r) => r.id));
  }
  await sweepProjectsNamed(MARKER);
}

async function seed(key: Key) {
  const id = crypto.randomUUID();
  const name = `${MARKER}-${key}.png`;
  const path =
    key === 'projpath'
      ? `${companyId}/${projectId}/${id}-${name}`
      : `${companyId}/estimates/${crypto.randomUUID()}/${id}-${name}`;
  const up = await admin.storage.from(BUCKET).upload(path, PNG, { contentType: 'image/png' });
  expect(up.error, up.error?.message).toBeNull();
  const ins = await admin.from('files').insert({
    id,
    company_id: companyId,
    project_id: projectId,
    estimate_id: null,
    category: 'photos',
    file_name: name,
    file_path: path,
    file_size: PNG.length,
    mime_type: 'image/png',
    markup_data: { version: 1, shapes: [] },
  });
  expect(ins.error, ins.error?.message).toBeNull();
  const d = await admin.storage
    .from(BUCKET)
    .upload(`${path}.markup.jpg`, Buffer.from(SEEDED), { contentType: 'image/jpeg' });
  expect(d.error, d.error?.message).toBeNull();
  paths[key] = path;
}

beforeAll(async () => {
  assertRebuildTest();
  await sweep();
  subC = await sessionFor(SUB);

  const { data: owner } = await admin
    .from('profiles')
    .select('company_id')
    .eq('email', OWNER)
    .eq('is_deleted', false)
    .single();
  companyId = (owner as { company_id: string }).company_id;

  const { data: sub } = await admin
    .from('profiles')
    .select('id, role, company_id')
    .eq('email', SUB)
    .eq('is_deleted', false)
    .single();
  const subProfile = sub as { id: string; role: string; company_id: string };
  expect(subProfile.role, 'the actor must be a subcontractor').toBe('subcontractor');
  expect(subProfile.company_id, 'same company, or the folder check refuses first').toBe(companyId);
  const { data: m } = await admin
    .from('company_members')
    .select('id')
    .eq('profile_id', subProfile.id)
    .eq('is_deleted', false)
    .single();
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
  const { data: counters } = await admin
    .from('companies')
    .select('project_internal_sequence')
    .eq('id', companyId)
    .single();
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

describe('S111 markup R/U floor — 1. fixture', () => {
  it('1a — the sub is NOT assigned (0 assignment rows)', async () => {
    const { data } = await admin
      .from('project_assignments')
      .select('id')
      .eq('project_id', projectId)
      .eq('member_id', subMemberId)
      .eq('is_deleted', false);
    console.log(`[S111 R/U 1a] sub assignment rows: ${(data ?? []).length} (expected 0)`);
    expect(data ?? []).toHaveLength(0);
  });

  it('1b — each derivative exists (service role: 1 object) with the seeded bytes', async () => {
    for (const k of KEYS) {
      expect(await objectCount(deriv(k)), `${k} derivative`).toBe(1);
      expect((await objectMeta(deriv(k))).size, 'seeded size').toBe(SEEDED.length);
    }
  });
});

describe('S111 markup R/U floor — 2. an UNASSIGNED subcontractor cannot READ a derivative', () => {
  for (const k of KEYS) {
    it(`2-${k} — download refused and no signed URL: 0 objects readable`, async () => {
      const dl = await subC.storage.from(BUCKET).download(deriv(k));
      const signed = await subC.storage.from(BUCKET).createSignedUrl(deriv(k), 60);
      const readable = (dl.data ? 1 : 0) + (signed.data?.signedUrl ? 1 : 0);
      console.log(
        `[S111 R/U 2-${k}] download: ${dl.error ? 'refused' : 'READ'}; signed URL: ${
          signed.data?.signedUrl ? 'ISSUED' : 'refused'
        }; readable: ${readable} (expected 0)`
      );
      expect(readable, `LEAK — an unassigned subcontractor read ${deriv(k)}`).toBe(0);
    });
  }
});

describe('S111 markup R/U floor — 3. an UNASSIGNED subcontractor cannot UPDATE a derivative', () => {
  for (const k of KEYS) {
    it(`3-${k} — overwrite refused: 0 objects changed (bytes read back by the service role)`, async () => {
      const before = await objectMeta(deriv(k));
      const up = await subC.storage
        .from(BUCKET)
        .update(deriv(k), Buffer.from(OVERWRITE), { contentType: 'image/jpeg' });
      const after = await objectMeta(deriv(k));
      const changed = after.size !== before.size || after.updated_at !== before.updated_at ? 1 : 0;
      console.log(
        `[S111 R/U 3-${k}] client: ${up.error?.message ?? 'NO ERROR'}; row before ${before.size}B @${before.updated_at}, after ${after.size}B @${after.updated_at}; objects changed: ${changed} (expected 0)`
      );
      expect(changed, `LEAK — an unassigned subcontractor overwrote ${deriv(k)}`).toBe(0);
      expect(up.error, 'the update reported success').not.toBeNull();
    });
  }
});

describe('S111 markup R/U floor — 4. CONTROL: the same sub, once assigned, CAN read and update', () => {
  it('4a — assign the sub', async () => {
    const ins = await admin.from('project_assignments').insert({
      company_id: companyId,
      project_id: projectId,
      member_id: subMemberId,
      role_on_project: 'crew',
    });
    expect(ins.error, ins.error?.message).toBeNull();
  });

  for (const k of KEYS) {
    it(`4b-${k} — reads 1, overwrites 1`, async () => {
      const dl = await subC.storage.from(BUCKET).download(deriv(k));
      expect(dl.error?.message ?? null, 'an ASSIGNED sub could not read — the probe is dead').toBeNull();
      expect(await dl.data!.text()).toBe(SEEDED);

      const before = await objectMeta(deriv(k));
      const up = await subC.storage
        .from(BUCKET)
        .update(deriv(k), Buffer.from(OVERWRITE), { contentType: 'image/jpeg' });
      expect(up.error?.message ?? null, 'an ASSIGNED sub could not update — the probe is dead').toBeNull();
      const after = await objectMeta(deriv(k));
      const changed = after.size !== before.size || after.updated_at !== before.updated_at ? 1 : 0;
      console.log(
        `[S111 R/U 4b-${k}] readable: 1; row before ${before.size}B @${before.updated_at}, after ${after.size}B @${after.updated_at}; objects changed: ${changed} (expected 1); download() now reads: ${await bytesOf(deriv(k))}`
      );
      expect(changed).toBe(1);
      expect(after.size).toBe(OVERWRITE.length);
    });
  }
});
