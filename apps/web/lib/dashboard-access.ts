import { DASHBOARD_ROLES, type CompanyRole } from '@framefocus/shared';

/**
 * RULING A [Josh, S131] — `DASHBOARD_ROLES`, enforced.
 *
 * Spec: `packages/shared/constants/roles.ts`. Amendments: `docs/specs/5I-spec.md` §6.
 *
 * ---------------------------------------------------------------------------
 * THIS IS ENFORCEMENT, NOT REDEFINITION
 * ---------------------------------------------------------------------------
 * `DASHBOARD_ROLES` already excluded `subcontractor` and `client`, and had done
 * since it was written. What it did NOT have was a single caller — a repo-wide
 * grep found the declaration and three comments. So the rule was true on paper
 * and false in the product: measured on rebuild-test as the real QA identities,
 * a subcontractor and a client each read the company's full contacts list, sub
 * roster and team roster through `/dashboard`. Not an empty shell — the same
 * 6 / 4 / 7 rows the Owner sees.
 *
 * ⚠️ DO NOT CHANGE THE CONSTANT'S CONTENTS to alter who is allowed in. It is
 * the ruling; this file is the mechanism.
 *
 * ---------------------------------------------------------------------------
 * WHY A HELPER RATHER THAN AN `includes()` AT EACH SITE
 * ---------------------------------------------------------------------------
 * M6M D-54 requires role-gated surfaces to be BOTH hidden and route-guarded, so
 * there is necessarily more than one call site (middleware and the dashboard
 * layout). Two `includes()` calls are two places to disagree about what
 * "denied" means and where a denied caller goes — the CLAUDE.md §PARITY shape,
 * where a second implementation that "does the same thing" IS the divergence.
 * The destinations live here with the predicate, so neither caller owns them.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ ROUTING ONLY. THIS PROTECTS NO DATA.
 * ---------------------------------------------------------------------------
 * A redirect changes what is REACHED, never what is READABLE. The rows above
 * come back from RLS, and RLS does not know what a route is: `/m`, an API
 * handler and a raw PostgREST call all read the same tables. Ruling B is the
 * half that closes that, and it is deliberately a separate change on separate
 * tables. **A without B leaves the exposure live everywhere except one route
 * tree.**
 */

/** `/m/projects` — subs already live on `/m`, and the sub thread is there. */
export const SUBCONTRACTOR_HOME_PATH = '/m/projects';

/**
 * The client portal. **`/portal` is now a real route tree** — `app/portal/`.
 *
 * ⚠️ RENAMED AND REPOINTED [S164]. _Superseded, quoted rather than deleted:_
 *
 * > *"⚠️ A HOLDING PAGE, NOT A PORTAL, AND THE NAME SAYS SO ON PURPOSE. The
 * > client portal does not exist … It is deliberately NOT `/portal`. The
 * > Pre-Module 9 gate — hosted portal vs. email plus magic-link tokenised
 * > pages — is **open and untouched** [S131], and claiming `/portal` would
 * > quietly presume the hosted answer."*
 *
 * **The gate is closed: R1 [Josh, S164] — WE host the portal, with accounts**
 * (the product name is deliberately not written out here; `brand-literals`
 * forbids the pre-rebrand one and `lib/brand.ts` owns the current one). So the presumption the old comment refused to make has been made
 * deliberately, by ruling, and `/client-placeholder` is deleted rather than
 * left as a second destination nothing points at.
 *
 * The CONSTANT keeps its old name on purpose for now — renaming it in the same
 * commit that repoints it would make a one-line change look like a sweep, and
 * the name is referenced by the S131 unit tests that prove the pairing below.
 */
export const CLIENT_PLACEHOLDER_PATH = '/portal';

/** Whether this role may reach `/dashboard` at all. */
export function isDashboardRole(role: string | null | undefined): boolean {
  if (!role) return false;
  return (DASHBOARD_ROLES as string[]).includes(role);
}

/**
 * Where a caller blocked from `/dashboard` goes — `null` means "not blocked".
 *
 * ⚠️ AN UNKNOWN ROLE RETURNS `null`, WHICH ADMITS IT. That looks like the wrong
 * default for a guard and is the right one here, because this guard's only job
 * is the two roles the ruling names. A caller with no profile row yet, or a
 * role this build has never heard of, must not be bounced to a placeholder
 * written for clients — the layout's own `if (!profile) redirect('/sign-in')`
 * is the correct handler for "we do not know who this is", and it already
 * exists. Fail-open HERE is safe precisely because Ruling B means the data does
 * not depend on this answer.
 */
export function dashboardDeniedRedirect(role: string | null | undefined): string | null {
  if (role === 'subcontractor') return SUBCONTRACTOR_HOME_PATH;
  if (role === 'client') return CLIENT_PLACEHOLDER_PATH;
  return null;
}

/**
 * The two lists must not drift apart. If a future ruling removes a role from
 * `DASHBOARD_ROLES` without giving it a destination here, that role would be
 * "not a dashboard role" and yet get `null` from the function above — admitted
 * by the guard, which is silently the old bug back again.
 *
 * Exported so a unit test can assert the pairing rather than trusting it, and
 * called nowhere in the product.
 */
export function rolesWithoutDestination(all: CompanyRole[]): CompanyRole[] {
  return all.filter((r) => !isDashboardRole(r) && dashboardDeniedRedirect(r) === null);
}
