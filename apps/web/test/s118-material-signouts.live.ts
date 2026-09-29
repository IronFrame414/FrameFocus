/**
 * S118 item 11 — the material sign-out. Migration 20262080000000.
 *
 *   CREATE      the six staff roles, on a project they can view, as themselves,
 *               pending_receipt only. Client and subcontractor: nothing.
 *   RECEIPT     record_material_signout_receipt — ⚠️ refused with no release
 *               photo; stores the paper form's acknowledgement VERBATIM.
 *   CLOSE       close_material_signout — Owner/Admin/PM/PE (total map).
 *   NO UPDATE / NO DELETE policy on the record: a signed record is not edited
 *               by a client write.
 *   PHOTOS      two sets; the stage follows the state (release while pending,
 *               return while open); the file must be this project's own
 *               `material_signout` file; never in the Photos view.
 *
 * Every refusal is judged by the SERVICE ROLE; writes return no rows.
 * Disposable projects (marker `S118M`), swept before and after.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CompanyRole } from '@framefocus/shared/types/roles';
import { forEveryRole } from '@/test-support/role-matrix';
import { admin, assertRebuildTest, deleteProjects, sessionFor } from './live-session';
import { RECEIPT_ACKNOWLEDGEMENT } from '@/lib/material-signouts/signout';

// files.ts imports the cookie-bound server client; only its FILTER CONSTANT is used.
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => ({}) }));
import { PHOTO_VIEW_FILTER } from '@/lib/services/files';

const MARKER = 'S118M';
const SIG = 'data:image/png;base64,iVBORw0KGgo=';
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
let projectId = '';
let offProjectId = '';
const member = {} as Record<CompanyRole, string>;
const fileIds: string[] = [];

async function memberIdOf(email: string): Promise<string> {
  const { data: p } = await admin.from('profiles').select('id').eq('email', email).single();
  const { data: m } = await admin
    .from('company_members')
    .select('id')
    .eq('profile_id', p!.id)
    .maybeSingle();
  return (m?.id as string) ?? '';
}

async function sweep() {
  const { data: ps } = await admin.from('projects').select('id').like('name', `${MARKER} %`);
  const ids = (ps ?? []).map((p) => p.id as string);
  if (ids.length) {
    const { data: so } = await admin.from('material_signouts').select('id').in('project_id', ids);
    const soIds = (so ?? []).map((s) => s.id as string);
    if (soIds.length) {
      await admin.from('material_signout_photos').delete().in('signout_id', soIds);
      await admin.from('material_signouts').delete().in('id', soIds);
    }
    await admin.from('files').delete().in('project_id', ids);
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

async function makeProject(tag: string, seq: number, assign: boolean): Promise<string> {
  const { data, error } = await admin
    .from('projects')
    .insert({
      company_id: companyId,
      contact_id: contactId,
      project_number: `PRJ-${MARKER}-${tag}`,
      name: `${MARKER} ${tag} project`,
      status: 'active',
      project_internal_seq: seq,
    })
    .select('id')
    .single();
  if (error) throw new Error(`project ${tag}: ${error.message}`);
  if (assign) {
    for (const [role, onProject] of Object.entries(ASSIGN) as [CompanyRole, string][]) {
      const { error: aErr } = await admin.from('project_assignments').insert({
        company_id: companyId,
        project_id: data!.id,
        member_id: member[role],
        role_on_project: onProject,
      });
      if (aErr) throw new Error(`assign ${role}: ${aErr.message}`);
    }
  }
  return data!.id as string;
}

function fields(tag: string, project = projectId) {
  return {
    project_id: project,
    job_name: `${MARKER} job`,
    signout_date: '2026-09-29',
    material_type: `${MARKER} ${tag}`,
    quantity: '12 boxes',
    condition_at_release: 'undamaged',
    expected_return_date: '2026-10-06',
    receiver_company: 'Acme Tile',
    released_signer_name: 'Tester',
    released_signature_type: 'type',
    released_signature_data: SIG,
  };
}

/** A pending record created by the CREW member (service role), for one test. */
async function pending(tag: string, project = projectId): Promise<string> {
  const { data, error } = await admin
    .from('material_signouts')
    .insert({ ...fields(tag, project), company_id: companyId, released_by_member_id: member.crew_member })
    .select('id')
    .single();
  if (error) throw new Error(`signout: ${error.message}`);
  return data!.id as string;
}

