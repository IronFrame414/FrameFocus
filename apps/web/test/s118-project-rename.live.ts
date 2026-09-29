/**
 * S118 item 14 — rename a project. Migration 20262090000000.
 *
 *   RENAME   Owner/Admin only (total map) — enforce_projects_column_scope.
 *            A blank name is refused for everyone.
 *   LOG      every rename writes project_name_history (old, new, who); the
 *            log is read by Owner/Admin only and written by no client.
 *   SENT     documents keep the name they were sent under: project_name_at()
 *            and the invoice / change-order PDF data built from it. A DRAFT
 *            shows the live name.
 *
 * Refusals judged by the SERVICE ROLE; writes return no rows. Disposable
 * projects (marker `S118R`), swept before and after.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CompanyRole } from '@framefocus/shared/types/roles';
import { forEveryRole } from '@/test-support/role-matrix';
import { admin, assertRebuildTest, deleteProjects, sessionFor } from './live-session';

vi.mock('server-only', () => ({}));

const MARKER = 'S118R';
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
const ASSIGN: Partial<Record<CompanyRole, string>> = {
  project_executive: 'project_executive',
  project_manager: 'project_manager',
  foreman: 'crew',
  crew_member: 'crew',
  subcontractor: 'crew',
};

const session = {} as Record<CompanyRole, SupabaseClient>;
let companyId = '';
let contactId = '';
let seq = 0;
const member = {} as Record<CompanyRole, string>;

async function memberIdOf(email: string): Promise<string> {
  const { data: p } = await admin.from('profiles').select('id').eq('email', email).single();
  const { data: m } = await admin.from('company_members').select('id').eq('profile_id', p!.id).maybeSingle();
  return (m?.id as string) ?? '';
}

async function sweep() {
  const { data: ps } = await admin.from('projects').select('id').like('project_number', `PRJ-${MARKER}-%`);
  const ids = (ps ?? []).map((p) => p.id as string);
  if (ids.length) {
    await admin.from('project_name_history').delete().in('project_id', ids);
    await admin.from('invoices').delete().in('project_id', ids);
    await admin.from('change_orders').delete().in('project_id', ids);
    await admin.from('project_assignments').delete().in('project_id', ids);
    await deleteProjects(admin, ids);
  }
  const { data: cs } = await admin.from('contacts').select('id').eq('last_name', `${MARKER} Client`);
  const cIds = (cs ?? []).map((c) => c.id as string);
  if (cIds.length) {
    await admin.from('qb_sync_queue').delete().in('entity_id', cIds);
    await admin.from('contacts').delete().in('id', cIds);
  }
}

/** A fresh project, all staff roles assigned; the client is the project's contact. */
async function project(tag: string): Promise<string> {
  seq += 1;
  const { data, error } = await admin
    .from('projects')
    .insert({
      company_id: companyId,
      contact_id: contactId,
      project_number: `PRJ-${MARKER}-${tag}`,
      name: `${MARKER} ${tag} original`,
      status: 'active',
      project_internal_seq: seq,
    })
    .select('id')
    .single();
  if (error) throw new Error(`project ${tag}: ${error.message}`);
  for (const [role, onProject] of Object.entries(ASSIGN) as [CompanyRole, string][]) {
    const { error: aErr } = await admin.from('project_assignments').insert({
      company_id: companyId,
      project_id: data!.id,
      member_id: member[role],
      role_on_project: onProject,
    });
    if (aErr) throw new Error(`assign ${role}: ${aErr.message}`);
  }
  return data!.id as string;
}

async function nameOf(id: string): Promise<string> {
  const { data } = await admin.from('projects').select('name').eq('id', id).single();
  return data!.name as string;
}

