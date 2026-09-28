import { createClient } from '@/lib/supabase-browser';
import { applied, DISCARDED } from '@/lib/services/mutation-result';

// [S114 PART B, RULED Josh R3] — the Owner's two writes. RLS is the authority
// (project_qb_exclusions: INSERT/UPDATE Owner only); a refused write affects
// zero rows and is reported as NOT applied, never as success.

export async function excludeProjectFromQb(
  projectId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  // company_id / created_by / updated_by come from the column defaults.
  const { data, error } = await supabase
    .from('project_qb_exclusions')
    .insert({ project_id: projectId })
    .select('id');
  if (error) {
    // Already excluded (the partial unique index) is the state the user wanted.
    if (error.code === '23505') return { success: true };
    return { success: false, error: error.message };
  }
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}

/** Include again: the live row is soft-deleted (who/when kept). */
export async function includeProjectInQb(
  projectId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('project_qb_exclusions')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .select('id');
  if (error) return { success: false, error: error.message };
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}
