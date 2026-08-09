import { describe, it, expect, beforeAll } from 'vitest';
import { admin, assertRebuildTest, sessionFor } from './live-session';

// ============================================================================
// TECH_DEBT #143 — every seeded identity's reach over the fixture projects,
// asserted against a DECLARED expectation so drift fails once and loudly.
// ============================================================================
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS: A MISSING ASSIGNMENT IS A *SILENT* TEST-SUITE FAILURE
// ---------------------------------------------------------------------------
// Found S117, writing M6M Part C. Five of twenty-one Playwright tests failed
// and the failures were the discovery rather than a build defect:
// `josh+qa-foreman@` is seeded, signs in, has a member row — and is **not
// assigned to the m-sections project**. `change_orders_select_visible` is
// `company_id + can_view_project()`, so the foreman's M-13 is empty and
// `getProject()` returns null, which 404s M-33 outright.
//
// **The dangerous part is not the five failures. It is the assertions that
// would have PASSED.** A role-exclusion suite is built on statements of the
// form "role X does NOT see Y". Every one of those passes when X sees nothing
// at all — for the wrong reason, silently, forever. #127 was the same class of
// fixture gap but failed loudly; this one does not.
//
// So the guard is not "can everyone see everything" (they must not — that would
// defeat the isolation fixtures). It is: **the reach of every identity is
// WRITTEN DOWN, and any change to it breaks this file.** A future seed that
// grants the foreman the assignment fails here, and the fix is to update the
// table — which is exactly the moment someone should also revert the
// crew-for-foreman substitutions in `e2e/m-writes.spec.ts` (M6M §4.11.11b,
// ruling 4).
//
// ---------------------------------------------------------------------------
// WHAT "REACH" MEANS HERE, PRECISELY
// ---------------------------------------------------------------------------
// A plain RLS-scoped `select id from projects where id = …` through the
// identity's own JWT. That is the same predicate every screen depends on
// (`projects_select_*` → `can_view_project()`), and it is what `getProject()`
// does. Deliberately NOT a count of change orders or punch items: those add a
// second policy and would blur *why* an identity sees nothing.

const IDENTITIES = [
  ['owner', 'josh+test50@worthprop.com'],
  ['admin', 'josh+qa-admin@worthprop.com'],
  ['project_manager', 'josh+pm@worthprop.com'],
  ['foreman', 'josh+qa-foreman@worthprop.com'],
  ['crew_member', 'josh+crew@worthprop.com'],
  ['subcontractor', 'josh+qa-sub@worthprop.com'],
] as const;

/** The project every mobile Playwright spec drives. */
const SECTIONS_PROJECT = 'eaf0e25b-d60e-49c0-89b2-5612118d94b4';

/**
 * Company B's fixture project — the CROSS-TENANT negative.
 *
 * ⚠️ THIS IS WHAT KEEPS THE GUARD FROM BEING VACUOUS, and it became necessary
 * the moment #143 closed. While the foreman could not reach the m-sections
 * project, the table below contained a `false` and that alone proved the check
 * could distinguish reach from no-reach. Now every company-A identity reaches
 * every company-A project, so a `can_view_project()` that simply returned TRUE
 * for everything would satisfy the whole first table.
 *
 * Company B is a different tenant: no company-A identity may reach it, by
 * `company_id` rather than by assignment. Asserting both directions is the same
 * paired-assertion discipline `s113` uses for D-57.
 */
const COMPANY_B_PROJECT_NAME = 'QA B — isolation fixture';