/** A project file in `category` (service role). No storage object: RLS reads the row. */
async function file(tag: string, category = 'material_signout', project = projectId): Promise<string> {
  const { data, error } = await admin
    .from('files')
    .insert({
      company_id: companyId,
      project_id: project,
      category,
      file_name: `${MARKER}-${tag}.jpg`,
      file_path: `${companyId}/${project}/${MARKER}-${tag}-${Date.now()}.jpg`,
      file_size: 1,
      mime_type: 'image/jpeg',
    })
    .select('id')
    .single();
  if (error) throw new Error(`file: ${error.message}`);
  fileIds.push(data!.id as string);
  return data!.id as string;
}

async function photo(signoutId: string, stage: 'release' | 'return'): Promise<void> {
  const fid = await file(`${stage}-${signoutId.slice(0, 6)}-${fileIds.length}`);
  const { error } = await admin.from('material_signout_photos').insert({
    company_id: companyId,
    signout_id: signoutId,
    file_id: fid,
    stage,
    taken_by_member_id: member.crew_member,
  });
  if (error) throw new Error(`photo: ${error.message}`);
}

/** An OPEN record: pending + one release photo + the receipt (service role). */
async function open(tag: string): Promise<string> {
  const id = await pending(tag);
  await photo(id, 'release');
  const { error } = await admin
    .from('material_signouts')
    .update({
      status: 'open',
      receiver_signer_name: 'Driver',
      receiver_signature_type: 'type',
      receiver_signature_data: SIG,
      receiver_signed_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw new Error(`open: ${error.message}`);
  return id;
}

async function row(id: string) {
  const { data } = await admin.from('material_signouts').select('*').eq('id', id).single();
  return data as Record<string, unknown>;
}
async function countOf(table: string, col: string, val: string): Promise<number> {
  const { count } = await admin.from(table).select('id', { count: 'exact', head: true }).eq(col, val);
  return count ?? -1;
}

function receipt(role: CompanyRole, id: string) {
  return session[role].rpc('record_material_signout_receipt', {
    p_signout_id: id,
    p_signer_name: 'Pat Driver',
    p_title: 'Driver / Acme Tile',
    p_signature_type: 'draw',
    p_signature_data: SIG,
    p_ip: '',
    p_user_agent: 'vitest',
  });
}
function close(role: CompanyRole, id: string, condition = 'same_as_released') {
  return session[role].rpc('close_material_signout', {
    p_signout_id: id,
    p_condition_at_return: condition,
    p_returned_date: '2026-10-05',
    p_returned_time: '14:30',
    p_return_notes: '',
    p_signer_name: 'Office',
    p_signature_type: 'type',
    p_signature_data: SIG,
  });
}

beforeAll(async () => {
  assertRebuildTest();
  const { data: prof } = await admin.from('profiles').select('company_id').eq('email', IDENTITY.owner).single();
  companyId = prof!.company_id as string;
  await sweep();
  for (const role of Object.keys(IDENTITY) as CompanyRole[]) member[role] = await memberIdOf(IDENTITY[role]);
  const { data: c, error: cErr } = await admin
    .from('contacts')
    .insert({ company_id: companyId, first_name: 'Signout', last_name: `${MARKER} Client`, contact_type: 'client' })
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
  const base = (seqRow?.project_internal_seq ?? 0) + 8100;
  projectId = await makeProject('on', base, true);
  offProjectId = await makeProject('off', base + 1, false);
  for (const role of Object.keys(IDENTITY) as CompanyRole[]) session[role] = await sessionFor(IDENTITY[role]);
}, 240_000);

afterAll(async () => {
  await sweep();
  const { count } = await admin
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .like('name', `${MARKER} %`);
  expect(count ?? 0).toBe(0);
  const { count: so } = await admin
    .from('material_signouts')
    .select('id', { count: 'exact', head: true })
    .like('material_type', `${MARKER} %`);
  expect(so ?? 0).toBe(0);
}, 180_000);

describe('the category exists for every company (backfill + seed)', () => {
  it('file_categories has material_signout once per company', async () => {
    const { count: companies } = await admin.from('companies').select('id', { count: 'exact', head: true });
    const { count: rows } = await admin
      .from('file_categories')
      .select('id', { count: 'exact', head: true })
      .eq('key', 'material_signout');
    expect(companies).toBeGreaterThan(0);
    expect(rows).toBe(companies);
  });
});

const CREATE: Record<CompanyRole, boolean> = {
  owner: true,
  admin: true,
  project_executive: true,
  project_manager: true,
  foreman: true,
  crew_member: true,
  client: false,
  subcontractor: false,
};

describe('CREATE — the six staff roles on their project, as themselves (total map)', () => {
  forEveryRole(CREATE, (role, may) => {
    it(`${role}: insert on the assigned project → ${may ? 'saved' : 'refused'}`, async () => {
      const tag = `create-${role}`;
      await session[role]
        .from('material_signouts')
        .insert({ ...fields(tag), released_by_member_id: member[role] });
      const n = await countOf('material_signouts', 'material_type', `${MARKER} ${tag}`);
      expect(n, role).toBe(may ? 1 : 0);
    });
  });

  it('foreman on a project NOT assigned → refused', async () => {
    await session.foreman
      .from('material_signouts')
      .insert({ ...fields('off-foreman', offProjectId), released_by_member_id: member.foreman });
    expect(await countOf('material_signouts', 'material_type', `${MARKER} off-foreman`)).toBe(0);
  });

  it('released AS SOMEONE ELSE → refused', async () => {
    await session.crew_member
      .from('material_signouts')
      .insert({ ...fields('impersonate'), released_by_member_id: member.foreman });
    expect(await countOf('material_signouts', 'material_type', `${MARKER} impersonate`)).toBe(0);
  });

  it('created already OPEN (skipping the receiver) → refused', async () => {
    await session.owner.from('material_signouts').insert({
      ...fields('born-open'),
      released_by_member_id: member.owner,
      status: 'open',
      receiver_signer_name: 'x',
      receiver_signature_type: 'type',
      receiver_signature_data: SIG,
      receiver_signed_at: new Date().toISOString(),
    });
    expect(await countOf('material_signouts', 'material_type', `${MARKER} born-open`)).toBe(0);
  });
});

describe('no UPDATE and no DELETE path on the record', () => {
  it('the owner cannot edit a signed record directly (0 rows change)', async () => {
    const id = await open('no-update');
    await session.owner.from('material_signouts').update({ quantity: '999', status: 'returned' }).eq('id', id);
    const r = await row(id);
    expect(r.quantity).toBe('12 boxes');
    expect(r.status).toBe('open');
  });
  it('the owner cannot delete one (the row stays)', async () => {
    const id = await pending('no-delete');
    await session.owner.from('material_signouts').delete().eq('id', id);
    expect(await countOf('material_signouts', 'id', id)).toBe(1);
  });
});

describe('RECEIPT — ⚠️ no release photo, no signature', () => {
  it('refused while the record has no release photo; the record stays pending', async () => {
    const id = await pending('no-photo');
    const { error } = await receipt('crew_member', id);
    expect(error?.message).toMatch(/at least one photo/i);
    expect((await row(id)).status).toBe('pending_receipt');
  });

  it('a RETURN-stage photo does not count as a release photo', async () => {
    const id = await pending('return-only');
    await photo(id, 'return'); // shape the policy refuses; service role forces it
    const { error } = await receipt('crew_member', id);
    expect(error, 'the function counts release photos only').not.toBeNull();
    expect((await row(id)).status).toBe('pending_receipt');
  });

  it('with a release photo → open; the acknowledgement is stored VERBATIM (the same text the UI shows)', async () => {
    const id = await pending('receipt-ok');
    await photo(id, 'release');
    const { error } = await receipt('crew_member', id);
    expect(error).toBeNull();
    const r = await row(id);
    expect(r.status).toBe('open');
    expect(r.receiver_signer_name).toBe('Pat Driver');
    expect(r.receiver_consent_text).toBe(RECEIPT_ACKNOWLEDGEMENT);
    expect(r.receiver_signer_ip, "'' is stored as NULL").toBeNull();
    expect(r.receiver_signer_user_agent).toBe('vitest');
  });

  it('a second receipt on an open record is refused', async () => {
    const id = await open('receipt-twice');
    const { error } = await receipt('owner', id);
    expect(error?.message).toMatch(/already been signed/i);
  });

  it('a client and a subcontractor cannot take a receipt', async () => {
    for (const role of ['client', 'subcontractor'] as const) {
      const id = await pending(`receipt-${role}`);
      await photo(id, 'release');
      await receipt(role, id);
      expect((await row(id)).status, role).toBe('pending_receipt');
    }
  });
});

const CLOSE: Record<CompanyRole, boolean> = {
  owner: true,
  admin: true,
  project_executive: true,
  project_manager: true,
  foreman: false,
  crew_member: false,
  client: false,
  subcontractor: false,
};

describe('CLOSE — Owner/Admin/PM/PE only (total map), through the function', () => {
  forEveryRole(CLOSE, (role, may) => {
    it(`${role}: close_material_signout → ${may ? 'returned' : 'refused, still open'}`, async () => {
      const id = await open(`close-${role}`);
      await close(role, id);
      const r = await row(id);
      expect(r.status, role).toBe(may ? 'returned' : 'open');
      if (may) expect(r.returned_to_member_id).toBe(member[role]);
    });
  });

  it('the condition decides the closed state', async () => {
    const a = await open('close-damage');
    const b = await open('close-missing');
    await close('owner', a, 'damage_occurred');
    await close('owner', b, 'not_returned');
    expect((await row(a)).status).toBe('damaged_on_return');
    expect((await row(b)).status).toBe('not_returned');
  });

  it('a PENDING record cannot be closed, and a closed one cannot be closed again', async () => {
    const p = await pending('close-pending');
    const { error: e1 } = await close('owner', p);
    expect(e1?.message).toMatch(/only an open/i);
    const o = await open('close-twice');
    await close('owner', o);
    const { error: e2 } = await close('owner', o, 'not_returned');
    expect(e2?.message).toMatch(/only an open/i);
    expect((await row(o)).status).toBe('returned');
  });
});

describe('PHOTOS — two sets; the stage follows the state', () => {
  async function link(role: CompanyRole, signoutId: string, stage: 'release' | 'return', fid: string) {
    await session[role]
      .from('material_signout_photos')
      .insert({ signout_id: signoutId, file_id: fid, stage, taken_by_member_id: member[role] });
    return countOf('material_signout_photos', 'file_id', fid);
  }

  it('crew adds a RELEASE photo while pending', async () => {
    const id = await pending('ph-release');
    expect(await link('crew_member', id, 'release', await file('ph-r'))).toBe(1);
  });
  it('a RETURN photo while pending is refused', async () => {
    const id = await pending('ph-return-early');
    expect(await link('crew_member', id, 'return', await file('ph-re'))).toBe(0);
  });
  it('a RELEASE photo after the receiver signed is refused (the release set is frozen)', async () => {
    const id = await open('ph-release-late');
    expect(await link('owner', id, 'release', await file('ph-rl'))).toBe(0);
  });
  it('a RETURN photo while open is accepted', async () => {
    const id = await open('ph-return');
    expect(await link('foreman', id, 'return', await file('ph-ret'))).toBe(1);
  });
  it("a file in another category, or on another project, is refused", async () => {
    const id = await pending('ph-wrong');
    expect(await link('owner', id, 'release', await file('ph-cat', 'photos'))).toBe(0);
    expect(await link('owner', id, 'release', await file('ph-proj', 'material_signout', offProjectId))).toBe(0);
  });
  it('a client or a subcontractor adds no photo', async () => {
    const id = await pending('ph-outsider');
    for (const role of ['client', 'subcontractor'] as const) {
      expect(await link(role, id, 'release', await file(`ph-${role}`)), role).toBe(0);
    }
  });
  it('no photo row can be edited or deleted by the owner (the evidence stands)', async () => {
    const id = await pending('ph-frozen');
    await photo(id, 'release');
    const { data: ph } = await admin.from('material_signout_photos').select('id, stage').eq('signout_id', id).single();
    await session.owner.from('material_signout_photos').update({ stage: 'return' }).eq('id', ph!.id);
    await session.owner.from('material_signout_photos').delete().eq('id', ph!.id);
    const { data: after } = await admin.from('material_signout_photos').select('stage').eq('id', ph!.id).single();
    expect(after?.stage).toBe('release');
  });
});

describe('READ — staff on the project only', () => {
  const READ: Record<CompanyRole, boolean> = { ...CREATE };
  forEveryRole(READ, (role, may) => {
    it(`${role}: reads the project's record → ${may ? 'yes' : 'nothing'}`, async () => {
      const id = await pending(`read-${role}`);
      const { data } = await session[role].from('material_signouts').select('id').eq('id', id);
      expect((data ?? []).length, role).toBe(may ? 1 : 0);
    });
  });
  it('a crew member NOT on the project reads nothing of it', async () => {
    const id = await pending('read-off', offProjectId);
    const { data } = await session.crew_member.from('material_signouts').select('id').eq('id', id);
    expect(data ?? []).toHaveLength(0);
  });
});

describe('category, never MIME — sign-out images never reach the Photos view', () => {
  it('an image filed as material_signout is outside PHOTO_VIEW_FILTER; a control image in photos is inside', async () => {
    const so = await file('view-so');
    const ctl = await file('view-ctl', 'photos');
    const { data } = await admin
      .from('files')
      .select('id')
      .eq('project_id', projectId)
      .in('id', [so, ctl])
      .or(PHOTO_VIEW_FILTER);
    const ids = (data ?? []).map((r) => r.id as string);
    expect(ids, 'control: the photos-category image IS in the view').toContain(ctl);
    expect(ids).not.toContain(so);
  });
});
