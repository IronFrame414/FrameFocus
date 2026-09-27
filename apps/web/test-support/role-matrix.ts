import type { CompanyRole } from '@framefocus/shared/types/roles';

// ===========================================================================
// S112 queue 3 — role-permission tests are TOTAL MAPS, or they test nothing
// about the role nobody listed.
// ===========================================================================
// ⚠️ WHY. `payments-shared.test.ts` asserted `canIssueRefund` for owner, admin
// and project_manager, by hand. When `project_executive` was added (S111), the
// test kept passing while saying NOTHING about the new role — and in the same
// week a mis-applied patch gave `canIssueRefund` the Project Executive's body,
// i.e. refund authority. Nothing failed. See CLAUDE.md → "Never reformat a file
// the repo does not already format".
//
// HOW. The expected answers are a `Record<CompanyRole, T>`. TypeScript requires
// every key, so ADDING A ROLE TO `CompanyRole` FAILS TO COMPILE until every
// permission test states that role's answer. The test files are type-checked
// in CI (`tsc --noEmit` includes `**/*.ts`), so this is a CI failure, not a
// warning. `forEveryRole` then asserts each key — no role can be listed and
// silently skipped.
//
// And the strings a predicate must NEVER admit (unknown roles, wrong case) are
// asserted by `forJunkRoles`, because a total map covers only real roles.
// ===========================================================================

/** Iterate EVERY role in the map, in a stable order, with its expected answer. */
export function forEveryRole<T>(
  expected: Record<CompanyRole, T>,
  check: (role: CompanyRole, expected: T) => void
): void {
  for (const role of (Object.keys(expected) as CompanyRole[]).sort()) check(role, expected[role]);
}

/** Strings that are not roles. Every predicate must fail closed on these. */
export const JUNK_ROLES: readonly string[] = ['', 'OWNER', 'Owner', 'superadmin', 'owner '];
