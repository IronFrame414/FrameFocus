// C-11 [S115] — WHO MAY DELETE A PROJECT PHOTO. One rule, read by BOTH
// surfaces: /m's grid and viewer, and the desktop photo (markup) page.
//
// Before this, /m decided inline (`role === 'owner' || role === 'admin'`) and
// desktop had no photo delete at all — two surfaces, two answers [PARITY, S122].
//
// ⚠️ OWNER AND ADMIN ONLY — the NARROWER of two written answers, pending
// Josh [S115 ASK-C11-ROLES]. They disagree:
//   · M6M A-25d: "'role-gated' in §4.9 means Owner/Admin, and the UI must not
//     offer an action the DB will reject" — its premise is the hard-DELETE policy
//     `files_delete_owner_admin`, but the control SOFT-deletes (an UPDATE);
//   · CLAUDE.md's approvals table: "Delete files — Owner ✓, Admin ✓, PM ✓", and
//     R1 [S114] gives the Project Executive everything a PM has on its projects.
// Widening to PM/PE is one line here, and both surfaces follow it.
//
// ⚠️ THIS HIDES A CONTROL; IT PROTECTS NO ROW. The database decides:
// `files_update_non_client` (20260822000000) and `files_update_project_executive`
// (20261940000000). RLS is WIDER than this list today — a PM, foreman or crew
// member can soft-delete a photo on a project they can view (filed as debt). A
// frozen site-visit photo is refused by `files_z_site_visit_freeze` whatever this
// says, and `softDeleteFile` reports that refusal (it counts the row it changed).
export const PHOTO_DELETE_ROLES: readonly string[] = ['owner', 'admin'];

export function canDeletePhoto(role: string | null | undefined): boolean {
  return typeof role === 'string' && PHOTO_DELETE_ROLES.includes(role);
}
