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

/**
 * The project ids the signed-in member is assigned to.
 *
 * Exists for M6M §4.2's **Mine** filter chip (M-2). §4.2 names the four chips
 * and A-9b requires each to change the rows listed, but neither §4.2 nor §8a
 * binds "Mine" to a source — this is that binding, put in the service layer
 * rather than in the page because CLAUDE.md's rule is that components never
 * query Supabase directly, and A-28b's "no duplicate data access for mobile"
 * governs services specifically.
 *
 * Assignment is the same member-level fact the rest of Module 5 uses — the
 * `project_assignments` junction, keyed on `company_members(id)` — so "Mine"
 * here means the same thing it means on M-14's chip and on the desktop team
 * tab. `get_my_member_id()` by rpc, for the reason spelled out on
 * getOpenPunchCounts(): assignee/member ids are not user ids.
 */
export async function getMyAssignedProjectIds(): Promise<Set<string>> {
  const supabase = await createClient();

  const { data: myMemberId } = await supabase.rpc('get_my_member_id');
  if (!myMemberId) return new Set();

  const { data, error } = await supabase
    .from('project_assignments')
    .select('project_id')
    .eq('member_id', myMemberId)
    .eq('is_deleted', false);

  if (error || !data) return new Set();
  return new Set(data.map((r) => r.project_id).filter((id): id is string => Boolean(id)));
}
