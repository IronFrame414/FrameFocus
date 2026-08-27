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
  subcontractor: 20,
  client: 10,
};

/** Human-readable labels for display in the UI */
export const ROLE_LABELS: Record<CompanyRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  project_manager: 'Project Manager',
  foreman: 'Foreman',
  crew_member: 'Crew Member',
  subcontractor: 'Subcontractor',
  client: 'Client',
};

/**
 * Short descriptions shown in the invite form role picker.
 *
 * ⚠️ KEEPS ITS `client` ENTRY, deliberately. The key set is `InvitableRole` —
 * every role an INVITATION can carry — and a client invitation still exists; it
 * is created from the project's Contacts tab. Only `INVITABLE_ROLES` below,
 * which is the TEAM DROPDOWN, drops it. The form renders descriptions for the
 * roles in that list, so an unused entry here costs nothing and removing it
 * would make this record disagree with `invitations.role`.
 */
export const ROLE_DESCRIPTIONS: Record<InvitableRole, string> = {
  admin: 'Full access except billing and promoting to Admin',
  project_manager: 'Estimates, projects, finances, and team coordination',
  foreman: 'Field crew management, daily logs, and punch lists',
  crew_member: 'Clock in/out, daily logs, photos, and task updates',
  client: 'Portal access to project timeline, payments, and documents',
};

/**
 * Roles offered in the TEAM invite dropdown (`/dashboard/team/invite`).
 * Owner excluded — an owner is only created at sign-up.
 *
 * ===========================================================================
 * ⚠️ THIS IS NOT "EVERY ROLE AN INVITATION CAN CARRY" — `client` IS MISSING ON
 * PURPOSE. [#1-s168, RULED Josh S168; built S175 item 6]
 * ===========================================================================
 * _Superseded, quoted rather than deleted:_ this list read
 * `['admin', 'project_manager', 'foreman', 'crew_member', 'client']`, and
 * `invite-form.tsx` carried a SECOND, local copy of it — with descriptions —
 * which was the one the form actually rendered.
 *
 * Josh, from a click-test: *"client should be removed from team side."* A client
 * has no seat, no dashboard and nothing on that page applies to them, and the
 * invite the Team form offered them was a dead end.
 *
 * **`invitations.role` still accepts `'client'`, and the `InvitableRole` type
 * still includes it — both correctly.** A client invitation is a real thing; it
 * is created from the PROJECT's Contacts tab (`portal-panel.tsx` →
 * `POST /api/portal/invite` → `inviteClientToPortal()`), which is where M9 B.4
 * put it and where it belongs, because a portal account is created against a
 * CONTACT and a PROJECT — neither of which the Team form knows about.
 *
 * ⚠️ AND `subcontractor` IS ABSENT FOR A DIFFERENT REASON, not this one: it has
 * never been invitable here (it is not in `InvitableRole` at all). **Do not
 * "tidy" this list into `DASHBOARD_ROLES`** — that constant also excludes
 * `subcontractor`, and dropping subs from the Team side is a separate, unruled
 * scope decision [Josh, S175 Q6.1]. `TECH_DEBT` #1-s168 flags exactly that trap.
 */
export const INVITABLE_ROLES: InvitableRole[] = [
  'admin',
  'project_manager',
  'foreman',
  'crew_member',
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
 *
 * ---------------------------------------------------------------------------
 * ENFORCED BY `apps/web/lib/dashboard-access.ts` [Ruling A, Josh, S131]
 * ---------------------------------------------------------------------------
 * Read that file before changing this list. Two call sites consume it — the
 * `/dashboard` guard in `apps/web/middleware.ts` and the one in
 * `apps/web/app/dashboard/layout.tsx` — and both route a denied caller through
 * `dashboardDeniedRedirect()`, which owns the destinations (`subcontractor` ->
 * `/m/projects`, `client` -> a Module 9 placeholder).
 *
 * ⚠️ **REMOVING A ROLE FROM THIS LIST IS NOT ENOUGH TO BLOCK IT.** It also
 * needs a destination in `dashboardDeniedRedirect()`, or the guard admits it —
 * the function returns `null` for roles it does not recognise, which means
 * "allowed". `rolesWithoutDestination()` exists so a test can catch that pair
 * drifting; see `apps/web/test/s131-dashboard-access.test.ts`.
 *
 * ⚠️ **THIS LIST GUARDS ROUTES, NOT DATA.** Until S131 nothing consulted it at
 * all, and a subcontractor or client signing in read the company's full
 * contacts list, sub roster and team roster through `/dashboard` — the same row
 * counts an Owner saw. Enforcing it fixed the ROUTE; the tables were closed
 * separately by Ruling B's RLS policies, because `/m`, the API routes and any
 * direct PostgREST call never pass through a redirect.
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
