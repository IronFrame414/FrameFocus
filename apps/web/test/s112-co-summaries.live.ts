import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  admin,
  assertRebuildTest,
  disposeProjectChangeOrdersError,
  sessionFor,
  sweepChangeOrders,
  sweepProjectsNamed,
} from './live-session';

// ============================================================================
// S112 R5b — `get_approved_change_order_summaries()`. Migration 20261840000000.
// rebuild-test only.
// ============================================================================
//
// RULED [Josh, S112 R5b]: every staff role learns that an APPROVED change order
// exists and what it changed — title, description, date — and NEVER a figure.
// Enforced in the database: the function's SELECT list names no money column.
// Audience: owner, admin, PM, foreman, crew, each scoped to projects they can
// view. Subcontractor and client: nothing.
//
// Written in the order Josh set:
//   1. NEGATIVE FIRST — a crew member (and foreman and PM) asks about a project
//      they are NOT on: zero rows, counted against the database, on a fixture
//      that the Owner proves does hold a signed change order.
//   2. then the positive case with row counts, computed from the database with
//      the same criteria rather than hard-coded;
//   3. and the S121 table floor re-proven AFTER the function exists: crew and
//      foreman still read 0 rows from `change_orders` directly. That is what
//      catches an accidental widening.
//
// Real supabase-js clients on the anon key with real user JWTs. Reads only,
// apart from the one fixture project and its two change orders.
// ============================================================================

const MARKER = 'S112COSUM';
const OWNER = 'josh+test50@worthprop.com';
const ADMIN = 'josh+qa-admin@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const FOREMAN = 'josh+qa-foreman@worthprop.com';
const CREW = 'josh+crew@worthprop.com';
const SUB = 'josh+qa-sub@worthprop.com';

/** The ONLY keys a summary row may carry. Anything else is a leak. */
const SUMMARY_KEYS = ['co_number', 'description', 'id', 'project_id', 'signed_at', 'title'];
/** S121's money column list, plus the line tables' — none may appear. */
const MONEY = [
  'net_delta',
  'labor_markup_percent',
  'material_markup_percent',
  'subcontractor_markup_percent',
  'tax_rate',
  'total_price',
  'total',
  'rate',
  'unit_cost',
  'amount',
  'markup_percent',
];

const STAFF = [
  ['owner', OWNER],
  ['admin', ADMIN],
  ['project_manager', PM],
  ['foreman', FOREMAN],
  ['crew_member', CREW],
] as const;
const ASSIGNED_ONLY = ['project_manager', 'foreman', 'crew_member'] as const;

const s: Record<string, SupabaseClient> = {};
const memberOf: Record<string, string> = {};
let companyId = '';
let fixtureProjectId = '';
let signedFixtureId = '';

type Summary = Record<string, unknown>;

async function summaries(c: SupabaseClient, projectId: string) {
  const { data, error } = await c.rpc('get_approved_change_order_summaries', {
    p_project_id: projectId,
  });
  expect(error, error?.message).toBeNull();
  return (data ?? []) as Summary[];
}

/** What the rule admits, computed with the service role from the same criteria. */
async function expectedSignedOn(projectIds: string[]) {
  if (!projectIds.length) return [] as string[];
  const { data } = await admin
    .from('change_orders')
    .select('id')
    .in('project_id', projectIds)
    .eq('status', 'signed')
    .eq('is_deleted', false);
  return ((data ?? []) as { id: string }[]).map((r) => r.id).sort();
}

async function assignedProjects(memberId: string) {
  const { data } = await admin
    .from('project_assignments')
    .select('project_id')
    .eq('member_id', memberId)
    .eq('is_deleted', false);
  return [...new Set(((data ?? []) as { project_id: string }[]).map((r) => r.project_id))];
}

async function sweep() {
  await sweepChangeOrders(`${MARKER}-`);
  const { data: projects } = await admin.from('projects').select('id').like('name', `${MARKER}%`);
  for (const p of (projects ?? []) as { id: string }[]) {
    const err = await disposeProjectChangeOrdersError(p.id);
    expect(err, err?.message).toBeNull();
  }
  await sweepProjectsNamed(MARKER);
}

