import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor, sweepProjectsNamed } from './live-session';

// ============================================================================
// S111 Part Two — FILL-13.1 / 13.2, the conversion half of RULED Q14, the
// freeze finding, and the approved markup ride-along. rebuild-test only.
// ============================================================================
// ONE conversion covers both reported surfaces: a site visit IS an estimate, and
// site-visit photos and estimate attachments share one table, one upload route
// and one RPC (FILL-9.1). The fixture carries BOTH kinds, plus a PDF control:
//
//   capture   image, site_visit_capture = true, category 'other'  ← the pre-S111
//             write path; must arrive as 'photos'. Created BEFORE acceptance,
//             so the S110 A freeze covers it — this is the row whose re-point
//             the freeze used to refuse.
//   tabimage  image, category 'photos'   ← the S111 write path; stays 'photos'.
//   pdf       application/pdf, 'other'   ← CONTROL: only images reclassify.
//
// ⚠️ ROW COUNTS ARE STATED, NOT IMPLIED. A conversion test that passes with zero
// attached images is a failure (S110 shipped the reverse: a test that locked in
// the broken behaviour). Every "reads N" below is printed and asserted exactly.
//
// BEFORE the fix (migrations 20261770000000 + 20261780000000 not applied) this
// file is expected to fail at 2a with the freeze exception, and at 4a with a
// storage refusal. That run is the "before" measurement; see the Part Two report.
// ============================================================================

const MARKER = 'S111PHOTO';
const OWNER = 'josh+test50@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const CREW = 'josh+crew@worthprop.com';
const BUCKET = 'project-files';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAHElEQVQoz2P8z8Dwn4GKgIlqJo0aOGrgqIHDwEAAaSgDBaMLcOgAAAAASUVORK5CYII=',
  'base64'
);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

let ownerC: SupabaseClient;
let pmC: SupabaseClient;
let crewC: SupabaseClient;
let companyId = '';
let contactId = '';
let estimateId = '';
let projectId = '';
const fileIds: Record<'capture' | 'tabimage' | 'pdf', string> = { capture: '', tabimage: '', pdf: '' };
const paths: Record<'capture' | 'tabimage' | 'pdf', string> = { capture: '', tabimage: '', pdf: '' };

async function sweep() {
  const { data: files } = await admin.from('files').select('id, file_path').like('file_name', `${MARKER}%`);
  const rows = (files ?? []) as { id: string; file_path: string }[];
  if (rows.length) {
    await admin.storage
      .from(BUCKET)
      .remove(rows.flatMap((r) => [r.file_path, `${r.file_path}.markup.jpg`]));
    await admin.from('files').delete().in('id', rows.map((r) => r.id));
  }
  // Detach the estimate FIRST (as s170 does): deleteProjects() purges a
  // project's `estimates` children, and the converted estimate is also the
  // project's source_estimate_id — deleting it before the project violates
  // projects_source_estimate_id_fkey.
  const { data: ests } = await admin.from('estimates').select('id').like('name', `${MARKER}%`);
  const ids = ((ests ?? []) as { id: string }[]).map((e) => e.id);
  if (ids.length) await admin.from('estimates').update({ project_id: null }).in('id', ids);
  await sweepProjectsNamed(MARKER);
  if (ids.length) {
    const del = await admin.from('estimates').delete().in('id', ids);
    if (del.error) throw new Error(`S111 sweep, estimates: ${del.error.message}`);
  }
}

async function seedFile(
  key: 'capture' | 'tabimage' | 'pdf',
  opts: { mime: string; bytes: Buffer; category: string; capture: boolean }
) {
  const id = crypto.randomUUID();
  const ext = opts.mime === 'application/pdf' ? 'pdf' : 'png';
  const name = `${MARKER}-${key}.${ext}`;
  // The estimate-files route's own path convention (route.ts:158).
  const path = `${companyId}/estimates/${estimateId}/${id}-${name}`;
  const up = await admin.storage.from(BUCKET).upload(path, opts.bytes, { contentType: opts.mime });
  expect(up.error, up.error?.message).toBeNull();
  const ins = await admin
    .from('files')
    .insert({
      id,
      company_id: companyId,
      project_id: null,
      estimate_id: estimateId,
      category: opts.category,
      site_visit_capture: opts.capture,
      file_name: name,
      file_path: path,
      file_size: opts.bytes.length,
      mime_type: opts.mime,
    })
    .select('id')
    .single();
  expect(ins.error, ins.error?.message).toBeNull();
  fileIds[key] = id;
  paths[key] = path;
}

beforeAll(async () => {
  assertRebuildTest();
  await sweep();
  [ownerC, pmC, crewC] = await Promise.all([sessionFor(OWNER), sessionFor(PM), sessionFor(CREW)]);
  const { data: p } = await admin
    .from('profiles')
    .select('company_id')
    .eq('email', OWNER)
    .eq('is_deleted', false)
    .single();
  companyId = (p as { company_id: string }).company_id;
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
  contactId = (c as { id: string }).id;
}, 120_000);

afterAll(async () => {
  await sweep();
}, 120_000);

