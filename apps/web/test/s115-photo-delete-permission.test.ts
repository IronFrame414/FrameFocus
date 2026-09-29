import { describe, expect, it } from 'vitest';
import type { CompanyRole } from '@framefocus/shared/types/roles';
import { forEveryRole, JUNK_ROLES } from '@/test-support/role-matrix';
import { canDeletePhoto } from '@/lib/photos/delete-permission';

// C-11 [S115] — the ONE rule both surfaces read for "may this role delete a
// project photo". A TOTAL map (CLAUDE.md, "Role-permission tests are TOTAL
// maps"): adding a role fails to compile here until it states its answer.
//
// Owner/Admin/PM/PE — RULED [Josh, S116 Q11]. SUPERSEDED, quoted: "Owner/Admin
// only — the narrower of two written answers (M6M A-25d vs the CLAUDE.md
// approvals table), pending Josh [S115 ASK-C11-ROLES]. If he widens it, flip
// project_manager / project_executive here IN PLACE, quoting this line."
// Was: project_executive: false, project_manager: false.
const EXPECTED: Record<CompanyRole, boolean> = {
  owner: true,
  admin: true,
  project_executive: true,
  project_manager: true,
  foreman: false,
  crew_member: false,
  client: false,
  subcontractor: false,
};

describe('canDeletePhoto — who is offered "Delete photo" on /m and desktop', () => {
  forEveryRole(EXPECTED, (role, allowed) => {
    it(`${role} → ${allowed ? 'offered' : 'not offered'}`, () => {
      expect(canDeletePhoto(role)).toBe(allowed);
    });
  });

  it('fails closed on anything that is not a role', () => {
    for (const junk of [...JUNK_ROLES, null, undefined]) expect(canDeletePhoto(junk)).toBe(false);
  });
});
