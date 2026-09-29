/**
 * S119 ITEM A-2 — `selection_option_images()` returns only the selection's own photos.
 *
 * Migration: `20262076000000_s119_selection_images_scope.sql`. Finding: S118
 * item 16 audit. The S118 report's "fixed inside item 16's migration" was
 * checked by object on production and was FALSE (md5 ea83f07b… = the
 * 20261028000000 body).
 *
 * The function is SECURITY DEFINER and `signSelectionOptionImages()` signs every
 * path it returns with the SERVICE ROLE, into the client portal and the emailed
 * spec sheet. The pointer `selection_options.image_file_id` is written by staff
 * and nothing checks it. So a pointer at another tenant's file was a
 * cross-tenant read through an external surface — the bid-token class.
 *
 * One selection, six options, each pointing at a different file. Exactly ONE is
 * legitimate. The pointers are written with the service role: WHO writes the
 * pointer is not what this tests (staff may write it — that is the premise);
 * what the definer READ returns for it is.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';
import { signSelectionOptionImages } from '@/lib/services/selections';

const MARKER = 'S119A2';
const PROJECT = '4a4f8567-67f8-4394-baae-181229974bd9'; // QA A — isolation fixture
const OWNER = 'josh+test50@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const LINKED = 'josh+qa-client-linked@worthprop.com';

type Kind = 'good' | 'otherCompany' | 'otherProject' | 'wrongCategory' | 'foreignPath' | 'thumbOtherCompany';
const KINDS: Kind[] = ['good', 'otherCompany', 'otherProject', 'wrongCategory', 'foreignPath', 'thumbOtherCompany'];

let companyId = '';
let otherProjectId = '';
let otherCompanyId = '';
let otherCompanyProjectId = '';
let wrongCategory = '';
let selId = '';
const fileIds: Partial<Record<Kind, string>> = {};
const optIds: Partial<Record<Kind, string>> = {};
const objects: string[] = [];
const S: Partial<Record<'owner' | 'pm' | 'linked', SupabaseClient>> = {};

const must = (l: string, e: { message: string } | null) => {
  if (e) throw new Error(`${l}: ${e.message}`);
};

async function sweep(): Promise<void> {
  const { data: sels } = await admin.from('selections').select('id').like('name', `${MARKER}%`);
  const ids = (sels ?? []).map((s) => (s as { id: string }).id);
  if (ids.length) {
    await admin.from('selection_options').delete().in('selection_id', ids);
    await admin.from('selections').delete().in('id', ids);
  }
  const { data: fs } = await admin.from('files').select('id, file_path').like('file_name', `${MARKER}%`);
  for (const f of (fs ?? []) as Array<{ id: string; file_path: string }>) {
    await admin.from('files').delete().eq('id', f.id);
  }
  if (objects.length) await admin.storage.from('project-files').remove(objects);
}

async function file(kind: Kind, row: { company_id: string; project_id: string; category: string; file_path: string }) {
  const { data, error } = await admin
    .from('files')
    .insert({ ...row, file_name: `${MARKER}-${kind}.jpg`, file_size: 4, mime_type: 'image/jpeg', client_visible: false, created_by: null })
    .select('id')
    .single();
  must(`file ${kind}`, error);
  fileIds[kind] = (data as { id: string }).id;
}

beforeAll(async () => {
  assertRebuildTest();
  await sweep();
  const { data: co } = await admin.from('companies').select('id').eq('name', 'Sabal Point Construction').single();
  companyId = (co as { id: string }).id;

  // Fixtures picked by stable order, scoped to what the probe needs (a
  // different project of the SAME company; any project of ANOTHER company).
  const { data: op } = await admin
    .from('projects').select('id').eq('company_id', companyId).neq('id', PROJECT).order('id').limit(1).single();
  otherProjectId = (op as { id: string }).id;
  const { data: oc } = await admin
    .from('projects').select('id, company_id').neq('company_id', companyId).order('id').limit(1).single();
  otherCompanyId = (oc as { company_id: string }).company_id;
  otherCompanyProjectId = (oc as { id: string }).id;
  const { data: cat } = await admin
    .from('file_categories').select('key').eq('company_id', companyId).neq('key', 'photos').order('key').limit(1).single();
  wrongCategory = (cat as { key: string }).key;

  // The legitimate photo is a REAL object, so the positive signs end to end.
  const goodPath = `${companyId}/${PROJECT}/${MARKER}-good.jpg`;
  must('storage', (await admin.storage.from('project-files').upload(goodPath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]), { contentType: 'image/jpeg', upsert: true })).error);
  objects.push(goodPath);
  // …and so is ANOTHER TENANT's file, so the signer probe below can fire: without
  // a real object there, a pre-fix run signs nothing foreign and passes vacuously
  // (found on the first pre-fix run: "signed options: 1").
  const foreignObject = `${otherCompanyId}/${otherCompanyProjectId}/${MARKER}-oc.jpg`;
  must('storage foreign', (await admin.storage.from('project-files').upload(foreignObject, Buffer.from([0xff, 0xd8, 0xff, 0xd9]), { contentType: 'image/jpeg', upsert: true })).error);
  objects.push(foreignObject);

  await file('good', { company_id: companyId, project_id: PROJECT, category: 'photos', file_path: goodPath });
  await file('otherCompany', { company_id: otherCompanyId, project_id: otherCompanyProjectId, category: 'photos', file_path: `${otherCompanyId}/${otherCompanyProjectId}/${MARKER}-oc.jpg` });
  await file('otherProject', { company_id: companyId, project_id: otherProjectId, category: 'photos', file_path: `${companyId}/${otherProjectId}/${MARKER}-op.jpg` });
  await file('wrongCategory', { company_id: companyId, project_id: PROJECT, category: wrongCategory, file_path: `${companyId}/${PROJECT}/${MARKER}-wc.jpg` });
  await file('foreignPath', { company_id: companyId, project_id: PROJECT, category: 'photos', file_path: `${otherCompanyId}/${otherCompanyProjectId}/${MARKER}-fp.jpg` });
  await file('thumbOtherCompany', { company_id: otherCompanyId, project_id: otherCompanyProjectId, category: 'photos', file_path: `${otherCompanyId}/${otherCompanyProjectId}/${MARKER}-th.jpg` });

  // Offered (not draft), so the client arm admits the selection itself.
  const { data: s, error: sErr } = await admin
    .from('selections')
    .insert({ company_id: companyId, project_id: PROJECT, name: `${MARKER} scope`, status: 'in_discussion' })
    .select('id')
    .single();
  must('selection', sErr);
  selId = (s as { id: string }).id;
  for (const k of KINDS) {
    const pointer = k === 'thumbOtherCompany' ? { link_thumbnail_file_id: fileIds[k] } : { image_file_id: fileIds[k] };
    const { data: o, error } = await admin
      .from('selection_options')
      .insert({ company_id: companyId, selection_id: selId, name: `${MARKER} ${k}`, is_chosen: false, ...pointer })
      .select('id')
      .single();
    must(`option ${k}`, error);
    optIds[k] = (o as { id: string }).id;
  }

  S.owner = await sessionFor(OWNER);
  S.pm = await sessionFor(PM);
  S.linked = await sessionFor(LINKED);
}, 240_000);

afterAll(async () => {
  await sweep();
}, 120_000);

async function returned(who: 'owner' | 'pm' | 'linked') {
  const { data, error } = await S[who]!.rpc('selection_option_images', { p_selection_id: selId });
  must(`rpc ${who}`, error);
  const rows = (data ?? []) as Array<{ option_id: string; file_id: string; kind: string }>;
  return KINDS.filter((k) => rows.some((r) => r.file_id === fileIds[k]));
}

describe('A-2 — the definer read returns ONLY the selection\'s own project photo', () => {
  it('fixture: six options on one selection, every pointer set (service-role count)', async () => {
    const { count } = await admin
      .from('selection_options').select('id', { count: 'exact', head: true }).eq('selection_id', selId);
    expect(count).toBe(6);
    expect(otherCompanyId).not.toBe(companyId);
    expect(otherProjectId).not.toBe(PROJECT);
  });

  for (const who of ['owner', 'pm', 'linked'] as const) {
    it(`${who}: exactly the legitimate photo comes back — none of the five foreign pointers`, async () => {
      const got = await returned(who);
      console.log(`[S119 A-2] ${who}: returned ${JSON.stringify(got)}`);
      expect(got, `${who} got nothing — the probe cannot tell a closed hole from a dead read`).toContain('good');
      expect(got, 'a foreign file was returned for the service role to sign').toEqual(['good']);
    });
  }

  it('the portal signer signs the legitimate photo and nothing else', async () => {
    const map = await signSelectionOptionImages(selId, S.linked!);
    const signedOptions = Object.keys(map);
    console.log(`[S119 A-2] signed options: ${signedOptions.length}`);
    expect(map[optIds.good!]?.image).toMatch(/^https?:\/\//);
    expect(signedOptions).toEqual([optIds.good]);
  });
});
