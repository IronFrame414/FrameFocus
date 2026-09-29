import { describe, expect, it } from 'vitest';
import type { CompanyRole } from '@framefocus/shared/types/roles';
import { forEveryRole, JUNK_ROLES } from '@/test-support/role-matrix';
import { canAuthorEstimates, canReadEstimates } from '@/lib/estimate-access';

// S115 R11 — who reaches the estimate screens, as TOTAL maps (CLAUDE.md:
// "Role-permission tests are TOTAL maps"). The deny is asserted with the allow.
//
// READ: + project_executive [R11, Josh 2026-09-28] — which estimates it sees is
// RLS's answer (converted, on an assigned project), not this list's.
// AUTHOR: + project_executive [S119 D-2, Josh 2026-09-29: "PE can create."] — which
// estimates it may BUILD is RLS's answer (assigned to it), not this list's; it still
// sends nothing (proposal routes stay Owner/Admin). _Superseded, quoted:_ "AUTHOR:
// unchanged — the PE builds nothing and sends nothing (ASK-20, taken A; R1
// carve-out 2 keeps sending, which starts the client contract, off it)."
const READ: Record<CompanyRole, boolean> = {
  owner: true,
  admin: true,
  project_executive: true,
  project_manager: true,
  foreman: false,
  crew_member: false,
  client: false,
  subcontractor: false,
};
const AUTHOR: Record<CompanyRole, boolean> = {
  owner: true,
  admin: true,
  project_executive: true, // [S119 D-2] _was:_ `project_executive: false,`
  project_manager: true,
  foreman: false,
  crew_member: false,
  client: false,
  subcontractor: false,
};

describe('canReadEstimates — the four estimate pages, proposal-data and the nav entry', () => {
  forEveryRole(READ, (role, allowed) => {
    it(`${role} → ${allowed}`, () => expect(canReadEstimates(role)).toBe(allowed));
  });
  it('fails closed on non-roles', () => {
    for (const j of [...JUNK_ROLES, null, undefined]) expect(canReadEstimates(j)).toBe(false);
  });
});

describe('canAuthorEstimates — "+ New Estimate" and authoring', () => {
  forEveryRole(AUTHOR, (role, allowed) => {
    it(`${role} → ${allowed}`, () => expect(canAuthorEstimates(role)).toBe(allowed));
  });
  it('fails closed on non-roles', () => {
    for (const j of [...JUNK_ROLES, null, undefined]) expect(canAuthorEstimates(j)).toBe(false);
  });
});
