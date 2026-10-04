/**
 * S128 Part F — PROJECT COVER PICTURES, live against rebuild-test (migration 20262139000000).
 *
 * F-1 the default is the FIRST picture added, STORED once; only a person changes it after that.
 * F-2 a client never sees a cover — not in its payload (project_covers has no client policy).
 * F-6 a TOTAL role map on choosing a cover, judged by the service role, writes returning no rows;
 *     setting a cover never changes files.client_visible, in either direction.
 *
 * Every judgment reads project_covers / files through the SERVICE ROLE. A write is an RPC that
 * returns nothing, so a refusal can only be seen in the row it did not change.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CompanyRole } from '@framefocus/shared/types/roles';
import { admin, assertRebuildTest, sessionFor } from './live-session';
import { forEveryRole } from '../test-support/role-matrix';

const MARKER = 'S128COVER';
const EMAIL: Record<CompanyRole, string> = {
  owner: 'josh+test50@worthprop.com',
  admin: 'josh+qa-admin@worthprop.com',
  project_executive: 'josh+qa-pe@worthprop.com',
  project_manager: 'josh+pm@worthprop.com',
  foreman: 'josh+qa-foreman@worthprop.com',
  crew_member: 'josh+crew@worthprop.com',
  subcontractor: 'josh+qa-sub@worthprop.com',
  client: 'josh+qa-client@worthprop.com',
};
/** F-1 [Josh]: "owner, admin, pe, pm, and foreman, can all select any image as the cover image." */
const MAY_SET: Record<CompanyRole, boolean> = {
  owner: true,
  admin: true,
  project_executive: true,
  project_manager: true,
  foreman: true,
  crew_member: false,
  subcontractor: false,
  client: false,
};
/** F-2 / ASK-F3: staff (crew included) read covers; client and subcontractor never. */
const MAY_READ: Record<CompanyRole, boolean> = {
  owner: true,
  admin: true,
  project_executive: true,
  project_manager: true,
  foreman: true,
  crew_member: true,
  subcontractor: false,
  client: false,
};

let companyId = '';
let projectId = '';
const sessions: Partial<Record<CompanyRole, SupabaseClient>> = {};
const assignmentIds: string[] = [];
let photo1 = '';
let photo2 = '';
let photo3 = '';
let receipt = '';

async function sweep(): Promise<void> {
  const { data } = await admin.from('projects').select('id').like('name', `${MARKER}%`);
  const ids = ((data ?? []) as { id: string }[]).map((p) => p.id);
  if (!ids.length) return;
  await admin.from('project_covers').delete().in('project_id', ids);
  await admin.from('files').delete().in('project_id', ids);
  await admin.from('project_assignments').delete().in('project_id', ids);
  const { error } = await admin.from('projects').delete().in('id', ids);
  if (error) throw new Error(`sweep projects: ${error.message}`);
}

async function addFile(name: string, category: string, mime: string, clientVisible = false): Promise<string> {
  const { data, error } = await admin
    .from('files')
    .insert({
      company_id: companyId,
      project_id: projectId,
      category,
      file_name: name,
      file_path: `${companyId}/${projectId}/${name}`,
      file_size: 1000,
      mime_type: mime,
      client_visible: clientVisible,
    })
    .select('id')
    .single();
  if (error) throw new Error(`file ${name}: ${error.message}`);
  return (data as { id: string }).id;
}

async function coverOf(id: string): Promise<{ rows: number; file_id: string | null }> {
  const { data, error } = await admin.from('project_covers').select('file_id').eq('project_id', id);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { file_id: string | null }[];
  return { rows: rows.length, file_id: rows[0]?.file_id ?? null };
}

beforeAll(async () => {
  assertRebuildTest();
  const { data: co } = await admin.from('companies').select('id').eq('name', 'Sabal Point Construction').single();
  companyId = (co as { id: string }).id;
  await sweep();
  const { data: seqRow } = await admin
    .from('projects')
    .select('project_internal_seq')
    .eq('company_id', companyId)
    .order('project_internal_seq', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: proj, error: pErr } = await admin
    .from('projects')
    .insert({
      company_id: companyId,
      project_number: 'PRJ-S128COVER',
      name: `${MARKER} project`,
      status: 'active',
      project_internal_seq: ((seqRow as { project_internal_seq: number } | null)?.project_internal_seq ?? 0) + 5000,
    })
    .select('id')
    .single();
  if (pErr) throw new Error(`project: ${pErr.message}`);
  projectId = (proj as { id: string }).id;

  // Assign every project-scoped role, so a refusal is the ROLE, never a missing assignment.
  for (const role of ['project_executive', 'project_manager', 'foreman', 'crew_member', 'subcontractor'] as const) {
    const { data: m } = await admin
      .from('company_members')
      .select('id, profile:profiles!inner(email)')
      .eq('company_id', companyId)
      .eq('profile.email', EMAIL[role])
      .eq('is_deleted', false)
      .order('id')
      .limit(1)
      .single();
    if (!m) throw new Error(`no member for ${role}`);
    const { data: a, error: aErr } = await admin
      .from('project_assignments')
      .insert({ company_id: companyId, project_id: projectId, member_id: (m as { id: string }).id })
      .select('id')
      .single();
    if (aErr) throw new Error(`assign ${role}: ${aErr.message}`);
    assignmentIds.push((a as { id: string }).id);
  }
  for (const role of Object.keys(EMAIL) as CompanyRole[]) sessions[role] = await sessionFor(EMAIL[role]);
});

afterAll(async () => {
  await sweep();
});

