// S122 Part 4 — who sees the Critical Path tab. ONE list, read by the project
// header (the tab strip) AND the page (the gate); a tab hidden from the bar is
// not a gate, and the page repeats it server-side.
//
// Supervisors only: Owner, Admin, the project's PE, a PM and a foreman (who
// submits schedule changes, Part 5). NOT crew: under RLS a crew member or a
// sub sees only the tasks they are on, and a network drawn from part of the
// graph would state float and dates that are wrong. NEVER a client: float is
// ruled out of the client's view entirely (ruling 8; their read is Part 7's
// narrowed SQL function, not this page).
export const CRITICAL_PATH_TAB_ROLES = [
  'owner',
  'admin',
  'project_executive',
  'project_manager',
  'foreman',
] as const;

export function canSeeCriticalPathTab(role: string | null | undefined): boolean {
  return !!role && (CRITICAL_PATH_TAB_ROLES as readonly string[]).includes(role);
}