beforeAll(async () => {
  assertRebuildTest();
  await sweep();
  for (const [role, email] of [...STAFF, ['subcontractor', SUB]] as const) {
    s[role] = await sessionFor(email);
    const { data: p } = await admin
      .from('profiles')
      .select('id, role, company_id')
      .eq('email', email)
      .eq('is_deleted', false)
      .single();
    const prof = p as { id: string; role: string; company_id: string };
    expect(prof.role, `${email} is not a ${role}`).toBe(role);
    companyId ||= prof.company_id;
    expect(prof.company_id, `${email} is in another company`).toBe(companyId);
    const { data: m } = await admin
      .from('company_members')
      .select('id')
      .eq('profile_id', prof.id)
      .eq('is_deleted', false)
      .single();
    memberOf[role] = (m as { id: string }).id;
  }

  // A project NOBODY is assigned to, holding one signed and one draft CO.
  // Ordered so the contact pick is stable (CLAUDE.md, .limit(1)); any contact
  // will do — nothing downstream depends on which.
  const { data: c } = await admin
    .from('contacts')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .single();
  const { data: counters } = await admin
    .from('companies')
    .select('project_internal_sequence')
    .eq('id', companyId)
    .single();
  const internal = (counters as { project_internal_sequence: number }).project_internal_sequence + 1;
  const { data: project, error: pErr } = await admin
    .from('projects')
    .insert({
      company_id: companyId,
      name: `${MARKER} unassigned`,
      contact_id: (c as { id: string }).id,
      project_type: 'fixed_price',
      project_number: `PRJ-${MARKER}`,
      project_internal_seq: internal,
    })
    .select('id')
    .single();
  expect(pErr, pErr?.message).toBeNull();
  fixtureProjectId = (project as { id: string }).id;
  await admin.from('companies').update({ project_internal_sequence: internal }).eq('id', companyId);

  // Authored by the Owner, so the PM arm of the table floor cannot admit them.
  const ownerUser = (await s.owner.auth.getUser()).data.user!.id;
  const author = { author_member_id: memberOf.owner, created_by: ownerUser };

  // signed_at NULL keeps the row hard-deletable by the shared teardown; the
  // function keys on status, not on the stamp.
  const { data: cos, error: coErr } = await admin
    .from('change_orders')
    .insert([
      {
        company_id: companyId,
        project_id: fixtureProjectId,
        ...author,
        co_number: `${MARKER}-SIGNED`,
        title: `${MARKER} signed`,
        description: 'Scope moved.',
        co_type: 'fixed_price',
        status: 'signed',
        net_delta: 1234.56,
      },
      {
        company_id: companyId,
        project_id: fixtureProjectId,
        ...author,
        co_number: `${MARKER}-DRAFT`,
        title: `${MARKER} draft`,
        co_type: 'fixed_price',
        status: 'draft',
        net_delta: 99,
      },
    ])
    .select('id, status');
  expect(coErr, coErr?.message).toBeNull();
  signedFixtureId = ((cos ?? []) as { id: string; status: string }[]).find(
    (r) => r.status === 'signed'
  )!.id;
}, 240_000);

afterAll(async () => {
  await sweep();
}, 120_000);