describe('F-1 — the default is the FIRST picture added, written once by the database', () => {
  it('a project with no photos has no cover row', async () => {
    expect(await coverOf(projectId)).toEqual({ rows: 0, file_id: null });
  });

  it('a non-photo file (a receipt image) does not become the cover', async () => {
    receipt = await addFile('receipt.jpg', 'receipts', 'image/jpeg');
    expect((await coverOf(projectId)).rows).toBe(0);
  });

  it('the first photo added becomes the cover — on insert, by the trigger', async () => {
    photo1 = await addFile('first.jpg', 'photos', 'image/jpeg');
    expect(await coverOf(projectId)).toEqual({ rows: 1, file_id: photo1 });
  });

  it('⚠️ a SECOND photo does not move it', async () => {
    photo2 = await addFile('second.jpg', 'daily_logs', 'image/jpeg');
    expect(await coverOf(projectId)).toEqual({ rows: 1, file_id: photo1 });
  });
});

describe('F-6 — choosing a cover: a TOTAL role map, judged by the service role', () => {
  forEveryRole(MAY_SET, (role, may) => {
    it(`${role} ${may ? 'MAY' : 'may NOT'} choose a cover`, async () => {
      // Start each role from photo1, then ask it to choose photo2.
      await admin.from('project_covers').update({ file_id: photo1 }).eq('project_id', projectId);
      expect((await coverOf(projectId)).file_id).toBe(photo1);
      const r = await sessions[role]!.rpc('set_project_cover', { p_project_id: projectId, p_file_id: photo2 });
      const after = await coverOf(projectId);
      if (may) {
        expect(r.error, `${role}: ${r.error?.message}`).toBeNull();
        expect(after).toEqual({ rows: 1, file_id: photo2 });
      } else {
        expect(r.error, `${role} was not refused`).not.toBeNull();
        expect(after, `${role} moved the cover`).toEqual({ rows: 1, file_id: photo1 });
      }
    });
  });

  it('a receipt (not a project photo) is refused even for the Owner', async () => {
    const r = await sessions.owner!.rpc('set_project_cover', { p_project_id: projectId, p_file_id: receipt });
    expect(r.error?.message ?? '').toMatch(/not a photo on this project/);
  });
});

describe('F-6 — a hand-set cover survives a third photo, and client_visible is never touched', () => {
  it('⚠️ set by hand to photo2, then a THIRD photo arrives: still photo2', async () => {
    const r = await sessions.foreman!.rpc('set_project_cover', { p_project_id: projectId, p_file_id: photo2 });
    expect(r.error).toBeNull();
    photo3 = await addFile('third.jpg', 'photos', 'image/jpeg');
    expect(await coverOf(projectId)).toEqual({ rows: 1, file_id: photo2 });
  });

  it('setting a cover leaves client_visible exactly as it was — false stays false, true stays true', async () => {
    await admin.from('files').update({ client_visible: true }).eq('id', photo3);
    const before = await admin.from('files').select('id, client_visible').in('id', [photo2, photo3]).order('id');
    await sessions.owner!.rpc('set_project_cover', { p_project_id: projectId, p_file_id: photo3 });
    await sessions.owner!.rpc('set_project_cover', { p_project_id: projectId, p_file_id: photo2 });
    const after = await admin.from('files').select('id, client_visible').in('id', [photo2, photo3]).order('id');
    expect(before.data).toHaveLength(2);
    expect(after.data).toEqual(before.data);
    const byId = new Map(((after.data ?? []) as { id: string; client_visible: boolean }[]).map((f) => [f.id, f.client_visible]));
    expect(byId.get(photo2)).toBe(false);
    expect(byId.get(photo3)).toBe(true);
  });

  it('marking a photo client-visible does not make it the cover', async () => {
    await admin.from('files').update({ client_visible: true }).eq('id', photo1);
    expect((await coverOf(projectId)).file_id).toBe(photo2);
    await admin.from('files').update({ client_visible: false }).eq('id', photo1);
  });
});

describe('F-5 — trashed and permanently deleted covers', () => {
  it('a TRASHED cover keeps its pointer (restoring brings it back); nothing is auto-picked', async () => {
    await admin.from('files').update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq('id', photo2);
    expect((await coverOf(projectId)).file_id).toBe(photo2);
    await admin.from('files').update({ is_deleted: false, deleted_at: null }).eq('id', photo2);
    expect((await coverOf(projectId)).file_id).toBe(photo2);
  });

  it('a PERMANENTLY deleted cover goes NULL, the project survives, and no later photo fills it', async () => {
    const { error } = await admin.from('files').delete().eq('id', photo2);
    expect(error).toBeNull();
    expect(await coverOf(projectId)).toEqual({ rows: 1, file_id: null });
    const { count } = await admin.from('projects').select('id', { count: 'exact', head: true }).eq('id', projectId);
    expect(count).toBe(1);
    await addFile('fourth.jpg', 'photos', 'image/jpeg');
    expect(await coverOf(projectId)).toEqual({ rows: 1, file_id: null });
  });
});

describe('F-2 — who RECEIVES a cover: the rows, read as each role (a total map)', () => {
  it('control: the cover row exists (service role), so a zero below is RLS, not an empty table', async () => {
    await sessions.owner!.rpc('set_project_cover', { p_project_id: projectId, p_file_id: photo1 });
    expect(await coverOf(projectId)).toEqual({ rows: 1, file_id: photo1 });
  });

  forEveryRole(MAY_READ, (role, may) => {
    it(`${role} ${may ? 'reads' : 'receives NO'} cover row`, async () => {
      const { data, error } = await sessions[role]!.from('project_covers').select('project_id, file_id').eq('project_id', projectId);
      expect(error).toBeNull();
      expect((data ?? []).length).toBe(may ? 1 : 0);
    });
  });
});
