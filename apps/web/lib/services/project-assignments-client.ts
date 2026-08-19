import { createClient } from '@/lib/supabase-browser';
import type { ProjectAssignment } from '@/lib/services/project-assignments';
import { applied, DISCARDED } from '@/lib/services/mutation-result';
export type { ProjectAssignment };

/**
 * ND-18 — POSTS TO A ROUTE, does not write Supabase directly.
 *
 * Authorisation is unchanged: the route inserts with the CALLER's session, so
 * `project_assignments_insert_authorized` still decides. See
 * app/api/project-assignments/route.ts.
 */
export async function assignMember(
  projectId: string,
  memberId: string,
  roleOnProject?: string | null
): Promise<{
  success: boolean;
  error?: string;
  emailOnly?: string | null;
  unreachableName?: string | null;
}> {
  let response: Response;
  try {
    response = await fetch('/api/project-assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        member_id: memberId,
        role_on_project: roleOnProject ?? null,
      }),
    });
  } catch {
    return { success: false, error: 'Could not reach the server. Check your connection.' };
  }

  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
    emailOnly?: string | null;
    unreachableName?: string | null;
  };

  if (!response.ok) {
    return { success: false, error: body.error ?? 'Could not assign the member.' };
  }
  return {
    success: true,
    emailOnly: body.emailOnly ?? null,
    unreachableName: body.unreachableName ?? null,
  };
}

export async function unassignMember(
  assignmentId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  // Soft delete per trash-bin pattern; the UNIQUE (project_id, member_id)
  // constraint means re-assignment restores by un-deleting instead.
  const { data, error } = await supabase
    .from('project_assignments')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', assignmentId)
    .select('id');

  if (error) return { success: false, error: error.message };
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}

/**
 * Re-activate a soft-deleted assignment (handles the UNIQUE constraint).
 *
 * ND-18 — this now DELEGATES rather than doing its own select-then-un-delete.
 * The revive branch moved server-side into `upsertProjectAssignmentAsCaller()`,
 * and it had to: a client-direct un-delete is still a real assignment, and
 * leaving that branch here would have made re-assigning somebody after an
 * unassign the ONE assignment that notifies nobody — the exact silent gap
 * ND-18 rejected the post-write ping for.
 *
 * `team-panel.tsx` calls this, not assignMember, so this is the live path.
 */
export async function reassignMember(
  projectId: string,
  memberId: string
): Promise<{
  success: boolean;
  error?: string;
  emailOnly?: string | null;
  unreachableName?: string | null;
}> {
  return assignMember(projectId, memberId);
}