beforeAll(async () => {
  assertRebuildTest();
  const { data: prof } = await admin.from('profiles').select('company_id').eq('email', IDENTITY.owner).single();
  companyId = prof!.company_id as string;
  await sweep();
  for (const role of Object.keys(IDENTITY) as CompanyRole[]) member[role] = await memberIdOf(IDENTITY[role]);
  const { data: c, error: cErr } = await admin
    .from('contacts')
    .insert({ company_id: companyId, first_name: 'Rename', last_name: `${MARKER} Client`, contact_type: 'client' })
    .select('id')
    .single();
  if (cErr) throw new Error(`contact: ${cErr.message}`);
  contactId = c!.id as string;
  const { data: seqRow } = await admin
    .from('projects')
    .select('project_internal_seq')
    .eq('company_id', companyId)
    .order('project_internal_seq', { ascending: false })
    .limit(1)
    .maybeSingle();
  seq = (seqRow?.project_internal_seq ?? 0) + 8200;
  for (const role of Object.keys(IDENTITY) as CompanyRole[]) session[role] = await sessionFor(IDENTITY[role]);
}, 240_000);

afterAll(async () => {
  await sweep();
  const { count } = await admin
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .like('project_number', `PRJ-${MARKER}-%`);
  expect(count ?? 0).toBe(0);
}, 180_000);

const RENAME: Record<CompanyRole, boolean> = {
  owner: true,
  admin: true,
  project_executive: false,
  project_manager: false,
  foreman: false,
  crew_member: false,
  client: false,
  subcontractor: false,
};

describe('RENAME — Owner/Admin only (total map), every one of them ON the project', () => {
  forEveryRole(RENAME, (role, may) => {
    it(`${role}: rename → ${may ? 'renamed + logged' : 'refused, unchanged, nothing logged'}`, async () => {
      const id = await project(`rn-${role}`);
      await session[role].from('projects').update({ name: `${MARKER} ${role} renamed` }).eq('id', id);
      expect(await nameOf(id), role).toBe(may ? `${MARKER} ${role} renamed` : `${MARKER} rn-${role} original`);
      const { data: log } = await admin.from('project_name_history').select('*').eq('project_id', id);
      expect(log ?? [], role).toHaveLength(may ? 1 : 0);
      if (may) {
        expect(log![0]).toMatchObject({
          old_name: `${MARKER} rn-${role} original`,
          new_name: `${MARKER} ${role} renamed`,
          company_id: companyId,
        });
        expect(log![0].renamed_by).not.toBeNull();
      }
    });
  });

  it('a blank name is refused, even for the owner', async () => {
    const id = await project('blank');
    const { error } = await session.owner.from('projects').update({ name: '   ' }).eq('id', id);
    expect(error?.message).toMatch(/needs a name/i);
    expect(await nameOf(id)).toBe(`${MARKER} blank original`);
  });

  it('a PM can still make an ORDINARY update that leaves the name alone', async () => {
    const id = await project('pm-ordinary');
    const { error } = await session.project_manager
      .from('projects')
      .update({ internal_notes: 'ordinary' })
      .eq('id', id);
    expect(error).toBeNull();
    const { data } = await admin.from('projects').select('internal_notes').eq('id', id).single();
    expect(data!.internal_notes).toBe('ordinary');
  });
});

describe('the rename LOG — read by Owner/Admin, written by no client', () => {
  it('SELECT: owner and admin see the row; PM, PE, crew and client see none', async () => {
    const id = await project('log-read');
    await session.owner.from('projects').update({ name: `${MARKER} log-read renamed` }).eq('id', id);
    const READ: Record<CompanyRole, boolean> = { ...RENAME };
    for (const role of Object.keys(READ) as CompanyRole[]) {
      const { data } = await session[role].from('project_name_history').select('id').eq('project_id', id);
      expect((data ?? []).length, role).toBe(READ[role] ? 1 : 0);
    }
  });
  it('no client can write, edit or delete a log row', async () => {
    const id = await project('log-write');
    await session.owner.from('projects').update({ name: `${MARKER} log-write renamed` }).eq('id', id);
    const { data: row } = await admin.from('project_name_history').select('id').eq('project_id', id).single();
    await session.owner
      .from('project_name_history')
      .insert({ company_id: companyId, project_id: id, old_name: 'forged', new_name: 'forged' });
    await session.owner.from('project_name_history').update({ old_name: 'forged' }).eq('id', row!.id);
    await session.owner.from('project_name_history').delete().eq('id', row!.id);
    const { data: after } = await admin.from('project_name_history').select('old_name').eq('project_id', id);
    expect(after).toHaveLength(1);
    expect(after![0].old_name).toBe(`${MARKER} log-write original`);
  });
});

