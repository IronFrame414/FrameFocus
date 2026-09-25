import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor, sweepProjectsNamed } from './live-session';

// ============================================================================
// S111 hardening, item 2 — the `.markup.jpg` arm of
// project_files_insert_non_client (20261780000000) must not let a user write a
// markup derivative beside a file on a project they are NOT assigned to.
// rebuild-test only.
// ============================================================================
// WHY THIS EXISTS. As shipped in 20261780000000, that arm's only condition is
//   name LIKE '%.markup.jpg' AND EXISTS (SELECT 1 FROM files f WHERE f.file_path = <original>)
// and the EXISTS runs under the CALLER's `files` RLS. It is correct today only
// because files_select_non_client is narrow (can_view_project → assignment).
// That is a coupling, not a floor: widen `files` SELECT later and this storage
// policy widens with it, silently. This file is the tripwire for the storage
// policy's OWN behaviour, measured with a real session.
//
// THE ACTOR is a subcontractor — a role IN the policy's role array, so the
// refusal cannot come from the role gate; it has to come from the scoping.
//
// TWO ORIGINALS, both on a project the sub is NOT assigned to:
//   projpath  `{company}/{projectId}/…`            — the normal upload path; the
//             CASE (assignment) arm already refuses it, so only the markup arm
//             could admit it.
//   estpath   `{company}/estimates/{uuid}/…`, project_id set — the shape a
//             CONVERTED estimate photo keeps. Segment 2 is 'estimates', so the
//             CASE arm is `false` and the markup arm is the ONLY way in. This is
//             the case 20261780000000 was written for.
//
// ⚠️ "ZERO ROWS WRITTEN" IS MEASURED AGAINST THE DATABASE, not inferred from the
// client's error: the object is looked up by exact name with the service role
// after each attempt, and the count is printed. A refusal whose object exists
// anyway is a leak.
//
// ⚠️ CONTROL THAT MUST FIRE (section 3): the SAME sub, once assigned, writes the
// estpath derivative and the service role then counts exactly 1. Without it,
// section 2 could pass because the probe can never succeed (bad path, bad
// session, missing bucket) rather than because the policy refused.
// ============================================================================

const MARKER = 'S111MKFLOOR';
const OWNER = 'josh+test50@worthprop.com';
const SUB = 'josh+qa-sub@worthprop.com';
const BUCKET = 'project-files';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAHElEQVQoz2P8z8Dwn4GKgIlqJo0aOGrgqIHDwEAAaSgDBaMLcOgAAAAASUVORK5CYII=',
  'base64'
);

type Key = 'projpath' | 'estpath';

let subC: SupabaseClient;
let companyId = '';
let projectId = '';
let subMemberId = '';
const fileIds: Record<Key, string> = { projpath: '', estpath: '' };
const paths: Record<Key, string> = { projpath: '', estpath: '' };

/** Service-role count of storage objects with exactly this name. */
async function objectCount(name: string): Promise<number> {
  const slash = name.lastIndexOf('/');
  const folder = name.slice(0, slash);
  const base = name.slice(slash + 1);
  const { data, error } = await admin.storage.from(BUCKET).list(folder, { search: base, limit: 100 });
  expect(error, error?.message).toBeNull();
  return (data ?? []).filter((o) => o.name === base).length;
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

async function seedOriginal(key: Key) {
  const id = crypto.randomUUID();
  const name = `${MARKER}-${key}.png`;
  const path =
    key === 'projpath'
      ? `${companyId}/${projectId}/${id}-${name}`
      : // A converted estimate photo keeps its estimate path (ruling: move no files).
        `${companyId}/estimates/${crypto.randomUUID()}/${id}-${name}`;
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
  });
  expect(ins.error, ins.error?.message).toBeNull();
  fileIds[key] = id;
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
  expect(subProfile.role, 'the actor must be a subcontractor — a role IN the policy array').toBe('subcontractor');
  expect(subProfile.company_id, 'the sub must be in the same company, or the folder check refuses first').toBe(
    companyId
  );
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

  await seedOriginal('projpath');
  await seedOriginal('estpath');
}, 120_000);

afterAll(async () => {
  await sweep();
}, 120_000);

describe('S111 markup floor — 1. fixture', () => {
  it('1a — the sub is NOT assigned to the project (0 assignment rows)', async () => {
    const { data } = await admin
      .from('project_assignments')
      .select('id')
      .eq('project_id', projectId)
      .eq('member_id', subMemberId)
      .eq('is_deleted', false);
    console.log(`[S111 floor 1a] sub assignment rows on the project: ${(data ?? []).length} (expected 0)`);
    expect(data ?? []).toHaveLength(0);
  });

  it('1b — both originals exist in storage (1 object each), and no derivative yet (0 each)', async () => {
    for (const key of ['projpath', 'estpath'] as const) {
      expect(await objectCount(paths[key]), `${key} original`).toBe(1);
      expect(await objectCount(`${paths[key]}.markup.jpg`), `${key} derivative before the attempt`).toBe(0);
    }
  });
});

describe('S111 markup floor — 2. an UNASSIGNED subcontractor cannot write a derivative', () => {
  for (const key of ['projpath', 'estpath'] as const) {
    it(`2-${key} — refused, and ZERO objects written (measured by the service role)`, async () => {
      const der = await subC.storage
        .from(BUCKET)
        .upload(`${paths[key]}.markup.jpg`, PNG, { contentType: 'image/jpeg', upsert: true });
      const written = await objectCount(`${paths[key]}.markup.jpg`);
      console.log(
        `[S111 floor 2-${key}] client error: ${der.error?.message ?? 'NONE'}; objects written: ${written} (expected 0)`
      );
      expect(written, `LEAK — an unassigned subcontractor wrote ${paths[key]}.markup.jpg`).toBe(0);
      expect(der.error, 'the upload reported success').not.toBeNull();
    });
  }
});

describe('S111 markup floor — 3. CONTROL: the same sub, once assigned, CAN write', () => {
  it('3a — assign the sub', async () => {
    const ins = await admin.from('project_assignments').insert({
      company_id: companyId,
      project_id: projectId,
      member_id: subMemberId,
      role_on_project: 'crew',
    });
    expect(ins.error, ins.error?.message).toBeNull();
  });

  it('3b — the estpath derivative (markup arm is the only way in) is written: 1 object', async () => {
    const der = await subC.storage
      .from(BUCKET)
      .upload(`${paths.estpath}.markup.jpg`, PNG, { contentType: 'image/jpeg', upsert: true });
    expect(der.error?.message ?? null, 'an ASSIGNED sub was refused — the probe cannot register a write').toBeNull();
    const written = await objectCount(`${paths.estpath}.markup.jpg`);
    console.log(`[S111 floor 3b] objects written after assignment: ${written} (expected 1)`);
    expect(written).toBe(1);
  });
});
