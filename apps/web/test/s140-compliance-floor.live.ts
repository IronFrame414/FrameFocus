import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';

// ============================================================================
// S140 — the 7C compliance floor, driven against RLS as real users.
//
// Migration: 20260921000000_compliance_owner_admin_floor.sql
// Spec:      docs/specs/7C-spec.md §2.5, §6.10 (option (b), S92)
// Ruling:    [Josh, S140] A2 — all three verbs Owner/Admin. SELECT is NOT
//            split out; a PM does not read compliance either.
// ============================================================================
//
// ⚠️ EVERY ROLE-SCOPED READ AND WRITE BELOW RUNS AS A REAL USER. The clients
// are anon-key clients carrying real user JWTs, so RLS applies exactly as it
// does in the app. `admin` (service role) appears ONLY to seed, and to
// evaluate counterfactuals OUTSIDE the policy under test.
//
// ⚠️ THE COUNTERFACTUAL IS THE POINT. A gated role reading zero rows proves
// NOTHING on its own — an empty table answers identically, and so does a typo
// in the filter. Every "sees nothing" assertion below is paired with a
// service-role read that proves the row is really there, and every gated role
// is first shown to read a DIFFERENT table successfully, so a broken session
// cannot masquerade as a working floor.

const OWNER = 'josh+test50@worthprop.com';
const ADMIN_USER = 'josh+qa-admin@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const FOREMAN = 'josh+qa-foreman@worthprop.com';
const CREW = 'josh+crew@worthprop.com';

let ownerC: SupabaseClient;
let adminC: SupabaseClient;
let pmC: SupabaseClient;
let foremanC: SupabaseClient;
let crewC: SupabaseClient;

let companyId = '';
let memberId = '';
/** Seeded service-role, so its existence never depends on the policy. */
let seededDocId = '';
const createdDocIds: string[] = [];
const createdFileIds: string[] = [];

beforeAll(async () => {
  assertRebuildTest();

  [ownerC, adminC, pmC, foremanC, crewC] = (await Promise.all([
    sessionFor(OWNER),
    sessionFor(ADMIN_USER),
    sessionFor(PM),
    sessionFor(FOREMAN),
    sessionFor(CREW),
  ])) as SupabaseClient[];

  const { data: prof } = await admin
    .from('profiles')
    .select('company_id')
    .eq('email', OWNER)
    .eq('is_deleted', false)
    .single();
  companyId = (prof as { company_id: string }).company_id;

  // Any subcontractor member of Company A. Compliance is member-keyed.
  const { data: member } = await admin
    .from('company_members')
    .select('id')
    .eq('company_id', companyId)
    .eq('member_type', 'subcontractor')
    .eq('is_deleted', false)
    .limit(1)
    .single();
  memberId = (member as { id: string }).id;

  const { data: seeded } = await admin
    .from('subcontractor_compliance_documents')
    .insert({
      company_id: companyId,
      member_id: memberId,
      doc_type: 'coi',
      expiration_date: '2027-01-01',
      notes: 'S140 harness fixture',
    })
    .select('id')
    .single();
  seededDocId = (seeded as { id: string }).id;
});

afterAll(async () => {
  const ids = [seededDocId, ...createdDocIds].filter(Boolean);
  if (ids.length) {
    await admin.from('subcontractor_compliance_documents').delete().in('id', ids);
  }
  if (createdFileIds.length) {
    await admin.from('files').delete().in('id', createdFileIds);
  }
});

describe('S140-1 — the fixture is real, so a zero read means something', () => {
  it('the seeded document exists, read outside every policy', async () => {
    const { data } = await admin
      .from('subcontractor_compliance_documents')
      .select('id, member_id')
      .eq('id', seededDocId)
      .single();
    expect(data).toBeTruthy();
    expect((data as { member_id: string }).member_id).toBe(memberId);
  });
});

describe('S140-2 — Owner and Admin retain full access', () => {
  it('Owner SELECTs the seeded row', async () => {
    const { data } = await ownerC
      .from('subcontractor_compliance_documents')
      .select('id')
      .eq('id', seededDocId);
    expect(data?.length).toBe(1);
  });

  it('Admin SELECTs the seeded row', async () => {
    const { data } = await adminC
      .from('subcontractor_compliance_documents')
      .select('id')
      .eq('id', seededDocId);
    expect(data?.length).toBe(1);
  });

  it('Owner INSERTs a document', async () => {
    const { data, error } = await ownerC
      .from('subcontractor_compliance_documents')
      .insert({ member_id: memberId, doc_type: 'w9' })
      .select('id')
      .single();
    expect(error).toBeNull();
    expect(data).toBeTruthy();
    createdDocIds.push((data as { id: string }).id);
  });

  it('Admin UPDATEs a document', async () => {
    const { error } = await adminC
      .from('subcontractor_compliance_documents')
      .update({ notes: 'touched by admin' })
      .eq('id', seededDocId);
    expect(error).toBeNull();

    // Verified OUTSIDE the policy — an UPDATE that matched zero rows also
    // returns no error, so the absence of an error proves nothing by itself.
    const { data } = await admin
      .from('subcontractor_compliance_documents')
      .select('notes')
      .eq('id', seededDocId)
      .single();
    expect((data as { notes: string }).notes).toBe('touched by admin');
  });
});

