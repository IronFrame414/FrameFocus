import { describe, expect, it } from 'vitest';
import type { CompanyRole } from '@framefocus/shared/types/roles';
import { forEveryRole, JUNK_ROLES } from '@/test-support/role-matrix';
import { canTrashFile } from '@/lib/photos/delete-permission';

// [S118 #171] Who is OFFERED Delete (to Trash) on the Files tab and Restore on
// the Trash page — the same list the database enforces for moving any file to or
// from Trash (enforce_files_column_scope, 20262030000000; proved per role by
// test/s118-ruled-fixes.live.ts). A TOTAL map: a new role fails to compile here.
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

describe('canTrashFile — Files-tab Delete and Trash Restore', () => {
  forEveryRole(EXPECTED, (role, allowed) => {
    it(`${role} → ${allowed ? 'offered' : 'not offered'}`, () => {
      expect(canTrashFile(role)).toBe(allowed);
    });
  });

  it('fails closed on anything that is not a role', () => {
    for (const junk of [...JUNK_ROLES, null, undefined]) expect(canTrashFile(junk)).toBe(false);
  });
});
