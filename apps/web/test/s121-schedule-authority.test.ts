import { describe, expect, it } from 'vitest';
import type { CompanyRole } from '@framefocus/shared/types/roles';
import { forEveryRole, JUNK_ROLES } from '@/test-support/role-matrix';
import { canAddToProjectFromSchedule, canSchedule } from '@/lib/schedule/authority';

// S121 5-F — TOTAL MAPS (CLAUDE.md: every role states its answer; junk fails
// closed). Presentation gates; the database refusals are the live test.

const SCHEDULE: Record<CompanyRole, boolean> = {
  owner: true,
  admin: true,
  project_executive: true, // ASK-31: existing project-scoped arms untouched
  project_manager: true,
  foreman: true,
  crew_member: false,
  client: false,
  subcontractor: false,
};
const ADD_TO_PROJECT: Record<CompanyRole, boolean> = {
  owner: true,
  admin: true,
  project_executive: true,
  project_manager: true,
  foreman: false, // ASK-32: the project page's authority — not a foreman
  crew_member: false,
  client: false,
  subcontractor: false,
};

describe('canSchedule — create, drag, resize', () => {
  forEveryRole(SCHEDULE, (role, may) => {
    it(`${role} → ${may}`, () => expect(canSchedule(role)).toBe(may));
  });
  for (const junk of JUNK_ROLES) {
    it(`junk ${JSON.stringify(junk)} → false`, () => expect(canSchedule(junk as string)).toBe(false));
  }
});

describe('canAddToProjectFromSchedule — the sheet’s "+ Not on project"', () => {
  forEveryRole(ADD_TO_PROJECT, (role, may) => {
    it(`${role} → ${may}`, () => expect(canAddToProjectFromSchedule(role)).toBe(may));
  });
  for (const junk of JUNK_ROLES) {
    it(`junk ${JSON.stringify(junk)} → false`, () =>
      expect(canAddToProjectFromSchedule(junk as string)).toBe(false));
  }
});