describe('S111 — 1. a site visit carrying images, accepted (so its captures are frozen)', () => {
  it('1a — owner records a visit, captures files, promotes it', async () => {
    const { data, error } = await ownerC.rpc('create_site_visit', {
      p_title: `${MARKER} kitchen`,
      p_contact_id: contactId,
    });
    expect(error, error?.message).toBeNull();
    estimateId = data as string;

    await seedFile('capture', { mime: 'image/png', bytes: PNG, category: 'other', capture: true });
    await seedFile('tabimage', { mime: 'image/png', bytes: PNG, category: 'photos', capture: false });
    await seedFile('pdf', { mime: 'application/pdf', bytes: PDF, category: 'other', capture: false });

    const promoted = await ownerC.rpc('promote_site_visit', { p_estimate_id: estimateId });
    expect(promoted.error, promoted.error?.message).toBeNull();
  });

  it('1b — accepted: frozen_at is stamped, and the capture is covered by it', async () => {
    const up = await admin.from('estimates').update({ status: 'accepted' }).eq('id', estimateId);
    expect(up.error, up.error?.message).toBeNull();
    const { data: sv } = await admin.from('site_visits').select('frozen_at').eq('estimate_id', estimateId).single();
    const frozenAt = (sv as { frozen_at: string | null }).frozen_at;
    expect(frozenAt, 'acceptance did not stamp frozen_at — the fixture would not exercise the freeze').not.toBeNull();
    const { data: f } = await admin.from('files').select('created_at').eq('id', fileIds.capture).single();
    expect(new Date((f as { created_at: string }).created_at) <= new Date(frozenAt!)).toBe(true);

    // CONTROL — the freeze is live on this row: a direct re-point is refused.
    const direct = await admin.from('files').update({ estimate_id: null }).eq('id', fileIds.capture);
    expect(direct.error?.message ?? '', 'the freeze did not fire — the fixture proves nothing').toMatch(
      /frozen/i
    );
  });
});

describe('S111 — 2. conversion carries the images to Photos', () => {
  it('2a — the owner converts the accepted estimate (the freeze admits the re-point)', async () => {
    const { data, error } = await ownerC.rpc('convert_estimate_to_project', { p_estimate_id: estimateId });
    expect(error, error?.message).toBeNull();
    projectId = data as string;
    expect(projectId).toMatch(/^[0-9a-f-]{36}$/);
    // Name the project with the marker so a crashed run is swept.
    await admin.from('projects').update({ name: `${MARKER} kitchen` }).eq('id', projectId);
  });

  it('2b — every file moved to the project; images are photos, the PDF is not', async () => {
    const { data } = await admin
      .from('files')
      .select('id, project_id, estimate_id, category, file_path')
      .in('id', Object.values(fileIds));
    const rows = (data ?? []) as { id: string; project_id: string; estimate_id: string | null; category: string; file_path: string }[];
    console.log(`[S111 2b] rows moved: ${rows.length} (expected 3)`);
    expect(rows).toHaveLength(3);
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const key of ['capture', 'tabimage', 'pdf'] as const) {
      expect(byId.get(fileIds[key])).toMatchObject({ project_id: projectId, estimate_id: null });
      // Ruling: move no files — the storage object keeps its path.
      expect(byId.get(fileIds[key])!.file_path).toBe(paths[key]);
    }
    expect(byId.get(fileIds.capture)!.category, 'the frozen site-visit capture').toBe('photos');
    expect(byId.get(fileIds.tabimage)!.category).toBe('photos');
    expect(byId.get(fileIds.pdf)!.category, 'CONTROL — a PDF must not become a photo').toBe('other');
  });

  it("2c — the PHOTOS query, on the owner's session, returns both images (count stated)", async () => {
    // The same predicate getProjectPhotos() → getFiles({ project_id, category: 'photos' }) runs.
    const { data, error } = await ownerC
      .from('files')
      .select('id')
      .eq('project_id', projectId)
      .eq('category', 'photos')
      .eq('is_deleted', false);
    expect(error, error?.message).toBeNull();
    const ids = ((data ?? []) as { id: string }[]).map((r) => r.id).sort();
    console.log(`[S111 2c] Photos query rows: ${ids.length} (expected 2)`);
    expect(ids).toEqual([fileIds.capture, fileIds.tabimage].sort());
  });
});

describe('S111 — 4. markup on a converted estimate photo (ride-along, approved)', () => {
  it('4-setup — the PM is assigned to the new project; the crew member is not', async () => {
    const { data: m } = await admin
      .from('company_members')
      .select('id, profiles!inner(email)')
      .eq('profiles.email', PM)
      .eq('is_deleted', false)
      .single();
    const memberId = (m as { id: string }).id;
    const ins = await admin
      .from('project_assignments')
      .insert({ company_id: companyId, project_id: projectId, member_id: memberId, role_on_project: 'pm' });
    expect(ins.error, ins.error?.message).toBeNull();
  });

  it('4a — the PM writes markup_data AND the flattened derivative under the estimates/ path', async () => {
    const md = await pmC
      .from('files')
      .update({ markup_data: { version: 1, shapes: [] } })
      .eq('id', fileIds.capture)
      .select('id');
    expect(md.error, md.error?.message).toBeNull();
    expect(md.data ?? [], 'markup_data update affected 0 rows').toHaveLength(1);

    // What saveMarkup() does next: upsert `{file_path}.markup.jpg`. The FIRST
    // write is an INSERT on storage.objects — the one the policy refused.
    const der = await pmC.storage
      .from(BUCKET)
      .upload(`${paths.capture}.markup.jpg`, PNG, { contentType: 'image/jpeg', upsert: true });
    expect(der.error?.message ?? null, 'derivative write refused for an assigned PM').toBeNull();
  });

  it('4b — CONTROL: a crew member NOT on the project cannot write a derivative beside it', async () => {
    const der = await crewC.storage
      .from(BUCKET)
      .upload(`${paths.tabimage}.markup.jpg`, PNG, { contentType: 'image/jpeg', upsert: true });
    expect(der.error, 'an unassigned crew member wrote a markup derivative').not.toBeNull();
  });
});
