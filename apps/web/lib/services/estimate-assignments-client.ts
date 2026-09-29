import { createClient } from '@/lib/supabase-browser';

// S119 D-2 — Owner/Admin grant or remove a Project Executive's access to one
// estimate. RLS (estimate_assignments_*_owner_admin) refuses everyone else; the
// shape trigger refuses a member who is not a live PE of this company.
// Removal is a soft delete (no DELETE policy), then the new row is inserted —
// one live assignment per estimate.

const DISCARDED = 'The change was not saved (you may not have permission).';

export async function setEstimatePeAccess(
  estimateId: string,
  memberId: string | null
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  const { data: current, error: readErr } = await supabase
    .from('estimate_assignments')
    .select('id, member_id')
    .eq('estimate_id', estimateId)
    .eq('is_deleted', false)
    .maybeSingle();
  if (readErr) return { success: false, error: readErr.message };
  if ((current?.member_id ?? null) === memberId) return { success: true };

  if (current) {
    const { data: removed, error } = await supabase
      .from('estimate_assignments')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('id', current.id)
      .select('id');
    if (error) return { success: false, error: error.message };
    if (!removed || removed.length !== 1) return { success: false, error: DISCARDED };
  }

  if (memberId) {
    const { data: added, error } = await supabase
      .from('estimate_assignments')
      .insert({ estimate_id: estimateId, member_id: memberId })
      .select('id');
    if (error) return { success: false, error: error.message };
    if (!added || added.length !== 1) return { success: false, error: DISCARDED };
  }
  return { success: true };
}
