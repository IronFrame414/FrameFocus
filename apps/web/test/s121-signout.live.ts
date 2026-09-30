/**
 * S121 Part 3 — the material sign-out rulings, enforced IN THE DATABASE.
 * Migrations 20262117000000 (signer is the caller) and 20262118000000 (return
 * evidence). [RULED Josh 2026-09-30: ASK-13, ASK-15, ASK-28.]
 *
 *   SIGNER    a client INSERT stores the CALLER's own profile name, whatever
 *             `released_signer_name` says — a foreman cannot sign for someone
 *             else. Per staff role (total over the six that can create).
 *   RETURN    came back → a 'return' photo AND a 'return_location' photo AND a
 *             non-blank note, or close_material_signout refuses; each missing
 *             piece is refused ON ITS OWN, with its own sentence.
 *   NOT BACK  not returned → a reason in (consumed, installed, lost, still_out),
 *             or refused; the reason is stored, the location note is not.
 *   STAGE     a 'return_location' photo only while the record is OPEN.
 *
 * Every refusal is judged by the SERVICE ROLE (the record's status, a count);
 * the writes return no rows. Disposable projects (marker `S121SO`).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CompanyRole } from '@framefocus/shared/types/roles';
import { admin, assertRebuildTest, deleteProjects, sessionFor } from './live-session';

const MARKER = 'S121SO';
const SIG = 'data:image/png;base64,iVBORw0KGgo=';
const STAFF = ['owner', 'admin', 'project_executive', 'project_manager', 'foreman', 'crew_member'] as const;
type Staff = (typeof STAFF)[number];
const IDENTITY: Record<Staff, string> = {
  owner: 'josh+test50@worthprop.com',
  admin: 'josh+qa-admin@worthprop.com',
  project_executive: 'josh+qa-pe@worthprop.com',
  project_manager: 'josh+pm@worthprop.com',
  foreman: 'josh+qa-foreman@worthprop.com',
  crew_member: 'josh+crew@worthprop.com',
};
const ON_PROJECT: Partial<Record<Staff, string>> = {
  project_executive: 'project_executive',
  project_manager: 'project_manager',
  foreman: 'crew',
  crew_member: 'crew',
};

const session = {} as Record<Staff, SupabaseClient>;
const member = {} as Record<Staff, string>;
const profileName = {} as Record<Staff, string>;
let companyId = '';
let contactId = '';
let projectId = '';

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

function fields(tag: string) {
  return {
    project_id: projectId,
    job_name: `${MARKER} job`,
    signout_date: '2026-09-30',
    material_type: `${MARKER} ${tag}`,
    quantity: '3 slabs',
    condition_at_release: 'undamaged',
    expected_return_date: '2026-10-07',
    receiver_company: 'Acme Stone',
    released_signature_type: 'type',
    released_signature_data: SIG,
  };
}

let fileSeq = 0;
async function photo(signoutId: string, stage: 'release' | 'return' | 'return_location') {
  const { data: f, error: fErr } = await admin
    .from('files')
    .insert({
      company_id: companyId,
      project_id: projectId,
      category: 'material_signout',
      file_name: `${MARKER}-${stage}-${++fileSeq}.jpg`,
      file_path: `${companyId}/${projectId}/${MARKER}-${stage}-${fileSeq}-${Date.now()}.jpg`,
      file_size: 1,
      mime_type: 'image/jpeg',
    })
    .select('id')
    .single();
  if (fErr) throw new Error(`file: ${fErr.message}`);
  const { error } = await admin.from('material_signout_photos').insert({
    company_id: companyId,
    signout_id: signoutId,
    file_id: f!.id,
    stage,
    taken_by_member_id: member.crew_member,
  });
  if (error) throw new Error(`photo ${stage}: ${error.message}`);
  return f!.id as string;
}

/** An OPEN record (service role: pending + release photo + receipt). */
async function openRecord(tag: string): Promise<string> {
  const { data, error } = await admin
    .from('material_signouts')
    .insert({
      ...fields(tag),
      company_id: companyId,
      released_by_member_id: member.crew_member,
      released_signer_name: 'Seed',
    })
    .select('id')
    .single();
  if (error) throw new Error(`seed: ${error.message}`);
  const id = data!.id as string;
  await photo(id, 'release');
  const { error: uErr } = await admin
    .from('material_signouts')
    .update({
      status: 'open',
      receiver_signer_name: 'Driver',
      receiver_signature_type: 'type',
      receiver_signature_data: SIG,
      receiver_signed_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (uErr) throw new Error(`open: ${uErr.message}`);
  return id;
}

async function row(id: string) {
  const { data } = await admin.from('material_signouts').select('*').eq('id', id).single();
  return data as Record<string, unknown>;
}

function close(
  id: string,
  condition: string,
  extra: { note?: string; reason?: string } = {}
) {
  return session.owner.rpc('close_material_signout', {
    p_signout_id: id,
    p_condition_at_return: condition,
    p_returned_date: '2026-10-05',
    p_returned_time: '14:30',
    p_return_notes: '',
    p_signer_name: 'Office',
    p_signature_type: 'type',
    p_signature_data: SIG,
    p_return_location_note: extra.note,
    p_not_returned_reason: extra.reason,
  });
}

beforeAll(async () => {
  assertRebuildTest();
  const { data: prof } = await admin.from('profiles').select('company_id').eq('email', IDENTITY.owner).single();
  companyId = prof!.company_id as string;
  await sweep();
  for (const role of STAFF) {
    const { data: p } = await admin
      .from('profiles')
      .select('id, first_name, last_name')
      .eq('email', IDENTITY[role])
      .single();
    profileName[role] = [p!.first_name, p!.last_name].filter(Boolean).join(' ').trim();
    const { data: m } = await admin.from('company_members').select('id').eq('profile_id', p!.id).single();
    member[role] = m!.id as string;
  }
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
  const { data: pr, error: pErr } = await admin
    .from('projects')
    .insert({
      company_id: companyId,
      contact_id: contactId,
      project_number: `PRJ-${MARKER}`,
      name: `${MARKER} project`,
      status: 'active',
      project_internal_seq: (seqRow?.project_internal_seq ?? 0) + 8200,
    })
    .select('id')
    .single();
  if (pErr) throw new Error(`project: ${pErr.message}`);
  projectId = pr!.id as string;
  for (const [role, onProject] of Object.entries(ON_PROJECT) as [Staff, string][]) {
    const { error } = await admin.from('project_assignments').insert({
      company_id: companyId,
      project_id: projectId,
      member_id: member[role],
      role_on_project: onProject,
    });
    if (error) throw new Error(`assign ${role}: ${error.message}`);
  }
  for (const role of STAFF) session[role] = await sessionFor(IDENTITY[role]);
}, 240_000);

afterAll(async () => {
  await sweep();
  const { count } = await admin
    .from('material_signouts')
    .select('id', { count: 'exact', head: true })
    .like('material_type', `${MARKER} %`);
  expect(count ?? 0).toBe(0);
}, 180_000);

describe('SIGNER — the stored name is the CALLER, never what was typed (ASK-15)', () => {
  it('every seeded identity has a profile name (else the test proves nothing)', () => {
    for (const role of STAFF) expect(profileName[role], role).not.toBe('');
  });

  for (const role of STAFF) {
    it(`${role}: types "Somebody Else" → the row stores "${'<'}own name>"`, async () => {
      const tag = `signer-${role}`;
      // Written WITHOUT returning rows; read back with the service role.
      const { error } = await session[role].from('material_signouts').insert({
        ...fields(tag),
        released_by_member_id: member[role],
        released_signer_name: 'Somebody Else',
      });
      expect(error, role).toBeNull();
      const { data, count } = await admin
        .from('material_signouts')
        .select('released_signer_name', { count: 'exact' })
        .eq('material_type', `${MARKER} ${tag}`);
      expect(count, `${role}: exactly one row`).toBe(1);
      expect(data![0].released_signer_name, role).toBe(profileName[role]);
      expect(data![0].released_signer_name).not.toBe('Somebody Else');
    });
  }

  it('control: a SERVICE-ROLE insert (not a person signing) keeps its value', async () => {
    const id = await openRecord('signer-service');
    expect((await row(id)).released_signer_name).toBe('Seed');
  });
});

describe('RETURN — came back: two photos + where, each refused on its own (ASK-13)', () => {
  for (const condition of ['same_as_released', 'damage_occurred'] as const) {
    it(`${condition}: no evidence at all → refused, still open`, async () => {
      const id = await openRecord(`ret-none-${condition}`);
      const { error } = await close(id, condition, { note: 'bay 2' });
      expect(error?.message).toBe('Add a photo of the material as it came back.');
      expect((await row(id)).status).toBe('open');
    });

    it(`${condition}: material photo only → refused for the LOCATION photo`, async () => {
      const id = await openRecord(`ret-mat-${condition}`);
      await photo(id, 'return');
      const { error } = await close(id, condition, { note: 'bay 2' });
      expect(error?.message).toBe('Add a photo of where you put the material.');
      expect((await row(id)).status).toBe('open');
    });

    it(`${condition}: location photo only → refused for the MATERIAL photo`, async () => {
      const id = await openRecord(`ret-loc-${condition}`);
      await photo(id, 'return_location');
      const { error } = await close(id, condition, { note: 'bay 2' });
      expect(error?.message).toBe('Add a photo of the material as it came back.');
      expect((await row(id)).status).toBe('open');
    });

    it(`${condition}: both photos, BLANK note → refused for the note`, async () => {
      const id = await openRecord(`ret-blank-${condition}`);
      await photo(id, 'return');
      await photo(id, 'return_location');
      for (const note of [undefined, '', '   ']) {
        const { error } = await close(id, condition, { note });
        expect(error?.message, JSON.stringify(note)).toBe('Write where you put the material.');
      }
      expect((await row(id)).status).toBe('open');
    });

    it(`${condition}: both photos + the note → closed, the note stored, no reason`, async () => {
      const id = await openRecord(`ret-ok-${condition}`);
      await photo(id, 'return');
      await photo(id, 'return_location');
      const { error } = await close(id, condition, { note: '  Shop rack B, top shelf  ', reason: 'lost' });
      expect(error).toBeNull();
      const r = await row(id);
      expect(r.status).toBe(condition === 'same_as_released' ? 'returned' : 'damaged_on_return');
      expect(r.return_location_note).toBe('Shop rack B, top shelf');
      expect(r.not_returned_reason, 'a reason is never stored for material that came back').toBeNull();
    });
  }

  it('a DELETED location photo does not count', async () => {
    const id = await openRecord('ret-deleted-loc');
    await photo(id, 'return');
    const fid = await photo(id, 'return_location');
    await admin.from('files').update({ is_deleted: true }).eq('id', fid);
    const { error } = await close(id, 'same_as_released', { note: 'bay 2' });
    expect(error?.message).toBe('Add a photo of where you put the material.');
    expect((await row(id)).status).toBe('open');
  });
});

describe('NOT RETURNED — a reason instead (ASK-28)', () => {
  it('no reason → refused, still open', async () => {
    const id = await openRecord('nr-none');
    const { error } = await close(id, 'not_returned');
    expect(error?.message).toBe('Say what happened to the material: consumed, installed, lost, or still out.');
    expect((await row(id)).status).toBe('open');
  });

  it('a reason outside the four → refused', async () => {
    const id = await openRecord('nr-bad');
    const { error } = await close(id, 'not_returned', { reason: 'stolen' });
    expect(error).not.toBeNull();
    expect((await row(id)).status).toBe('open');
  });

  for (const reason of ['consumed', 'installed', 'lost', 'still_out'] as const) {
    it(`"${reason}" → not_returned, the reason stored, NO photos needed, no location note`, async () => {
      const id = await openRecord(`nr-${reason}`);
      const { error } = await close(id, 'not_returned', { reason, note: 'ignored' });
      expect(error).toBeNull();
      const r = await row(id);
      expect(r.status).toBe('not_returned');
      expect(r.not_returned_reason).toBe(reason);
      expect(r.return_location_note).toBeNull();
    });
  }
});

describe('STAGE — a return_location photo only while OPEN', () => {
  async function link(signoutId: string, fid: string) {
    await session.crew_member
      .from('material_signout_photos')
      .insert({ signout_id: signoutId, file_id: fid, stage: 'return_location', taken_by_member_id: member.crew_member });
    const { count } = await admin
      .from('material_signout_photos')
      .select('id', { count: 'exact', head: true })
      .eq('file_id', fid);
    return count ?? -1;
  }
  async function bareFile(tag: string) {
    const { data } = await admin
      .from('files')
      .insert({
        company_id: companyId,
        project_id: projectId,
        category: 'material_signout',
        file_name: `${MARKER}-${tag}.jpg`,
        file_path: `${companyId}/${projectId}/${MARKER}-${tag}-${Date.now()}.jpg`,
        file_size: 1,
        mime_type: 'image/jpeg',
      })
      .select('id')
      .single();
    return data!.id as string;
  }

  it('while OPEN → accepted (count 1)', async () => {
    const id = await openRecord('stage-open');
    expect(await link(id, await bareFile('stage-open'))).toBe(1);
  });

  it('while PENDING → refused (count 0)', async () => {
    const { data } = await admin
      .from('material_signouts')
      .insert({ ...fields('stage-pending'), company_id: companyId, released_by_member_id: member.crew_member, released_signer_name: 'Seed' })
      .select('id')
      .single();
    expect(await link(data!.id as string, await bareFile('stage-pending'))).toBe(0);
  });
});
