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

// ---------------------------------------------------------------------------
// THE DECLARED EXPECTATION — today's measured truth, not today's ideal.
// ---------------------------------------------------------------------------
// `false` here is a RECORD OF A GAP, not an endorsement of it. #143 is open and
// its fix is to seed the missing assignment; when that lands this table changes
// and this file is where you find out.
const EXPECTED_REACH: Record<string, boolean> = {
  // Owner and admin need no assignment — can_view_project() admits them to
  // every project in the company.
  owner: true,
  admin: true,
  // Assigned on the project itself (it carries 4 assignment rows), not by the
  // seed script.
  project_manager: true,
  crew_member: true,
  // Seeded S114 specifically so A-33c's subcontractor arm is not vacuous.
  subcontractor: true,
  // ⚠️ #143. The seed assigns PM/foreman/crew to company A's ISOLATION fixture
  // project only; the foreman never got a row on this one, and unlike PM and
  // crew the project did not already carry one for them.
  foreman: false,
};

const reach = new Map<string, boolean>();

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

  for (const [role, email] of IDENTITIES) {
    const client = await sessionFor(email);
    const { data } = await client
      .from('projects')
      .select('id')
      .eq('id', SECTIONS_PROJECT)
      .maybeSingle();
    reach.set(role, data !== null);
  }

  // Printed unconditionally: when this file fails, the matrix is the first
  // thing worth seeing and re-running with a debugger to get it is a waste.
  const rows = IDENTITIES.map(([role]) => `${role.padEnd(16)} ${reach.get(role) ? 'REACHES' : 'no'}`);
  console.log(`\n#143 reach over ${SECTIONS_PROJECT}:\n${rows.join('\n')}\n`);
});

describe('#143 — the seeded identities reach exactly what is written down', () => {
  for (const [role] of IDENTITIES) {
    it(`${role} reach matches the declared expectation`, () => {
      expect(reach.get(role)).toBe(EXPECTED_REACH[role]);
    });
  }

  it('at least one identity CANNOT reach it — otherwise this guard is vacuous', () => {
    // If every identity reached every project the table would assert nothing.
    // This is the same paired-assertion discipline s113 uses for D-57.
    expect(Object.values(EXPECTED_REACH)).toContain(false);
  });

  it('⚠️ #143 IS STILL OPEN — the foreman cannot reach the mobile fixture project', () => {
    // A deliberately redundant, deliberately named assertion. It exists so the
    // gap appears in the test OUTPUT rather than only in a table a reader has
    // to interpret — and so that closing #143 breaks a test whose name says
    // what to do about it.
    expect(reach.get('foreman')).toBe(false);
  });
});

describe('#143 — the substitution the Part C suite makes is still necessary', () => {
  it('crew reaches the project, which is why crew stands in for foreman', () => {
    // M6M §4.11.11b ruling 4. If this ever fails, the substitution is not just
    // unnecessary — it is broken, and m-writes.spec.ts is asserting nothing.
    expect(reach.get('crew_member')).toBe(true);
  });

  it('the PM reaches it too — the contrast that proved #143 was identity-specific', () => {
    // Measured S117: the PM's row click succeeded in the same run the foreman's
    // timed out. That contrast is what ruled out "the project is broken".
    expect(reach.get('project_manager')).toBe(true);
  });
});
