/**
 * S127 — PHOTO CLIENT-VISIBILITY PERMISSIONS [RULED Josh, 2026-10-03 10:58–11:01].
 * Migration 20262134600000. THE DATABASE HALF of the four-row matrix; the UI
 * half (which controls are DRAWN) is test/s127-photo-bulk.test.ts and the e2e.
 * Asserted SEPARATELY on purpose: a role seeing no control is not proof the
 * database refuses it (#136; the cause of the defect this fixes).
 *
 *   SINGLE share  (client_visible, one photo)  DB: Owner, Admin, PE, PM
 *   SINGLE delete (soft, one photo)            DB: Owner, Admin, PM, PE   (unchanged)
 *   BULK share    (client_visible, a set)      DB: the SAME list as single share
 *   BULK delete   (soft, a set)                DB: the SAME list as single delete
 * ⚠️ The database cannot tell one write from many — a bulk action is N row
 * writes — so the BULK rows' narrower lists (share: O/A/PE; delete: O/A) are
 * enforced by the UI gate, and that is stated, not hidden: these maps prove the
 * DB gate each bulk write actually meets.
 *
 * Every write returns NO rows (no .select()); every verdict is the SERVICE
 * ROLE's read-back. Every role present. Controls: PM may not share a non-image
 * or a contracts-category image, nor relabel a document an image and share it
 * in one write.
 *
 * Fixture: image rows on one Company A project (no storage objects needed),
 * marked by path; temporary assignments for any role lacking one, removed after.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CompanyRole } from '@framefocus/shared/types/roles';
import { forEveryRole } from '@/test-support/role-matrix';
import { admin, assertRebuildTest, sessionFor } from './live-session';

const MARK = 'S127PERM';
const PROJECT = 'eaf0e25b-d60e-49c0-89b2-5612118d94b4';
const IDENTITY: Record<CompanyRole, string> = {
  owner: 'josh+test50@worthprop.com',
  admin: 'josh+qa-admin@worthprop.com',
  project_executive: 'josh+qa-pe@worthprop.com',
  project_manager: 'josh+pm@worthprop.com',
  foreman: 'josh+qa-foreman@worthprop.com',
  crew_member: 'josh+crew@worthprop.com',
  client: 'josh+qa-client@worthprop.com',
  subcontractor: 'josh+qa-sub@worthprop.com',
};
const SHARE_DB: Record<CompanyRole, boolean> = {
  owner: true,
  admin: true,
  project_executive: true,
  project_manager: true,
  foreman: false,
  crew_member: false,
  client: false,
  subcontractor: false,
};
const DELETE_DB: Record<CompanyRole, boolean> = { ...SHARE_DB };

const session = {} as Record<CompanyRole, SupabaseClient>;
let companyId = '';
const tempAssignments: string[] = [];
const revived: { id: string; deleted_at: string | null }[] = [];
let n = 0;

async function photo(opts: { mime?: string; category?: string } = {}): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await admin.from('files').insert({
    id,
    company_id: companyId,
    project_id: PROJECT,
    category: opts.category ?? 'photos',
    file_name: `${MARK}-${n}.png`,
    file_path: `${companyId}/${PROJECT}/${MARK}-${n++}.png`,
    file_size: 68,
    mime_type: opts.mime ?? 'image/png',
  });
  if (error) throw new Error(`file: ${error.message}`);
  return id;
}

async function rows(ids: string[]) {
  const { data } = await admin.from('files').select('id, client_visible, is_deleted').in('id', ids);
  return new Map((data ?? []).map((r) => [r.id as string, r]));
}

beforeAll(async () => {
  assertRebuildTest();
  const { data: proj } = await admin
    .from('projects')
    .select('company_id')
    .eq('id', PROJECT)
    .single();
  companyId = proj!.company_id as string;
  await admin.from('files').delete().like('file_path', `%/${MARK}-%`);
  // Reach: every staff role needs to be able to SEE the project for the
  // positives to mean anything (PE: pe_on_project requires an assignment).
  for (const role of [
    'project_executive',
    'project_manager',
    'foreman',
    'crew_member',
  ] as CompanyRole[]) {
    const { data: p } = await admin
      .from('profiles')
      .select('id')
      .eq('email', IDENTITY[role])
      .single();
    const { data: m } = await admin
      .from('company_members')
      .select('id')
      .eq('profile_id', p!.id)
      .eq('is_deleted', false)
      .single();
    // A soft-deleted row still holds the unique (project, member) key: revive
    // it for the run and put it back afterwards, rather than insert.
    const { data: existing } = await admin
      .from('project_assignments')
      .select('id, is_deleted, deleted_at')
      .eq('project_id', PROJECT)
      .eq('member_id', m!.id)
      .maybeSingle();
    if (existing?.is_deleted) {
      const { error } = await admin
        .from('project_assignments')
        .update({ is_deleted: false, deleted_at: null })
        .eq('id', existing.id);
      if (error) throw new Error(`revive ${role}: ${error.message}`);
      revived.push({ id: existing.id as string, deleted_at: existing.deleted_at as string | null });
    } else if (!existing) {
      const { data: a, error } = await admin
        .from('project_assignments')
        .insert({ company_id: companyId, project_id: PROJECT, member_id: m!.id })
        .select('id')
        .single();
      if (error) throw new Error(`assign ${role}: ${error.message}`);
      tempAssignments.push(a!.id as string);
    }
  }
  for (const role of Object.keys(IDENTITY) as CompanyRole[])
    session[role] = await sessionFor(IDENTITY[role]);
}, 240_000);

afterAll(async () => {
  await admin.from('files').delete().like('file_path', `%/${MARK}-%`);
  if (tempAssignments.length)
    await admin.from('project_assignments').delete().in('id', tempAssignments);
  // Put revived rows back EXACTLY as they were (their original deleted_at).
  for (const r of revived)
    await admin
      .from('project_assignments')
      .update({ is_deleted: true, deleted_at: r.deleted_at })
      .eq('id', r.id);
  const { count } = await admin
    .from('files')
    .select('id', { count: 'exact', head: true })
    .like('file_path', `%/${MARK}-%`);
  expect(count ?? 0).toBe(0);
}, 120_000);

describe('SINGLE share — client_visible on one photo, DB gate, TOTAL map', () => {
  forEveryRole(SHARE_DB, (role, allowed) => {
    it(`${role}: ${allowed ? 'lands' : 'refused; still false'}`, async () => {
      const id = await photo();
      const { error } = await session[role]
        .from('files')
        .update({ client_visible: true })
        .eq('id', id);
      const r = (await rows([id])).get(id)!;
      console.log(
        `[${MARK}] single share ${role}: error=${error?.message ?? 'none'} visible=${r.client_visible}`
      );
      expect(r.client_visible).toBe(allowed);
    });
  });
});

describe('SINGLE delete — soft, one photo, DB gate, TOTAL map (pinned unchanged)', () => {
  forEveryRole(DELETE_DB, (role, allowed) => {
    it(`${role}: ${allowed ? 'trashed' : 'refused; still live'}`, async () => {
      const id = await photo();
      const { error } = await session[role]
        .from('files')
        .update({ is_deleted: true, deleted_at: new Date().toISOString() })
        .eq('id', id);
      const r = (await rows([id])).get(id)!;
      console.log(
        `[${MARK}] single delete ${role}: error=${error?.message ?? 'none'} deleted=${r.is_deleted}`
      );
      expect(r.is_deleted).toBe(allowed);
    });
  });
});

describe('BULK share — a set, the DB gate each write meets (UI narrows to O/A/PE)', () => {
  forEveryRole(SHARE_DB, (role, allowed) => {
    it(`${role}: ${allowed ? 'both land' : 'neither lands'}`, async () => {
      const ids = [await photo(), await photo()];
      await session[role].from('files').update({ client_visible: true }).in('id', ids);
      const r = await rows(ids);
      expect(ids.map((id) => r.get(id)!.client_visible)).toEqual([allowed, allowed]);
    });
  });
});

describe('BULK delete — a set, the DB gate each write meets (UI narrows to O/A)', () => {
  forEveryRole(DELETE_DB, (role, allowed) => {
    it(`${role}: ${allowed ? 'both trashed' : 'neither trashed'}`, async () => {
      const ids = [await photo(), await photo()];
      await session[role]
        .from('files')
        .update({ is_deleted: true, deleted_at: new Date().toISOString() })
        .in('id', ids);
      const r = await rows(ids);
      expect(ids.map((id) => r.get(id)!.is_deleted)).toEqual([allowed, allowed]);
    });
  });
});

describe('CONTROLS — the PM/PE widening is for PHOTOS only', () => {
  it('a PM may not share a non-image (a PDF in photos)', async () => {
    const id = await photo({ mime: 'application/pdf' });
    await session.project_manager.from('files').update({ client_visible: true }).eq('id', id);
    expect((await rows([id])).get(id)!.client_visible).toBe(false);
  });
  it('a PM may not share an image filed as a contract (row reach refused too)', async () => {
    const id = await photo({ category: 'contracts' });
    await session.project_manager.from('files').update({ client_visible: true }).eq('id', id);
    expect((await rows([id])).get(id)!.client_visible).toBe(false);
  });
  it('a PM may not relabel a document an image and share it in ONE write', async () => {
    const id = await photo({ mime: 'application/pdf' });
    await session.project_manager
      .from('files')
      .update({ mime_type: 'image/png', client_visible: true })
      .eq('id', id);
    const { data } = await admin
      .from('files')
      .select('client_visible, mime_type')
      .eq('id', id)
      .single();
    expect(data).toEqual({ client_visible: false, mime_type: 'application/pdf' });
  });
  it('the Owner may still share a non-image (Owner/Admin unchanged)', async () => {
    const id = await photo({ mime: 'application/pdf' });
    await session.owner.from('files').update({ client_visible: true }).eq('id', id);
    expect((await rows([id])).get(id)!.client_visible).toBe(true);
  });
});
