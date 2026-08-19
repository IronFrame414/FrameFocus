import { redirect } from 'next/navigation';
import { getMyProfile } from '@/lib/services/profiles';

// M6M D-54 / §4.11.10b — the route guard on the four gated DETAIL routes.
//
// ===========================================================================
// ⚠️ ONE OF THESE FOUR SURFACES IS STILL UI-ONLY. THREE ARE NOW DB-ENFORCED.
// ===========================================================================
// [M6-01, S163 — CORRECTED. The superseded text is quoted below, not deleted.]
//
// §4.11.10b's third conflict is why this file exists:
//
//   "the sub exclusion is UI-only on every read surface it still covers.
//    `change_orders`, `company_members`, `contacts` and `files` carry no
//    `subcontractor` arm on SELECT, so D-54's route guard is the entire
//    enforcement of what remains of D-53."
//
// _Superseded, quoted rather than rewritten — this header used to open:_
//
//   "⚠️ THIS GUARD IS THE ENTIRE ENFORCEMENT. RLS WILL NOT CATCH A BYPASS."
//   …
//   "MEASURED, NOT INFERRED [S115]: signed in as the QA subcontractor, the
//    database returned both change orders on a project they are assigned to, at
//    full value — net_delta 1410 and 21385.91. Nothing at the database stopped
//    it. That figure is the argument for this file: remove the guard and the
//    data is right there."
//   …
//   "So: a `curl` with a subcontractor's token still reads every one of these
//    rows."
//
// **All of that was true when it was written. Three separate fix sessions —
// none of which touched this file — made three quarters of it false.**
// Re-measured live at S162 as the QA subcontractor:
//
//   change_orders          ⛔ NOW DB-ENFORCED. reads 0. The S121 read floor
//                          (20260830000000) added owner/admin OR PM-author, and
//                          a subcontractor matches no arm. The S115 measurement
//                          above NO LONGER REPRODUCES.
//   contacts               ⛔ NOW DB-ENFORCED. reads 0. The S131 roster floor,
//                          restated by S154's M2-02 fix:
//                          `role <> ALL (subcontractor, client)`.
//   company_members        ⛔ NOW DB-ENFORCED. Policy REPLACED — it is
//                          `company_members_select_visible` now, with an
//                          explicit subcontractor arm: own row, plus owner/admin
//                          members, plus PMs sharing an assigned project. Reads
//                          strictly fewer rows than an owner.
//   files                  ✅ STILL UI-ONLY, AND THIS IS THE ONE THAT MATTERS.
//                          `files_select_non_client` refuses `client` and floors
//                          contracts/change_orders/invoices to owner/admin (+PM
//                          for invoices). A SUBCONTRACTOR PASSES IT — they are
//                          not `client`. 20260728000000:53-73.
//
// ⚠️ SO DO NOT DELETE THIS FILE. `file` is load-bearing and the guard is the
// only thing standing in front of it. `co`, `member` and `contact` are now belt
// and braces, and they stay: D-54 asks for hidden AND route-guarded, and a
// redundant guard costs nothing while a removed one cannot be un-removed
// cheaply.
//
// ⚠️ AND THE LESSON THAT GENERALISES, because it will happen again. **A "the
// database does not enforce this" comment is a claim with an expiry date, and
// nothing in the repo re-checks one.** `s162-m6-audit.live.ts` A1 pins the
// sentences above so the claim and the policies have to be re-read together.
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

/** The four surfaces D-53 still excludes subcontractors from, plus D-51's write surface. */
export type GatedSurface = 'co' | 'member' | 'contact' | 'file' | 'co-write';

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

