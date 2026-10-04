// S128 Part F — who may CHOOSE a project's cover. [Josh, 2026-10-03 17:13] "owner, admin, pe, pm,
// and foreman, can all select any image as the cover image."
//
// The database decides (set_project_cover, 20262139000000: Owner/Admin on any project; PE, PM and
// foreman on a project they can view); this decides which control renders, on BOTH surfaces.
// ⚠️ NOT the share list (Owner/Admin) and NOT the delete list — it includes the FOREMAN, who can
// neither share a photo with a client nor delete one. Recorded so nobody "aligns" the three.
export const PROJECT_COVER_SETTER_ROLES: readonly string[] = [
  'owner',
  'admin',
  'project_executive',
  'project_manager',
  'foreman',
];

export function canSetProjectCover(role: string | null | undefined): boolean {
  return typeof role === 'string' && PROJECT_COVER_SETTER_ROLES.includes(role);
}
