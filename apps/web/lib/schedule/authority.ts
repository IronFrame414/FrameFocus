// S121 5-F — WHO MAY SCHEDULE, AND WHO MAY ADD SOMEONE TO A PROJECT FROM THE
// SCHEDULE. ⚠️ PRESENTATION ONLY: these decide which controls RENDER. The
// database decides what is WRITTEN (schedule_entries_insert/update_authorized,
// tasks_update_authorized, task_assignees_*, project_assignments_insert_*),
// and test/s121-schedule-authority.live.ts proves each refusal there.
//
//   SCHEDULE (create, drag, resize)  owner, admin, PM, foreman [RULED Josh,
//     ASK-5] — plus a PE, whose EXISTING project-scoped arms are untouched
//     (ASK-31; the DB limits them to their own projects). NOT crew, NOT a
//     subcontractor, NOT a client.
//   ADD TO PROJECT (the sheet's "+ Not on project")  the project page's own
//     authority [ASK-32]: owner, admin, PM (on the project), PE (on the
//     project). NOT a foreman.
//
// ⚠️ DIFFERS FROM TIMESHEETS (Owner/Admin edit — Part 4). Not merged.

import type { CompanyRole } from '@framefocus/shared/types/roles';

export const SCHEDULE_ROLES: readonly CompanyRole[] = [
  'owner',
  'admin',
  'project_manager',
  'foreman',
  'project_executive',
];
export const ADD_TO_PROJECT_ROLES: readonly CompanyRole[] = [
  'owner',
  'admin',
  'project_manager',
  'project_executive',
];

export function canSchedule(role: string | null | undefined): boolean {
  return typeof role === 'string' && (SCHEDULE_ROLES as readonly string[]).includes(role);
}
export function canAddToProjectFromSchedule(role: string | null | undefined): boolean {
  return typeof role === 'string' && (ADD_TO_PROJECT_ROLES as readonly string[]).includes(role);
}