// ===========================================================================
// D-51's WRITE surface — and the asymmetry with everything above
// ===========================================================================
// Everything above this line gates a READ, and §4.11.10b's third conflict is
// why: those four tables carry no subcontractor arm on SELECT, so the guard is
// the only thing there is.
//
// CO WRITES ARE THE OPPOSITE CASE, and the difference is worth stating rather
// than leaving a reader to infer that this file is uniformly load-bearing:
//
//   change_orders_insert_authorized      get_my_role() = ANY (owner, admin,
//   change_orders_update_authorized        project_manager)
//   change_order_line_items_{insert,update,delete}_authorized   — same array
//   change_order_line_rows_{insert,update,delete}_authorized    — same array
//                                        20260704215000:339-351, :366-386, :402-421
//
// So a foreman, a crew member or a subcontractor CANNOT author, alter or void a
// change order no matter what this file does — **the database refuses them.**
// The guard below is D-54 step 2 applied to a write surface, and its job is to
// make the refusal HONEST (a screen that explains itself, per A-66) rather than
// to be the refusal. A build that deleted it would leak an empty editor whose
// every save failed with an RLS error, which is a worse experience than a
// redirect but is NOT a permission hole.
//
// §4.11.11 puts it as the asymmetry that makes #117 tolerable: "Writing is
// DB-enforced; reading is not." This file now holds one example of each.

/** D-51's three roles. Mirrors `change_orders_insert_authorized` exactly. */
const CO_WRITE_ROLES = ['owner', 'admin', 'project_manager'];

/**
 * Block a role the DB would refuse from ever reaching a CO write screen.
 *
 * Unlike `requireDetailAccess`, this excludes FIVE roles rather than one —
 * foreman and crew_member are refused here even though D-53 lets them READ
 * M-31. Two different rules on one entity, which is exactly why they are two
 * functions rather than one parameterised guard.
 */
export async function requireCoWriteAccess(backTo: string): Promise<void> {
  const profile = await getMyProfile();

  // As above: app/m/layout.tsx owns the auth gate.
  if (!profile) return;

  if (!CO_WRITE_ROLES.includes(profile.role)) {
    redirect(`${backTo}?denied=co-write`);
  }
}

/** The same test, for HIDING the control (D-54 step 1). */
export function canWriteCo(role: string | null | undefined): boolean {
  return CO_WRITE_ROLES.includes(role ?? '');
}

// ===========================================================================
// ⚠️ THERE IS DELIBERATELY NO PUNCH GUARD IN THIS FILE. READ THIS BEFORE ADDING ONE.
// ===========================================================================
// It is tempting, and §4.11.10b's write table is what makes it tempting:
// `punch_list_items_insert_authenticated` and `_update_authenticated` carry NO
// ROLE ARM, so punch writes are not DB-enforced the way CO writes are. The
// inference — "no DB floor, therefore a route guard must be the enforcement" —
// is the right instinct applied to the wrong table.
//
// **NO ROLE IS EXCLUDED FROM THE PUNCH SCREENS, so there is nothing to guard.**
// D-52 as corrected [S110] opens M-33 and M-34 to every role, subcontractors
// included, and §4.11.10b records the missing role arm as "n/a — nothing to
// refuse ... **that is now correct behaviour** rather than a gap". Guarding
// `punch/new` would reverse a ruling Josh made, and §4.11.10a forecloses it in
// as many words: a build that gates a further surface "because there is a
// pattern now" has exceeded D-54.
//
// THE ONE PUNCH WRITE THAT IS ROLE-RESTRICTED IS **VERIFY**, and it is not a
// route — it is a button on M-34. Its Foreman+ floor lives in
// `verifyPunchItem` (punch-client.ts:186), in TypeScript, together with the
// requires_verification, status='complete' and separate-eyes checks. **RLS
// accepts a direct UPDATE setting status='verified' from any role** — open
// item 7, pre-existing and desktop-wide.
//
// So the punch enforcement ladder, stated plainly because it is the weakest in
// this pass and must not be mistaken for one of the strong ones:
//
//   create / complete   nothing refuses anyone — by ruling, not by omission
//   verify              hidden control + service-layer check. NO DB FLOOR.
//                       The service function is the gate; the hiding is
//                       cosmetic on top of it, and neither is RLS.
//
// A mobile path that called the table directly instead of verifyPunchItem
// would silently defeat the separate-eyes rule — which is A-58's whole point.

