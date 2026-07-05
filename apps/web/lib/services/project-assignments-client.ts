import { createClient } from '@/lib/supabase-browser';
import type { ProjectAssignment } from '@/lib/services/project-assignments';
export type { ProjectAssignment };

export async function assignMember(
  projectId: string,
  memberId: string,
  roleOnProject?: string | null
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  const { error } = await supabase.from('project_assignments').insert({
    project_id: projectId,
    member_id: memberId,
    role_on_project: roleOnProject ?? null,
  });

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'This member is already assigned to the project.' };
    }
    return { success: false, error: error.message };
  }
  return { success: true };
}

export async function unassignMember(
  assignmentId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  // Soft delete per trash-bin pattern; the UNIQUE (project_id, member_id)
  // constraint means re-assignment restores by un-deleting instead.
  const { error } = await supabase
    .from('project_assignments')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', assignmentId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Re-activate a soft-deleted assignment (handles the UNIQUE constraint). */
export async function reassignMember(
  projectId: string,
  memberId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  const { data: existing } = await supabase
    .from('project_assignments')
    .select('id, is_deleted')
    .eq('project_id', projectId)
    .eq('member_id', memberId)
    .maybeSingle();

  if (existing) {
    if (!existing.is_deleted) {
      return { success: false, error: 'This member is already assigned to the project.' };
    }
    const { error } = await supabase
      .from('project_assignments')
      .update({ is_deleted: false, deleted_at: null })
      .eq('id', existing.id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  }

  return assignMember(projectId, memberId);
}
