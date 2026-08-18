/**
 * S154 — Module 2 audit fixes, Groups A, B and C.
 *
 * Findings: `docs/specs/S153-m2-audit.md` §1 (M2-01, M2-02, M2-03, M2-07).
 * Migrations: `20261005000000_m2_soft_delete_restored.sql`,
 *             `20261006000000_m2_address_floor_and_site_grant.sql`.
 *
 * FAILING-THEN-PASSING: every Group A assertion fails before `20261005000000`
 * (the soft delete was refused outright), every Group B assertion before
 * `20261006000000`, and Group C's before this session's service edits.
 *
 * ⚠️ Runs the REAL shipped services under real JWTs where the finding is in the
 * service layer — a PostgREST probe cannot see M2-03.
 *
 * ⚠️ SUPERSEDES `s153-m2-audit.live.ts` F1/F2/F3, which asserted the OLD
 * behaviour and said in their own messages to invert them. Those inversions are
 * done in that file.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';

const state = vi.hoisted(() => ({ client: null as unknown as SupabaseClient }));
vi.mock('@/lib/supabase-browser', () => ({ createClient: () => state.client }));
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.client }));

import { deleteContact, updateContact } from '@/lib/services/contacts-client';
import { formatSiteAddress, getProjectSiteAddress } from '@/lib/services/contact-addresses';

const MARKER = 'S154M2';
const OWNER = 'josh+test50@worthprop.com';
const CREW = 'josh+crew@worthprop.com';
const SUB = 'josh+qa-sub@worthprop.com';
const CLIENT = 'josh+qa-client@worthprop.com';

let owner: SupabaseClient;
let crew: SupabaseClient;
let sub: SupabaseClient;
let client: SupabaseClient;

let companyId: string;
let contactId: string;
/** The address the assigned project points at. The sub SHOULD see this one. */
let siteAddressId: string;
/** A second address on the SAME contact — a home address. The sub must NOT. */
let homeAddressId: string;
let assignedProjectId: string;
/** A project the sub is NOT assigned to, whose address must stay hidden. */
let otherProjectId: string;
let otherAddressId: string;
let subMemberId: string;
const assignmentIds: string[] = [];

const must = (label: string, error: { message: string } | null) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};

async function sweep(): Promise<void> {
  const { data: projects } = await admin
    .from('projects').select('id').like('name', `${MARKER}%`);
  const pids = ((projects ?? []) as { id: string }[]).map((p) => p.id);
  if (pids.length) {
    // project_assignments is ON DELETE NO ACTION and blocks the parent — the
    // trap that leaked seven projects at S151. Error-checked, not fired blind.
    const a = await admin.from('project_assignments').delete().in('project_id', pids);
    if (a.error) throw new Error(`sweep assignments: ${a.error.message}`);
    const p = await admin.from('projects').delete().in('id', pids);
    if (p.error) throw new Error(`sweep projects: ${p.error.message}`);
  }
  const { data: contacts } = await admin
    .from('contacts').select('id').eq('first_name', MARKER);
  const cids = ((contacts ?? []) as { id: string }[]).map((c) => c.id);
  if (cids.length) {
    const ad = await admin.from('contact_addresses').delete().in('contact_id', cids);
    if (ad.error) throw new Error(`sweep addresses: ${ad.error.message}`);
    const c = await admin.from('contacts').delete().in('id', cids);
    if (c.error) throw new Error(`sweep contacts: ${c.error.message}`);
  }
  const s = await admin.from('subcontractors').delete().like('company_name', `${MARKER}%`);
  if (s.error) throw new Error(`sweep subs: ${s.error.message}`);
}

async function makeProject(name: string, addressId: string): Promise<string> {
  const { data: counters } = await admin
    .from('companies')
    .select('estimate_number_sequence, project_internal_sequence').eq('id', companyId).single();
  const seq = counters!.estimate_number_sequence + 1;
  const internal = counters!.project_internal_sequence + 1;
  const { data, error } = await admin
    .from('projects')
    .insert({
      company_id: companyId, name: `${MARKER} ${name}`, contact_id: contactId,
      contact_address_id: addressId, project_type: 'fixed_price',
      project_number: `PRJ-${String(seq).padStart(3, '0')}`, project_internal_seq: internal,
    })
    .select('id').single();
  must(`project ${name}`, error);
  must('counters', (await admin.from('companies').update({
    estimate_number_sequence: seq, project_internal_sequence: internal,
  }).eq('id', companyId)).error);
  return data!.id;
}

