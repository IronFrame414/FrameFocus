import { createClient } from '@/lib/supabase-server';
import type { Database } from '@framefocus/shared/types/database';

type AssignmentRow = Database['public']['Tables']['project_assignments']['Row'];

/** Assignment joined with its member for team-tab rendering. */
export type ProjectAssignment = AssignmentRow & {
  member: {
    id: string;
    display_name: string;
    member_type: string;
    schedule_color: string | null;
  } | null;
};

export async function getProjectAssignments(projectId: string): Promise<ProjectAssignment[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('project_assignments')
    .select('*, member:company_members(id, display_name, member_type, schedule_color)')
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true });

  if (error) return [];
  return (data ?? []) as unknown as ProjectAssignment[];
}