// ===========================================================================
// D-53's EDIT surfaces — `requireEditAccess` [S121]
// ===========================================================================
// docs/specs/M6M-edit-surfaces-spec.md §2. This belongs in THIS file, and the
// distinction matters given how much of the text above argues against adding
// guards: those arguments are about READ surfaces with no DB role arm, where a
// new guard invents a permission that does not exist. **These are write
// surfaces where the database is already refusing these roles**, so the guard
// is the `requireCoWriteAccess` case — it makes the refusal arrive as a screen
// that explains itself (A-66) instead of an RLS error under a Save button.
//
// ---------------------------------------------------------------------------
// THE ROLES ARE PER-SURFACE, AND THAT IS NOT AN OVERSIGHT
// ---------------------------------------------------------------------------
// One shared constant would have to be wrong for one of the tables. Read from
// the migrations, these three policies genuinely differ:
//
//   subcontractors_update_authorized   owner, admin, project_manager   baseline:3758
//   contacts_update_authorized         owner, admin, project_manager   baseline:3277
//   company_members_update_authorized  owner, admin                    20260704210000:92
//
// RULED [S121, Josh]: "TEAM EDIT NARROWS TO OWNER/ADMIN. company_members'
// UPDATE policy already enforces exactly that; the ruling changes, not the
// policy. No migration." So `team` carries two roles and the others carry
// three, and each mirrors its own policy rather than a house style.
//
// ⚠️ `team` GATES A ROUTE THAT WRITES **TWO** TABLES, which the other two do not.
// The second question the role ruling did not settle is now closed: RULED
// [S121, Josh] that "edit a team member" means BOTH `company_members` (member
// type, schedule colour, active status) AND `profiles` (name, email, phone).
// `/m/team/[memberId]/edit` is built against that.
//
// This guard covers only the FIRST half. `EDIT_ROLES.team` mirrors
// `company_members_update_authorized` (owner, admin) and nothing more — the
// `profiles` half carries its own, NARROWER policy that this cannot express:
// `profiles_update_admin` refuses an admin editing an owner, another admin, or
// their own row. So a user this guard ADMITS can still have the profiles half
// refused, which is ordinary rather than exceptional. That refusal is detected
// at the write (zero rows affected, not an error) and reported per half — see
// lib/services/members-client.ts. Do not "tighten" this constant to compensate:
// it would lock an admin out of the roster half they are genuinely allowed to
// edit, for every member.
//
// A-47's trap is why the route reads `profile_id` rather than reusing the
// desktop `updateTeamMember` (team.ts:44), which writes `profiles` BY PROFILE
// ID and resolves nothing for the 32 of rebuild-test's 33 subcontractor members
// that have no profile at all.
export type EditSurface = 'sub' | 'contact' | 'team';

const EDIT_ROLES: Record<EditSurface, readonly string[]> = {
  sub: ['owner', 'admin', 'project_manager'],
  contact: ['owner', 'admin', 'project_manager'],
  team: ['owner', 'admin'],
};

/** D-54 step 1 — for HIDING the Edit affordance on a detail screen. */
export function canEdit(surface: EditSurface, role: string | null | undefined): boolean {
  return EDIT_ROLES[surface].includes(role ?? '');
}

/**
 * D-54 step 2 — refuse at the ROUTE, before render.
 *
 * A hidden button is not a permission: the URL survives a shared screenshot, a
 * bookmark and a stale PWA cache. A build that ships only `canEdit` has shipped
 * no permission at all — which is the same sentence the CO write surface
 * carries, and it is not a coincidence.
 */
export async function requireEditAccess(
  surface: EditSurface,
  backTo: string
): Promise<void> {
  const profile = await getMyProfile();

  // As with the guards above: app/m/layout.tsx owns the auth gate. Refusing a
  // signed-out user here would turn a 302-to-sign-in into a confusing "only an
  // owner can do this" message.
  if (!profile) return;

  if (!canEdit(surface, profile.role)) {
    redirect(`${backTo}?denied=${surface}-edit`);
  }
}
