// ============================================================
// Role constants — shared across web + mobile
// ============================================================

import type { CompanyRole, InvitableRole } from '../types/roles';

/**
 * Role hierarchy — higher number = more access.
 * Used for "can this user manage that user" checks.
 */
export const ROLE_HIERARCHY: Record<CompanyRole, number> = {
  owner: 100,
  admin: 90,
  project_manager: 70,
  foreman: 50,
  crew_member: 30,
  client: 10,
};

/** Human-readable labels for display in the UI */
export const ROLE_LABELS: Record<CompanyRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  project_manager: 'Project Manager',
  foreman: 'Foreman',
  crew_member: 'Crew Member',
  client: 'Client',
};

/** Short descriptions shown in the invite form role picker */
export const ROLE_DESCRIPTIONS: Record<InvitableRole, string> = {
  admin: 'Full access except billing and promoting to Admin',
  project_manager: 'Estimates, projects, finances, and team coordination',
  foreman: 'Field crew management, daily logs, and punch lists',
  crew_member: 'Clock in/out, daily logs, photos, and task updates',
  client: 'Portal access to project timeline, payments, and documents',
};

/** Roles available in the invite dropdown (owner excluded) */
export const INVITABLE_ROLES: InvitableRole[] = [
  'admin',
  'project_manager',
  'foreman',
  'crew_member',
  'client',
];

/**
 * Check if roleA outranks roleB in the hierarchy.
 * Example: canManage('owner', 'admin') → true
 */
export function canManageRole(managerRole: CompanyRole, targetRole: CompanyRole): boolean {
  return ROLE_HIERARCHY[managerRole] > ROLE_HIERARCHY[targetRole];
}

/**
 * Roles that have access to the management dashboard (web).
 * Client only sees the portal.
 */
export const DASHBOARD_ROLES: CompanyRole[] = [
  'owner',
  'admin',
  'project_manager',
  'foreman',
  'crew_member',
];

/**
 * Roles that can manage team members (invite, remove, change roles).
 */
export const TEAM_MANAGEMENT_ROLES: CompanyRole[] = ['owner', 'admin'];
