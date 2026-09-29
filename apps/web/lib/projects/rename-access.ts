// S118 item 14 — who may RENAME a project: Owner/Admin. The database decides
// (enforce_projects_column_scope, 20262090000000); this decides which control
// renders. Test: test/s118-project-rename.test.ts (total map).
export const PROJECT_RENAME_ROLES: readonly string[] = ['owner', 'admin'];

export function canRenameProject(role: string | null | undefined): boolean {
  return typeof role === 'string' && PROJECT_RENAME_ROLES.includes(role);
}
