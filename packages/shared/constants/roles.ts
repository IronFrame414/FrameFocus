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
  // [S111] Senior to a PM on its own projects. ⚠️ Admin outranks it here, but
  // Admin may NOT grant or edit it (Q11) — that is OWNER_ONLY_GRANT_ROLES, not
  // this number. Never infer grant authority from the hierarchy.
  project_executive: 80,
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
  project_executive: 'Project Executive',
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
  project_executive: 'Full access to their assigned projects, money included. No company settings.',
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
  'project_executive',
  'project_manager',
  'foreman',
  'crew_member',
];

/**
 * Roles ONLY the Owner may grant — by invitation or by changing someone's role —
 * and whose holders an Admin may not edit. [Admin Role Principle; S111 Q11:
 * `project_executive` is "Owner only, like promoting to Admin".]
 *
 * The ONE list every grant path reads: the Team edit action, the invite API and
 * the invite form's options. The database enforces the same set
 * (`profiles_update_admin`, `invitations_{insert,update}_owner_admin`,
 * 20261820000000) — this constant is the UI/route mirror of it, not the floor.
 */
export const OWNER_ONLY_GRANT_ROLES: readonly CompanyRole[] = [
  'owner',
  'admin',
  'project_executive',
];

export function isOwnerOnlyGrant(role: string | null | undefined): boolean {
  return !!role && (OWNER_ONLY_GRANT_ROLES as readonly string[]).includes(role);
}

/**
 * Roles that EXIST — in `CompanyRole`, in `profiles_role_check` and
 * `invitations_role_check` — but are NOT OFFERED to anyone granting a role.
 * [S181 Q3, RULED Josh]
 *
 * `project_executive` sees its projects' money (S111 Part One), but its
 * operational arms — files, tasks, schedule, POs, roster — are on a follow-up
 * branch. Until they land, an Owner is not offered a role that cannot upload a
 * photo. **The schema keeps it**: this removes it from the OFFER, not the
 * database. Remove it from here when the operational arms merge.
 *
 * ⚠️ THE ONE SOURCE. The invite form, the Team edit form (both option lists)
 * and the two grant paths (`POST /api/invites`, `updateTeamMemberAction`) all
 * read `OFFERED_ROLES` / `isWithheldRole` — never a second hand-edited list.
 */
// [S114 PART A, FILL-A-6 — the LAST step, RULED R2] Superseded, quoted rather
// than deleted: `= ['project_executive']`. The operational arms landed
// (20261940–1980000000, on production) and the two carve-outs were proven
// negatively first (test/s114-pe-carveouts.live.ts), so the role is offered
// again — still Owner-only to grant (OWNER_ONLY_GRANT_ROLES). The mechanism
// stays for the next role that needs holding back.
export const WITHHELD_ROLES: readonly CompanyRole[] = [];

export function isWithheldRole(role: string | null | undefined): boolean {
  return !!role && (WITHHELD_ROLES as readonly string[]).includes(role);
}

/** What a grant UI offers: `INVITABLE_ROLES` minus `WITHHELD_ROLES`, in order. */
export const OFFERED_ROLES: readonly InvitableRole[] = INVITABLE_ROLES.filter(
  (role) => !isWithheldRole(role)
);

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
  'project_executive',
  'project_manager',
  'foreman',
  'crew_member',
];

/**
 * Roles that can manage team members (invite, remove, change roles).
 */
export const TEAM_MANAGEMENT_ROLES: CompanyRole[] = ['owner', 'admin'];

