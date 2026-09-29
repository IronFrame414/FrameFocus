// S115 R11 — WHO REACHES THE ESTIMATE SCREENS. One rule for the four estimate
// pages, the proposal-data API and the nav entry, which each carried their own
// `['owner', 'admin', 'project_manager']` list until now.
//
// RULED [Josh, 2026-09-28] R11: the Project Executive gets estimate access
// scoped to its own projects, markup and margin included — it presents the
// proposal PDF to the client, so it needs the estimate behind it.
//
// Taken unattended [S115 ASK-20, A]: READ ONLY. The PE reads; it does not
// author, edit or send. Its reach is the database's, not this list's:
// `estimates_select_project_executive` (20261830000000) returns an estimate
// only once it is CONVERTED onto a project the PE is assigned to, and every
// child table follows by containment. So a PE sees exactly the estimates behind
// its projects, and a converted estimate is not a draft, so nothing in the
// builder is editable for it anyway. Sending stays Owner/Admin in the API
// (R1 carve-out 2: no contract authority).
//
// ⚠️ THIS GATES SCREENS; RLS GATES ROWS. Widening this list never shows a PE a
// row the database withholds.

/** May open the estimate list, an estimate (read-only for a PE) and its proposal preview. */
export const ESTIMATE_READ_ROLES: readonly string[] = [
  'owner',
  'admin',
  'project_manager',
  'project_executive',
];

/** May create estimates and author them (unchanged: S111 Q7). */
export const ESTIMATE_AUTHOR_ROLES: readonly string[] = ['owner', 'admin', 'project_manager'];

export function canReadEstimates(role: string | null | undefined): boolean {
  return typeof role === 'string' && ESTIMATE_READ_ROLES.includes(role);
}

export function canAuthorEstimates(role: string | null | undefined): boolean {
  return typeof role === 'string' && ESTIMATE_AUTHOR_ROLES.includes(role);
}