describe('project_name_at — the name a document was SENT under', () => {
  it('before the rename → the old name; after → the new; a later second rename leaves both intact', async () => {
    const id = await project('at');
    const t0 = new Date(Date.now() - 60_000).toISOString();
    await session.owner.from('projects').update({ name: `${MARKER} at second` }).eq('id', id);
    await new Promise((r) => setTimeout(r, 1100));
    const t1 = new Date().toISOString();
    await new Promise((r) => setTimeout(r, 1100));
    await session.admin.from('projects').update({ name: `${MARKER} at third` }).eq('id', id);
    const at = async (ts: string) =>
      (await session.owner.rpc('project_name_at', { p_project_id: id, p_at: ts })).data;
    expect(await at(t0)).toBe(`${MARKER} at original`);
    expect(await at(t1)).toBe(`${MARKER} at second`);
    expect(await at(new Date(Date.now() + 60_000).toISOString())).toBe(`${MARKER} at third`);
  });
  it('staff NOT on the project, and a client who is not ITS client, resolve nothing', async () => {
    const id = await project('at-who');
    await admin.from('project_assignments').delete().eq('project_id', id).eq('member_id', member.crew_member);
    const ts = new Date().toISOString();
    const { data: off } = await session.crew_member.rpc('project_name_at', { p_project_id: id, p_at: ts });
    expect(off, 'crew not on the project').toBeNull();
    // The fixture contact is not linked to the QA client login: not its client.
    const { data: other } = await session.client.rpc('project_name_at', { p_project_id: id, p_at: ts });
    expect(other, 'a client of another project').toBeNull();
    const { data: on } = await session.foreman.rpc('project_name_at', { p_project_id: id, p_at: ts });
    expect(on, 'control: staff ON the project resolve it').toBe(`${MARKER} at-who original`);
  });
});

describe('SENT documents keep their name; a DRAFT shows the live one', () => {
  it('invoice: the sent one keeps the old name, the draft shows the new', async () => {
    const id = await project('inv');
    const past = new Date(Date.now() - 3_600_000).toISOString();
    const { data: sent, error: sErr } = await admin
      .from('invoices')
      .insert({ company_id: companyId, project_id: id, status: 'sent', sent_at: past, title: `${MARKER} sent` })
      .select('id')
      .single();
    if (sErr) throw new Error(sErr.message);
    const { data: draft } = await admin
      .from('invoices')
      .insert({ company_id: companyId, project_id: id, status: 'draft', title: `${MARKER} draft` })
      .select('id')
      .single();
    await session.owner.from('projects').update({ name: `${MARKER} inv renamed` }).eq('id', id);
    const { getInvoicePdfData } = await import('@/lib/invoices/invoice-data');
    const s = await getInvoicePdfData(session.owner as never, sent!.id as string);
    const d = await getInvoicePdfData(session.owner as never, draft!.id as string);
    expect(s?.project?.name).toBe(`${MARKER} inv original`);
    expect(d?.project?.name).toBe(`${MARKER} inv renamed`);
  });

  it('change order: the sent one (and its signed copy, built later with the service role) keeps the old name', async () => {
    const id = await project('co');
    const past = new Date(Date.now() - 3_600_000).toISOString();
    const { data: co, error } = await admin
      .from('change_orders')
      .insert({ company_id: companyId, project_id: id, co_number: `CO-${MARKER}`, title: `${MARKER} co`, status: 'sent', sent_at: past })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    await session.owner.from('projects').update({ name: `${MARKER} co renamed` }).eq('id', id);
    const { getChangeOrderData } = await import('@/lib/change-orders/co-data');
    const asOwner = await getChangeOrderData(session.owner as never, co!.id as string);
    const asService = await getChangeOrderData(admin as never, co!.id as string);
    expect(asOwner?.project?.name).toBe(`${MARKER} co original`);
    expect(asService?.project?.name, 'the signing page renders with the service role').toBe(`${MARKER} co original`);
  });
});
