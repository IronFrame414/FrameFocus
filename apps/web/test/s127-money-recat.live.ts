/**
 * S127 R-9 — A PM OR PE MAY NOT MOVE A FILE OUT OF A MONEY CATEGORY.
 * [RULED Josh, 2026-10-03, ASK-R9 -> A]. Migration 20262134800000.
 *
 * The route this closes: 4d let a PM or PE share a PHOTO (an image outside
 * contracts/change_orders/invoices, judged on OLD). Moving a file OUT of a
 * money category was never blocked, and a PM or PE can reach invoice rows, so
 * an image filed under invoices could be moved to photos and then shared.
 * It must now fail AT THE MOVE.
 *
 * Every write returns NO rows (no .select()); every verdict is the SERVICE
 * ROLE's read-back. Every role present. The UI half (no surface offers the
 * move) is test/s127-money-recat.test.ts.
 *
 * Fixture: image rows on one Company A project (no storage objects), marked by
 * path; temporary assignments for any role lacking one, put back after.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CompanyRole } from '@framefocus/shared/types/roles';
import { forEveryRole } from '@/test-support/role-matrix';
import { admin, assertRebuildTest, sessionFor } from './live-session';

const MARK = 'S127RECAT';
const PROJECT = 'eaf0e25b-d60e-49c0-89b2-5612118d94b4';
const MONEY = ['contracts', 'change_orders', 'invoices'] as const;
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
/** May this role move a file OUT of a money category? (all three alike) */
const MOVE_OUT: Record<CompanyRole, boolean> = {
  owner: true,
  admin: true,
  project_executive: false,
  project_manager: false,
  foreman: false,
  crew_member: false,
  client: false,
  subcontractor: false,
};
/** Row REACH on an invoices-category file (UPDATE + SELECT policies), so a
 *  refused move by a role that HAS reach is the new arm, not RLS. The PM's
 *  fixture hangs off an invoice the PM authored (see pmInvoice). Contracts and
 *  change orders: Owner/Admin only. */
const REACH_INVOICE: Record<CompanyRole, boolean> = {
  owner: true,
  admin: true,
  project_executive: true,
  project_manager: true,
  foreman: false,
  crew_member: false,
  client: false,
  subcontractor: false,
};

const session = {} as Record<CompanyRole, SupabaseClient>;
let companyId = '';
const tempAssignments: string[] = [];
const revived: { id: string; deleted_at: string | null }[] = [];
let n = 0;
/** An invoice the PM AUTHORED. A PM reaches an invoices file only through
 *  one (files_select_non_client: invoice_id -> author_member_id = me; an UPDATE
 *  must also pass SELECT), so the PM's invoices fixtures hang off it. Without
 *  it the PM is refused by RLS and the arm is never met. */
let pmInvoice: { id: string; project_id: string } | null = null;

async function image(category: string, forRole?: CompanyRole): Promise<string> {
  const viaPmInvoice = category === 'invoices' && forRole === 'project_manager';
  const project = viaPmInvoice ? pmInvoice!.project_id : PROJECT;
  const id = crypto.randomUUID();
  const { error } = await admin.from('files').insert({
    id,
    company_id: companyId,
    project_id: project,
    category,
    ...(viaPmInvoice ? { invoice_id: pmInvoice!.id } : {}),
    file_name: `${MARK}-${n}.png`,
    file_path: `${companyId}/${project}/${MARK}-${n++}.png`,
    file_size: 68,
    mime_type: 'image/png',
  });
  if (error) throw new Error(`file: ${error.message}`);
  return id;
}

async function row(id: string) {
  const { data, error } = await admin
    .from('files')
    .select('category, client_visible, tags')
    .eq('id', id)
    .single();
  if (error || !data) throw new Error(`read ${id}: ${error?.message}`);
  return data as { category: string; client_visible: boolean; tags: string[] | null };
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
    if (role === 'project_manager') {
      // Scoped to what the fixture depends on (authored by THIS PM, live),
      // and ordered.
      const { data: inv, error } = await admin
        .from('invoices')
        .select('id, project_id')
        .eq('author_member_id', m!.id)
        .eq('company_id', companyId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(1)
        .single();
      if (error || !inv) throw new Error(`no invoice authored by the PM: ${error?.message}`);
      pmInvoice = inv as { id: string; project_id: string };
    }
  }
  for (const role of Object.keys(IDENTITY) as CompanyRole[])
    session[role] = await sessionFor(IDENTITY[role]);
}, 240_000);

