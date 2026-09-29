import { describe, expect, it } from 'vitest';
import type { CompanyRole } from '@framefocus/shared/types/roles';
import { JUNK_ROLES, forEveryRole } from '@/test-support/role-matrix';
import { canRenameProject } from '@/lib/projects/rename-access';

// S118 item 14 — which role sees the Rename control. The database decides the
// write (test/s118-project-rename.live.ts); this pins the UI to the same answer.
const RENAME: Record<CompanyRole, boolean> = {
  owner: true,
  admin: true,
  project_executive: false,
  project_manager: false,
  foreman: false,
  crew_member: false,
  client: false,
  subcontractor: false,
};

describe('canRenameProject — Owner/Admin (total map)', () => {
  forEveryRole(RENAME, (role, may) => {
    it(`${role} → ${may}`, () => expect(canRenameProject(role)).toBe(may));
  });
  it.each(JUNK_ROLES.map((r) => [r]))('junk role %j fails closed', (r) => {
    expect(canRenameProject(r)).toBe(false);
  });
  it('null/undefined fail closed', () => {
    expect(canRenameProject(null)).toBe(false);
    expect(canRenameProject(undefined)).toBe(false);
  });
});