/**
 * [S111 Part One] WHO SEES A PROJECT'S MONEY — contract value, budgeted/sell,
 * variance and margin, change-order dollars and rates, invoices and their
 * totals, client payments and retainage on THAT project.
 *
 * ⚠️ THIS IS VISIBILITY OF WHAT THE DATABASE ALREADY RETURNS, NOT A FLOOR.
 * `project_executive` reads money only on its assigned projects because the
 * RLS arms say so (20261830000000); a project it is not on never reaches a
 * page that asks this question. A renderer omitting a column is not a floor
 * (#136) — and equally, a renderer hiding what the database permits makes the
 * role Josh ruled ("full access to the projects it is on, money included",
 * S111 RULED 2) not exist from a user's point of view.
 *
 * ⚠️ PROJECT, NOT COMPANY. Portfolio totals, company dashboards, the company
 * margin target and cross-project labor cost use `seesCompanyMoney()`, which
 * is Owner/Admin only (RULED 3a: no company-level money).
 *
 * One list, read by desktop and /m alike (PARITY). Add a role here, never to
 * an inline `['owner', 'admin']` at a call site.
 */
export const PROJECT_MONEY_ROLES: readonly CompanyRole[] = ['owner', 'admin', 'project_executive'];

export function seesProjectMoney(role: string | null | undefined): boolean {
  return !!role && (PROJECT_MONEY_ROLES as readonly string[]).includes(role);
}

/**
 * [S114 PART A] WHO RUNS A PROJECT'S OPERATIONS — the one answer every UI gate
 * and route reads for project work, desktop and /m alike (PARITY).
 *
 *   'manage'    — POs, selections, the project team and contacts, project
 *                 status, bills and commitments, budget lines at capture.
 *   'supervise' — 'manage' plus the field layer only: tasks/phases/inspections
 *                 in the schedule panel, punch verify/delete, selection notes.
 *   'none'      — neither.
 *
 * ⚠️ A TOTAL MAP: adding a role to `CompanyRole` fails to compile until it
 * answers here. It replaced 3–7 hand-written copies of
 * `['owner','admin','project_manager'(,'foreman')]` that each omitted the
 * Project Executive — the shape `/m`'s `readsChangeOrders()` shipped in S181.
 *
 * ⚠️ THIS IS NOT THE FLOOR. The database decides which PROJECTS: a Project
 * Executive manages only the projects it is assigned to
 * (`pe_on_project()`, 20261940000000); a PM, as ever, by assignment where the
 * policy says so. This only decides whether a control is OFFERED.
 *
 * ⚠️ NOT FOR the carve-outs (refunds: `canIssueRefund`; contracts:
 * `canManageContracts`) nor company-level surfaces (catalog management,
 * directories, estimates, timesheets) — each keeps its own predicate.
 */
export const PROJECT_OPERATIONS: Record<CompanyRole, 'manage' | 'supervise' | 'none'> = {
  owner: 'manage',
  admin: 'manage',
  project_executive: 'manage',
  project_manager: 'manage',
  foreman: 'supervise',
  crew_member: 'none',
  subcontractor: 'none',
  client: 'none',
};

function projectOperationsOf(role: string | null | undefined): 'manage' | 'supervise' | 'none' {
  // hasOwnProperty, not `in`: 'constructor' is `in` every object literal.
  return role && Object.prototype.hasOwnProperty.call(PROJECT_OPERATIONS, role)
    ? PROJECT_OPERATIONS[role as CompanyRole]
    : 'none';
}

/** POs, selections, project team/contacts, project status, bills. See PROJECT_OPERATIONS. */
export function managesProjectOperations(role: string | null | undefined): boolean {
  return projectOperationsOf(role) === 'manage';
}

/** 'manage' plus the field layer: schedule panel, punch verify/delete, selection notes. */
export function supervisesProjectWork(role: string | null | undefined): boolean {
  return projectOperationsOf(role) !== 'none';
}

/**
 * [S114 Q8 A] Who gets a project's alerts BY ASSIGNMENT (CO signed, PO line
 * missing, daily log missing, delivery discrepancy): the managers of project
 * operations who are not Owner/Admin — those two get them by role, company-wide.
 * The caller supplies only people ASSIGNED to the project, so a Project
 * Executive hears about its own projects and no others.
 */
export function receivesAssignedProjectAlerts(role: string | null | undefined): boolean {
  return managesProjectOperations(role) && role !== 'owner' && role !== 'admin';
}

/** Company-level money: portfolio totals, margin target, cross-project cost. Owner/Admin only. */
export function seesCompanyMoney(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'admin';
}