afterAll(async () => {
  await admin.from('files').delete().like('file_path', `%/${MARK}-%`);
  if (tempAssignments.length)
    await admin.from('project_assignments').delete().in('id', tempAssignments);
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

for (const category of MONEY) {
  describe(`MOVE OUT of ${category} — DB gate, TOTAL map`, () => {
    forEveryRole(MOVE_OUT, (role, allowed) => {
      it(`${role}: ${allowed ? 'moves' : `refused; still ${category}`}`, async () => {
        const id = await image(category, role);
        const { error } = await session[role]
          .from('files')
          .update({ category: 'other' })
          .eq('id', id);
        const after = await row(id);
        console.log(
          `[${MARK}] out of ${category} ${role}: error=${error?.code ?? 'none'} category=${after.category}`
        );
        expect(after.category).toBe(allowed ? 'other' : category);
      });
    });
  });
}

describe('REACH CONTROL — invoices: a refused PM/PE move is the new arm, not RLS', () => {
  forEveryRole(REACH_INVOICE, (role, reach) => {
    it(`${role}: a tag write on an invoices image ${reach ? 'lands' : 'is refused'}`, async () => {
      const id = await image('invoices', role);
      await session[role]
        .from('files')
        .update({ tags: [`${MARK}-reach`] })
        .eq('id', id);
      expect((await row(id)).tags?.includes(`${MARK}-reach`) ?? false).toBe(reach);
    });
  });
  it('PM and PE are refused BY THE ARM: 42501 and its message', async () => {
    for (const role of ['project_manager', 'project_executive'] as CompanyRole[]) {
      const id = await image('invoices', role);
      const { error } = await session[role]
        .from('files')
        .update({ category: 'photos' })
        .eq('id', id);
      expect(error?.code, role).toBe('42501');
      expect(error?.message, role).toContain('Moving a file out of');
    }
  });
});

describe('THE TWO-STEP ROUTE — image under invoices: move to photos, then share', () => {
  for (const role of ['project_manager', 'project_executive'] as CompanyRole[]) {
    it(`${role}: fails AT THE MOVE; the share that follows changes nothing`, async () => {
      const id = await image('invoices', role);
      const move = await session[role].from('files').update({ category: 'photos' }).eq('id', id);
      expect(move.error?.code).toBe('42501');
      expect((await row(id)).category).toBe('invoices');
      await session[role].from('files').update({ client_visible: true }).eq('id', id);
      expect(await row(id)).toMatchObject({ category: 'invoices', client_visible: false });
    });
  }
  it('owner: both steps succeed (moved to photos, then shared)', async () => {
    const id = await image('invoices');
    const move = await session.owner.from('files').update({ category: 'photos' }).eq('id', id);
    expect(move.error).toBeNull();
    const share = await session.owner.from('files').update({ client_visible: true }).eq('id', id);
    expect(share.error).toBeNull();
    expect(await row(id)).toMatchObject({ category: 'photos', client_visible: true });
  });
});

describe('UNCHANGED — what the ruling does not touch', () => {
  it('a PM still moves a file between non-money categories (photos -> other)', async () => {
    const id = await image('photos');
    await session.project_manager.from('files').update({ category: 'other' }).eq('id', id);
    expect((await row(id)).category).toBe('other');
  });
  it('a PM still may not move a file INTO invoices (the existing arm)', async () => {
    const id = await image('photos');
    await session.project_manager.from('files').update({ category: 'invoices' }).eq('id', id);
    expect((await row(id)).category).toBe('photos');
  });
  it('the Owner still moves a file INTO a money category', async () => {
    const id = await image('photos');
    await session.owner.from('files').update({ category: 'contracts' }).eq('id', id);
    expect((await row(id)).category).toBe('contracts');
  });
  it('a PM still shares a photo (4d)', async () => {
    const id = await image('photos');
    await session.project_manager.from('files').update({ client_visible: true }).eq('id', id);
    expect((await row(id)).client_visible).toBe(true);
  });
});