beforeAll(async () => {
  assertRebuildTest();
  [owner, crew, sub, client] = await Promise.all([
    sessionFor(OWNER), sessionFor(CREW), sessionFor(SUB), sessionFor(CLIENT),
  ]);

  const { data: company } = await admin
    .from('companies').select('id').eq('name', 'Bishop Contracting').single();
  companyId = company!.id;

  await sweep();

  const { data: contact, error: cErr } = await admin
    .from('contacts')
    .insert({
      company_id: companyId, contact_type: 'client', status: 'active',
      first_name: MARKER, last_name: 'Client', email: `${MARKER.toLowerCase()}@example.invalid`,
    })
    .select('id').single();
  must('contact', cErr);
  contactId = contact!.id;

  // TWO addresses on ONE contact. This pairing is the point of B2: the grant
  // must resolve the SITE and leave the HOME alone.
  const mkAddr = async (line1: string, primary: boolean) => {
    const { data, error } = await admin
      .from('contact_addresses')
      .insert({
        company_id: companyId, contact_id: contactId, is_primary: primary,
        address_line1: line1, city: 'Ridgefield', state: 'CT', zip: '06877',
      })
      .select('id').single();
    must(`address ${line1}`, error);
    return data!.id as string;
  };
  homeAddressId = await mkAddr(`${MARKER} 9 Home Road`, true);
  siteAddressId = await mkAddr(`${MARKER} 1 Site Lane`, false);
  otherAddressId = await mkAddr(`${MARKER} 5 Other Way`, false);

  assignedProjectId = await makeProject('assigned', siteAddressId);
  otherProjectId = await makeProject('unassigned', otherAddressId);

  // The sub's member row. ORDERED — `.limit(1)` on heap order is the class this
  // repo has now hit five times.
  const { data: subProfile } = await admin
    .from('profiles').select('id').eq('email', SUB).single();
  const { data: member } = await admin
    .from('company_members').select('id').eq('profile_id', subProfile!.id)
    .order('id', { ascending: true }).limit(1).single();
  subMemberId = member!.id;

  const { data: assignment, error: aErr } = await admin
    .from('project_assignments')
    .insert({ company_id: companyId, project_id: assignedProjectId, member_id: subMemberId })
    .select('id').single();
  must('assignment', aErr);
  assignmentIds.push(assignment!.id);
}, 240_000);

afterAll(async () => {
  await sweep();
}, 240_000);

// ============================================================================
// GROUP A — soft delete works, and the row is restorable.
// ============================================================================

