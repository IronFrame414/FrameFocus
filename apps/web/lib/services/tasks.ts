import { createClient } from '@/lib/supabase-server';
import type { Phase, Task, TaskDependency } from '@/lib/services/tasks-shared';

// Pure logic + types live in tasks-shared.ts (safe for client components);
// this file holds the server-side reads.
export type {
  DependencyType,
  Phase,
  PhaseRollup,
  Task,
  TaskDependency,
  TaskPriority,
  TaskStatus,
} from '@/lib/services/tasks-shared';
export { rollupPhases, TASK_STATUS_LABELS } from '@/lib/services/tasks-shared';

export async function getTasks(projectId: string): Promise<Task[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('tasks')
    .select('*, assignee:company_members(id, display_name, schedule_color)')
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true });

  if (error) return [];
  return (data ?? []) as unknown as Task[];
}

export async function getPhases(projectId: string): Promise<Phase[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('phases')
    .select('*')
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .order('sort_order', { ascending: true });

  if (error) return [];
  return data ?? [];
}

export async function getDependencies(projectId: string): Promise<TaskDependency[]> {
  const supabase = await createClient();

  // Dependencies have no project_id; scope via the project's tasks.
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id')
    .eq('project_id', projectId)
    .eq('is_deleted', false);

  const taskIds = (tasks ?? []).map((t) => t.id);
  if (taskIds.length === 0) return [];

  const { data, error } = await supabase
    .from('task_dependencies')
    .select('*')
    .in('predecessor_id', taskIds)
    .eq('is_deleted', false);

  if (error) return [];
  return (data ?? []) as TaskDependency[];
}