// ---------------------------------------------------------------------------
// THE DECLARED EXPECTATION — today's measured truth, not today's ideal.
// ---------------------------------------------------------------------------
// ✅ #143 CLOSED [S119]. `josh+qa-foreman@` now carries a `project_assignments`
// row on this project, seeded idempotently alongside PM and crew by
// `scripts/seed-test-identities.mjs`. Before that it was the one identity that
// could not reach the project every mobile spec drives — so every "the foreman
// does NOT see X" assertion passed VACUOUSLY, silently, for the wrong reason.
const EXPECTED_REACH: Record<string, boolean> = {
  // Owner and admin need no assignment — can_view_project() admits them to
  // every project in the company.
  owner: true,
  admin: true,
  // Assigned on the project itself (it carries its own assignment rows).
  project_manager: true,
  crew_member: true,
  // Seeded S114 specifically so A-33c's subcontractor arm is not vacuous.
  subcontractor: true,
  // Seeded S119 — TECH_DEBT #143. The seed had only ever given this identity a
  // row on company A's ISOLATION fixture project, never on this one.
  foreman: true,
};

const reach = new Map<string, boolean>();
const crossTenantReach = new Map<string, boolean>();

beforeAll(async () => {
  assertRebuildTest();

  const { data: project } = await admin
    .from('projects')
    .select('id')
    .eq('id', SECTIONS_PROJECT)
    .maybeSingle();
  if (!project) {
    throw new Error(
      `${SECTIONS_PROJECT} does not exist. The mobile Playwright specs' PROJECT constant has ` +
        'moved; update this harness and e2e/m-writes.spec.ts together.'
    );
  }

  const { data: bProject } = await admin
    .from('projects')
    .select('id')
    .eq('name', COMPANY_B_PROJECT_NAME)
    .single();

  for (const [role, email] of IDENTITIES) {
    const client = await sessionFor(email);

    const { data } = await client
      .from('projects')
      .select('id')
      .eq('id', SECTIONS_PROJECT)
      .maybeSingle();
    reach.set(role, data !== null);

    const { data: cross } = await client
      .from('projects')
      .select('id')
      .eq('id', bProject!.id)
      .maybeSingle();
    crossTenantReach.set(role, cross !== null);
  }

  // Printed unconditionally: when this file fails, the matrix is the first
  // thing worth seeing and re-running with a debugger to get it is a waste.
  const rows = IDENTITIES.map(
    ([role]) =>
      `${role.padEnd(16)} own=${reach.get(role) ? 'REACHES' : 'no'.padEnd(7)}  ` +
      `companyB=${crossTenantReach.get(role) ? 'REACHES' : 'no'}`
  );
  console.log(`\n#143 reach over ${SECTIONS_PROJECT} (and the cross-tenant negative):\n${rows.join('\n')}\n`);
});

describe('#143 — the seeded identities reach exactly what is written down', () => {
  for (const [role] of IDENTITIES) {
    it(`${role} reach matches the declared expectation`, () => {
      expect(reach.get(role)).toBe(EXPECTED_REACH[role]);
    });
  }

  it('✅ #143 IS CLOSED — the foreman reaches the mobile fixture project', () => {
    // Deliberately redundant and deliberately named, so the state appears in
    // the test OUTPUT rather than only in a table a reader has to interpret.
    // Its previous form asserted `false` and said "#143 IS STILL OPEN"; seeding
    // the assignment broke it, which is exactly what it was built to do.
    expect(reach.get('foreman')).toBe(true);
  });
});

// ===========================================================================
// THE NEGATIVE HALF — without it the table above asserts nothing
// ===========================================================================
// Every company-A identity now reaches every company-A project, so "reach" on
// its own can no longer distinguish a working `can_view_project()` from one
// that returns TRUE unconditionally. Company B is a different tenant.
describe('#143 — the guard is not vacuous: nobody crosses tenants', () => {
  for (const [role] of IDENTITIES) {
    it(`${role} does NOT reach company B's project`, () => {
      expect(crossTenantReach.get(role)).toBe(false);
    });
  }

  it('and the same sessions DO reach their own — both directions, same clients', () => {
    // Stated as one assertion over the whole set: the identities that were just
    // refused company B are the identities that reach company A. A harness
    // whose sessions were simply broken would fail here rather than passing the
    // refusals above for the wrong reason.
    for (const [role] of IDENTITIES) {
      expect(reach.get(role), `${role} should reach its own company's project`).toBe(true);
    }
  });
});