describe('S112 R5b · 1. NEGATIVE FIRST — not on the project, zero rows', () => {
  it('1a — fixture: nobody is assigned, and it DOES hold one signed CO (the Owner reads it)', async () => {
    const { data } = await admin
      .from('project_assignments')
      .select('id')
      .eq('project_id', fixtureProjectId)
      .eq('is_deleted', false);
    expect(data ?? [], 'someone is assigned to the fixture').toHaveLength(0);
    const owner = await summaries(s.owner, fixtureProjectId);
    console.log(`[S112 R5b 1a] owner rows on fixture: ${owner.length} (expected 1)`);
    expect(owner.map((r) => r.id)).toEqual([signedFixtureId]);
  });

  for (const role of ASSIGNED_ONLY) {
    it(`1b-${role} — 0 rows for a project they are not on`, async () => {
      const rows = await summaries(s[role], fixtureProjectId);
      console.log(`[S112 R5b 1b-${role}] rows: ${rows.length} (expected 0)`);
      expect(rows, `LEAK — ${role} read a summary off their projects`).toEqual([]);
    });
  }

  it('1c — subcontractor: 0 rows even on projects they ARE assigned to', async () => {
    const mine = await assignedProjects(memberOf.subcontractor);
    const expected = await expectedSignedOn(mine);
    expect(expected.length, 'sub is on no project with a signed CO — vacuous').toBeGreaterThan(0);
    let got = 0;
    for (const p of mine) got += (await summaries(s.subcontractor, p)).length;
    console.log(`[S112 R5b 1c] sub rows: ${got} across ${mine.length} projects holding ${expected.length} signed`);
    expect(got).toBe(0);
  });
});

describe('S112 R5b · 2. POSITIVE — exactly the signed COs on projects they can view', () => {
  for (const role of ASSIGNED_ONLY) {
    it(`2-${role} — row count equals the database's, signed only, NO money key`, async () => {
      const mine = await assignedProjects(memberOf[role]);
      const expected = await expectedSignedOn(mine);
      expect(expected.length, `${role} is on no project with a signed CO — vacuous`).toBeGreaterThan(0);
      const got: Summary[] = [];
      for (const p of mine) got.push(...(await summaries(s[role], p)));
      console.log(
        `[S112 R5b 2-${role}] rows: ${got.length} (database: ${expected.length}) across ${mine.length} projects`
      );
      expect(got.map((r) => r.id as string).sort()).toEqual(expected);
      for (const row of got) {
        expect(Object.keys(row).sort()).toEqual(SUMMARY_KEYS);
        for (const k of MONEY) expect(row, `money column ${k} returned`).not.toHaveProperty(k);
      }
    });
  }

  it('2-draft — the fixture draft is never returned, to anyone', async () => {
    for (const [role] of STAFF) {
      const rows = await summaries(s[role], fixtureProjectId);
      expect(rows.some((r) => String(r.co_number).endsWith('-DRAFT')), role).toBe(false);
    }
  });

  it("2-pm — the PM receives OTHER authors' approved COs, not only their own", async () => {
    const pmUser = (await s.project_manager.auth.getUser()).data.user!.id;
    const mine = await assignedProjects(memberOf.project_manager);
    const ids: string[] = [];
    for (const p of mine) ids.push(...(await summaries(s.project_manager, p)).map((r) => r.id as string));
    const { data } = await admin.from('change_orders').select('id, created_by').in('id', ids);
    const others = ((data ?? []) as { created_by: string | null }[]).filter((r) => r.created_by !== pmUser);
    console.log(`[S112 R5b 2-pm] ${ids.length} summaries, ${others.length} authored by someone else`);
    expect(others.length).toBeGreaterThan(0);
  });
});

describe('S112 R5b · 3. the S121 table floor is UNCHANGED now the function exists', () => {
  for (const role of ['foreman', 'crew_member', 'subcontractor'] as const) {
    it(`3-${role} — 0 rows from change_orders directly`, async () => {
      const { data, error } = await s[role].from('change_orders').select('id, net_delta');
      expect(error).toBeNull();
      console.log(`[S112 R5b 3-${role}] direct change_orders rows: ${(data ?? []).length} (expected 0)`);
      expect(data ?? []).toEqual([]);
    });
  }

  it('3-pm — direct reads still return ONLY the PM-authored COs', async () => {
    const pmUser = (await s.project_manager.auth.getUser()).data.user!.id;
    const { data } = await s.project_manager.from('change_orders').select('id, created_by');
    const foreign = ((data ?? []) as { created_by: string | null }[]).filter((r) => r.created_by !== pmUser);
    expect(foreign, 'the PM now reads other authors’ rows directly').toEqual([]);
  });
});