describe('S140-3 — PM, foreman and crew are floored on SELECT', () => {
  const cases: [string, () => SupabaseClient][] = [
    ['project_manager', () => pmC],
    ['foreman', () => foremanC],
    ['crew_member', () => crewC],
  ];

  for (const [role, client] of cases) {
    it(`${role} reads ZERO compliance rows — and is not simply a broken session`, async () => {
      // Non-vacuity: prove this session works against a table it MAY read.
      // Without this, a dead JWT and a working floor are indistinguishable.
      const { data: canRead } = await client()
        .from('projects')
        .select('id')
        .limit(1);
      expect(canRead, `${role} could not read projects — session is broken`).toBeTruthy();

      const { data } = await client()
        .from('subcontractor_compliance_documents')
        .select('id')
        .eq('id', seededDocId);
      expect(data ?? []).toHaveLength(0);

      // Unfiltered too — a filtered zero could be an id typo.
      const { data: all } = await client()
        .from('subcontractor_compliance_documents')
        .select('id');
      expect(all ?? []).toHaveLength(0);
    });
  }
});

describe('S140-4 — PM cannot write, which is what changed at S140', () => {
  it('PM INSERT is refused', async () => {
    const { data, error } = await pmC
      .from('subcontractor_compliance_documents')
      .insert({ member_id: memberId, doc_type: 'license' })
      .select('id');
    expect(error).toBeTruthy();
    expect(data).toBeNull();
    if (data) createdDocIds.push(...(data as { id: string }[]).map((r) => r.id));
  });

  it('PM UPDATE changes nothing', async () => {
    const before = await admin
      .from('subcontractor_compliance_documents')
      .select('notes')
      .eq('id', seededDocId)
      .single();

    await pmC
      .from('subcontractor_compliance_documents')
      .update({ notes: 'PM SHOULD NOT BE ABLE TO WRITE THIS' })
      .eq('id', seededDocId);

    // The row is re-read with the SERVICE ROLE. Asserting through the PM's own
    // session would be circular: they cannot SELECT it either, so any read
    // would come back empty whether the write landed or not.
    const after = await admin
      .from('subcontractor_compliance_documents')
      .select('notes')
      .eq('id', seededDocId)
      .single();
    expect((after.data as { notes: string }).notes).toBe(
      (before.data as { notes: string }).notes
    );
  });

  it('PM cannot soft-delete either', async () => {
    await pmC
      .from('subcontractor_compliance_documents')
      .update({ is_deleted: true })
      .eq('id', seededDocId);

    const { data } = await admin
      .from('subcontractor_compliance_documents')
      .select('is_deleted')
      .eq('id', seededDocId)
      .single();
    expect((data as { is_deleted: boolean }).is_deleted).toBe(false);
  });
});

describe('S140-5 — the file half: project_id IS NULL is Owner/Admin only', () => {
  it('Owner INSERTs a company-scoped compliance file row', async () => {
    const { data, error } = await ownerC
      .from('files')
      .insert({
        project_id: null,
        category: 'compliance',
        file_name: 's140-fixture.pdf',
        file_path: `${companyId}/compliance/${memberId}/s140-fixture.pdf`,
        file_size: 1,
        mime_type: 'application/pdf',
      })
      .select('id')
      .single();
    expect(error).toBeNull();
    expect(data).toBeTruthy();
    createdFileIds.push((data as { id: string }).id);
  });

  it('PM is refused a project_id-NULL file row', async () => {
    const { data, error } = await pmC
      .from('files')
      .insert({
        project_id: null,
        category: 'compliance',
        file_name: 's140-pm-should-fail.pdf',
        file_path: `${companyId}/compliance/${memberId}/nope.pdf`,
        file_size: 1,
        mime_type: 'application/pdf',
      })
      .select('id');
    expect(error).toBeTruthy();
    expect(data).toBeNull();
    if (data) createdFileIds.push(...(data as { id: string }[]).map((r) => r.id));
  });

  it("'compliance' is a legal category — the CHECK accepted it above", async () => {
    // Guards the migration's second half independently of RLS: a rejected
    // category and a rejected policy both surface as an insert error, so the
    // Owner insert passing is only evidence once the stored value is read back.
    const { data: row } = await admin
      .from('files')
      .select('category')
      .eq('id', createdFileIds[0])
      .single();
    expect((row as { category: string }).category).toBe('compliance');
  });
});
