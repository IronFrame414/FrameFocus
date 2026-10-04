import { createClient } from '@/lib/supabase-server';

// S128 Part F — the current cover of ONE project, for the photo viewers' "Cover" state.
// RLS (project_covers_select_staff) returns nothing to a client or subcontractor.
export async function getProjectCoverFileId(projectId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('project_covers')
    .select('file_id')
    .eq('project_id', projectId)
    .maybeSingle();
  return (data as { file_id: string | null } | null)?.file_id ?? null;
}
