// C-11 [S115] — WHO MAY DELETE A PROJECT PHOTO. One rule, read by BOTH
// surfaces: /m's grid and viewer, and the desktop photo (markup) page.
//
// Before this, /m decided inline (`role === 'owner' || role === 'admin'`) and
// desktop had no photo delete at all — two surfaces, two answers [PARITY, S122].
//
// OWNER, ADMIN, PROJECT MANAGER, PROJECT EXECUTIVE — RULED [Josh, S116 Q11]:
// CLAUDE.md's approvals table ("Delete files — Owner ✓, Admin ✓, PM ✓") plus
// R1 [S114] (the PE gets what the PM has on its projects), on both surfaces.
// The database admits exactly these on a project they can reach:
// `files_update_non_client` (PM via can_view_project) and
// `files_update_project_executive` (pe_on_project).
//
// SUPERSEDED [S116 Q11], quoted: "⚠️ OWNER AND ADMIN ONLY — the NARROWER of two
// written answers, pending Josh [S115 ASK-C11-ROLES]." That narrowing followed
// M6M A-25d ("'role-gated' in §4.9 means Owner/Admin"), which is SUPERSEDED for
// this control: its premise is the hard-DELETE policy `files_delete_owner_admin`,
// but this control SOFT-deletes (an UPDATE).
//
// ⚠️ THIS HIDES A CONTROL; IT PROTECTS NO ROW. The database decides:
// `files_update_non_client` (20260822000000) and `files_update_project_executive`
// (20261940000000). [S118 #171] The DATABASE now enforces this same list for
// moving ANY file to or from Trash (`enforce_files_column_scope`,
// 20262030000000). _Superseded, quoted:_ "RLS is WIDER than this list today — a
// foreman, crew member or subcontractor can soft-delete a photo on a project they
// can view (filed as debt)." A
// frozen site-visit photo is refused by `files_z_site_visit_freeze` whatever this
// says, and `softDeleteFile` reports that refusal (it counts the row it changed).
export const PHOTO_DELETE_ROLES: readonly string[] = [
  'owner',
  'admin',
  'project_manager',
  'project_executive',
];

export function canDeletePhoto(role: string | null | undefined): boolean {
  return typeof role === 'string' && PHOTO_DELETE_ROLES.includes(role);
}

/**
 * [S118 #171] Who may move ANY file to or from Trash — the same list, because the
 * database enforces one list for both (20262030000000). Read by the Files-tab
 * Delete and the Trash page's Restore, so no screen offers a control the
 * database refuses.
 */
export function canTrashFile(role: string | null | undefined): boolean {
  return canDeletePhoto(role);
}