describe('S154-A — soft delete is possible again', () => {
  it('A1 — deleteContact() SUCCEEDS for an Owner', async () => {
    const { data: probe, error } = await admin
      .from('contacts')
      .insert({
        company_id: companyId, contact_type: 'client', status: 'active',
        first_name: MARKER, last_name: 'Deletable',
      })
      .select('id').single();
    must('probe', error);

    state.client = owner;
    const result = await deleteContact(probe!.id);
    expect(result.success, `deleteContact failed: ${result.error}`).toBe(true);

    const { data: after } = await admin
      .from('contacts').select('is_deleted').eq('id', probe!.id).single();
    expect(after!.is_deleted).toBe(true);
  });

  it('A2 — the soft-deleted row is still READABLE, so restore is possible', async () => {
    // The reason the trash-bin convention forbids `is_deleted` in RLS. Before
    // 20261005000000 this row was invisible to the Owner who deleted it — and
    // in fact the delete never happened at all.
    const { data: probe } = await admin
      .from('contacts').select('id').eq('first_name', MARKER).eq('last_name', 'Deletable').single();

    const { data: read } = await owner
      .from('contacts').select('id, is_deleted').eq('id', probe!.id);
    expect(read, 'the Owner cannot read the deleted row — restore is still impossible')
      .toHaveLength(1);
    expect(read![0].is_deleted).toBe(true);

    // And it can be put back.
    const { data: restored } = await owner
      .from('contacts').update({ is_deleted: false, deleted_at: null })
      .eq('id', probe!.id).select('id');
    expect(restored, 'restore affected no rows').toHaveLength(1);
  });

  it('A3 — a subcontractor soft-deletes too: the same fix, the second table', async () => {
    const { data: sc, error } = await admin
      .from('subcontractors')
      .insert({ company_id: companyId, company_name: `${MARKER} Subco`, sub_type: 'subcontractor' })
      .select('id').single();
    must('subcontractor', error);

    const { data, error: dErr } = await owner
      .from('subcontractors')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('id', sc!.id).select('id');
    expect(dErr, `subcontractor soft delete failed: ${dErr?.message}`).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('A4 — the SWEEP held: list surfaces still exclude deleted rows', async () => {
    // The whole risk in Group A. RLS no longer hides deleted rows, so the
    // service-layer filters are now the only thing doing it. If a list surface
    // had been relying on RLS, this goes red.
    const { data: probe } = await admin
      .from('contacts').select('id').eq('first_name', MARKER).eq('last_name', 'Deletable').single();
    must('re-delete', (await admin
      .from('contacts').update({ is_deleted: true }).eq('id', probe!.id)).error);

    // getContacts()'s filter, exercised through the same query it runs.
    const { data: list } = await owner
      .from('contacts').select('id').eq('is_deleted', false);
    expect(
      (list ?? []).map((r) => r.id),
      'a soft-deleted contact appears in the filtered list'
    ).not.toContain(probe!.id);

    // ...and it IS visible without the filter, so the test is not vacuous.
    const { data: unfiltered } = await owner.from('contacts').select('id').eq('id', probe!.id);
    expect(unfiltered, 'the deleted row is invisible even unfiltered — RLS still filters')
      .toHaveLength(1);

    must('cleanup', (await admin
      .from('contacts').update({ is_deleted: false }).eq('id', probe!.id)).error);
  });
});

// ============================================================================
// GROUP B — the floor, and the assignment-scoped site-address grant.
// ============================================================================

describe('S154-B1 — the address leak is shut', () => {
  it('B1a — a CLIENT reads no contact addresses at all', async () => {
    const { data } = await client.from('contact_addresses').select('id');
    expect(data, 'a client still reads contact addresses').toEqual([]);
  });

  it('B1b — an unassigned SUBCONTRACTOR reads no contact addresses', async () => {
    // The sub IS assigned to one project, so this asserts the negative on the
    // rows they have no claim to: the contact's home address and another
    // project's site.
    const { data } = await sub
      .from('contact_addresses').select('id').in('id', [homeAddressId, otherAddressId]);
    expect(
      data,
      'the sub reads the home address, or the site of a project they are not assigned to'
    ).toEqual([]);
  });

  it('B1c — staff are UNAFFECTED, so the floor did not over-reach', async () => {
    // Without this, B1a/B1b pass on a policy that refuses everybody.
    const { data } = await owner
      .from('contact_addresses').select('id')
      .in('id', [homeAddressId, siteAddressId, otherAddressId]);
    expect(data, 'the Owner lost access to addresses — the floor over-reached').toHaveLength(3);

    const { data: crewRows } = await crew.from('contact_addresses').select('id')
      .in('id', [homeAddressId, siteAddressId, otherAddressId]);
    expect(crewRows, 'crew lost address access — the floor over-reached').toHaveLength(3);
  });
});

describe('S154-B2 — an assigned sub sees the site address, and only that', () => {
  it('B2a — the assigned sub CAN read their project\'s site address', async () => {
    const { data } = await sub
      .from('contact_addresses').select('id, address_line1').eq('id', siteAddressId);
    expect(data, 'the assigned sub cannot see the site address — B2 did not land').toHaveLength(1);
    expect(data![0].address_line1).toBe(`${MARKER} 1 Site Lane`);
  });

  it('B2b — ⚠️ and CANNOT read the same contact\'s HOME address', async () => {
    // THE ASSERTION THIS WHOLE GROUP EXISTS FOR. `contact_addresses` hangs off
    // the CONTACT, so a grant written as "the assigned sub sees this contact's
    // addresses" would hand over the client's home address too — B1's leak
    // through a narrower door. The grant resolves through
    // projects.contact_address_id, so exactly one row qualifies.
    const { data } = await sub
      .from('contact_addresses').select('id').eq('id', homeAddressId);
    expect(
      data,
      'the sub can read the client HOME address — the grant leaks through the contact'
    ).toEqual([]);
  });

  it('B2c — and cannot read the site address of a project they are NOT assigned to', async () => {
    const { data } = await sub
      .from('contact_addresses').select('id').eq('id', otherAddressId);
    expect(data, 'the grant is role-scoped, not assignment-scoped').toEqual([]);
  });

  it('B2d — removing the assignment removes the access', async () => {
    // Proves the grant tracks assignment rather than having been satisfied once.
    must('unassign', (await admin
      .from('project_assignments').update({ is_deleted: true }).in('id', assignmentIds)).error);

    const { data } = await sub
      .from('contact_addresses').select('id').eq('id', siteAddressId);
    expect(data, 'an unassigned sub still reads the site address').toEqual([]);

    must('reassign', (await admin
      .from('project_assignments').update({ is_deleted: false }).in('id', assignmentIds)).error);

    const { data: back } = await sub
      .from('contact_addresses').select('id').eq('id', siteAddressId);
    expect(back, 'reassignment did not restore access').toHaveLength(1);
  });

  it('B2e — the grant does not leak across tenants', async () => {
    // company_id scoping is still the outer clause. Asserted rather than assumed
    // because the new OR arm is the kind of change that can widen a policy
    // sideways.
    const { data } = await sub.from('contact_addresses').select('company_id');
    for (const row of data ?? []) {
      expect(row.company_id, 'the sub reads an address belonging to another tenant').toBe(companyId);
    }
  });
});

// ============================================================================
// GROUP C — the row-count guard reaches M2.
// ============================================================================

describe('S154-C — a discarded M2 write is reported as refused', () => {
  it('C1 — updateContact() refuses for a caller RLS discards', async () => {
    state.client = crew;
    const result = await updateContact(contactId, { last_name: 'Overwritten' });

    expect(result.success, 'updateContact still reports success over a discarded write').toBe(false);
    expect(result.error).toMatch(/not applied|permission|no longer exists/i);

    const { data } = await admin
      .from('contacts').select('last_name').eq('id', contactId).single();
    expect(data!.last_name).toBe('Client');
  });

  it('C2 — deleteContact() likewise', async () => {
    state.client = crew;
    const result = await deleteContact(contactId);
    expect(result.success, 'deleteContact still reports success for crew').toBe(false);

    const { data } = await admin
      .from('contacts').select('is_deleted').eq('id', contactId).single();
    expect(data!.is_deleted).toBe(false);
  });

  it('C3 — and both SUCCEED for an Owner, so C1/C2 are not vacuous', async () => {
    state.client = owner;
    expect((await updateContact(contactId, { last_name: 'OwnerWrote' })).success).toBe(true);
    const { data } = await admin
      .from('contacts').select('last_name').eq('id', contactId).single();
    expect(data!.last_name, 'the Owner could not write either — C3 proves nothing')
      .toBe('OwnerWrote');

    must('restore', (await admin
      .from('contacts').update({ last_name: 'Client' }).eq('id', contactId)).error);
  });
});

// ============================================================================
// GROUP B, the surface — getProjectSiteAddress() through the REAL service.
// ============================================================================

describe('S154-B3 — the site address reaches the sub through the shipped service', () => {
  it('B3a — an ASSIGNED sub gets the site address from getProjectSiteAddress()', async () => {
    // The policy tests above prove the row is readable. This proves the SERVICE
    // the mobile Overview actually calls returns it — a PostgREST probe cannot
    // establish that, which is why this runs the real function.
    state.client = sub;
    const addr = await getProjectSiteAddress(assignedProjectId);
    expect(addr, 'the assigned sub got no site address from the service').not.toBeNull();
    expect(addr!.address_line1).toBe(`${MARKER} 1 Site Lane`);
    expect(formatSiteAddress(addr!)).toBe(`${MARKER} 1 Site Lane · Ridgefield, CT 06877`);
  });

  it('B3b — the same sub gets NULL for a project they are not assigned to', async () => {
    // Which is what makes the Overview render no section at all rather than a
    // heading over an em-dash — a blank slot would advertise that an address
    // exists and is being withheld.
    state.client = sub;
    expect(await getProjectSiteAddress(otherProjectId)).toBeNull();
  });

  it('B3c — a CLIENT gets NULL, and an OWNER gets both', async () => {
    state.client = client;
    expect(await getProjectSiteAddress(assignedProjectId)).toBeNull();

    state.client = owner;
    expect(await getProjectSiteAddress(assignedProjectId)).not.toBeNull();
    expect(
      await getProjectSiteAddress(otherProjectId),
      'the Owner lost access to an unassigned project address'
    ).not.toBeNull();
  });
});
