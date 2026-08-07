import { redirect } from 'next/navigation';
import { getMyProfile } from '@/lib/services/profiles';

// M6M D-54 / §4.11.10b — the route guard on the four gated DETAIL routes.
//
// ===========================================================================
// ⚠️ THIS GUARD IS THE ENTIRE ENFORCEMENT. RLS WILL NOT CATCH A BYPASS.
// ===========================================================================
// §4.11.10b's third conflict, quoted because it is the whole reason this file
// is written the way it is:
//
//   "the sub exclusion is UI-only on every read surface it still covers.
//    `change_orders`, `company_members`, `contacts` and `files` carry no
//    `subcontractor` arm on SELECT, so D-54's route guard is the entire
//    enforcement of what remains of D-53."
//
// Checked against the policies rather than taken on trust:
//
//   change_orders_select_visible          company_id + can_view_project(). No
//                                         role floor, no author scoping.
//                                         20260704215000:332-337. TECH_DEBT #117.
//   company_members_select_authenticated  company_id = get_my_company_id() and
//                                         NOTHING else. 20260704210000:81-83.
//   contacts_select_authenticated         company + is_deleted = false, no role
//                                         arm. 20260101000000:3267.
//   files_select_non_client               refuses `client` and floors
//                                         contracts/change_orders/invoices to
//                                         owner/admin (+PM for invoices). A
//                                         SUBCONTRACTOR PASSES IT — they are not
//                                         `client` — so the sub exclusion is
//                                         UI-only even though the CATEGORY floor
//                                         is real. 20260728000000:53-73.
//
// MEASURED, NOT INFERRED [S115]: signed in as the QA subcontractor, the database
// returned both change orders on a project they are assigned to, at full value —
// net_delta 1410 and 21385.91. Nothing at the database stopped it. That figure
// is the argument for this file: remove the guard and the data is right there.
//
// So: a `curl` with a subcontractor's token still reads every one of these rows.
// This guard is a real gate on the SCREEN and it is not a permission at the
// DATA layer. Do not let its existence read as enforcement it does not provide,
// and do not delete it on the assumption that RLS is behind it.
//
// ---------------------------------------------------------------------------
// WHAT IS NOT GUARDED HERE, AND WHY THAT IS CORRECT
// ---------------------------------------------------------------------------
// M-34 (punch item detail) takes NO guard. D-52's subcontractor exclusion was
// withdrawn [S110] and replaced by D-57's visibility NARROWING, which IS in the
// database (20260828000000_punch_subcontractor_visibility.sql). A sub who deep-
// links to an item that is neither assigned to them nor authored by them gets
// null from `getPunchItem()` and the page 404s — enforced by RLS, proven in
// test/s113-punch-sub-visibility.live.ts. Adding a role guard there would gate
// a screen D-52 deliberately opened, and §4.11.10a is explicit that gating a
// fourth surface "because there is a pattern now" exceeds D-54.
//
// ---------------------------------------------------------------------------
// THE ROLE IS `profiles.role`, NEVER `company_members.member_type`
// ---------------------------------------------------------------------------
// §4.11.10a's trap, and it is a live one: `member_type` permits `crew` |
// `subcontractor` and carries NO role, while `profiles_role_check` permits seven
// roles including `subcontractor`. rebuild-test holds 33 members with
// member_type='subcontractor' of which 32 have no profile at all. A build that
// tested member_type would exclude 32 roster rows that are not the signed-in
// user and gate precisely nothing.

/** The four surfaces D-53 still excludes subcontractors from. */
export type GatedSurface = 'co' | 'member' | 'contact' | 'file';

/**
 * Block subcontractors from a gated detail route, server-side, before render.
 *
 * D-54's second obligation. The first — hiding the affordance — belongs to the
 * list screen, and is cosmetic on top of this. A build that ships only the
 * hidden row has shipped no permission at all.
 *
 * On refusal it redirects to `backTo` with `?denied=<surface>`, which A-66
 * requires: the destination must explain itself rather than bounce silently.
 * The user lands on the LIST they came from — still usable — not on the hub.
 */
export async function requireDetailAccess(
  surface: GatedSurface,
  backTo: string
): Promise<void> {
  const profile = await getMyProfile();

  // No profile is not this guard's problem — app/m/layout.tsx owns the auth
  // gate. Refusing here too would turn a signed-out user's 302-to-sign-in into
  // a confusing "not available to subcontractors" message.
  if (!profile) return;

  if (profile.role === 'subcontractor') {
    redirect(`${backTo}?denied=${surface}`);
  }
}

/**
 * The same test, for HIDING the affordance on a list (D-54's step 1).
 *
 * Separate from the guard on purpose: a list already has the profile in hand
 * and must not redirect. Keeping them as two functions over one shared
 * predicate is what stops the two steps drifting apart — §4.11.10a names
 * "two places to keep in sync" as Option A's one real cost.
 */
export function canReachDetail(role: string | null | undefined): boolean {
  return role !== 'subcontractor';
}
