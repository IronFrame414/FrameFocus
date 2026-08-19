import { createClient } from '@/lib/supabase-browser';
import { applied, DISCARDED } from '@/lib/services/mutation-result';
import type {
  DependencyType,
  Phase,
  Task,
  TaskDependency,
  TaskPriority,
  TaskStatus,
} from '@/lib/services/tasks-shared';
export type { DependencyType, Phase, Task, TaskDependency, TaskPriority, TaskStatus };

export async function createTask(task: {
  project_id: string;
  title: string;
  description?: string | null;
  phase_id?: string | null;
  priority?: TaskPriority | null;
  start_date?: string | null;
  due_date?: string | null;
  assignee_id?: string | null;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const supabase = createClient();

  const { data, error } = await supabase.from('tasks').insert(task).select('id').single();
  if (error) return { success: false, error: error.message };
  return { success: true, id: data.id };
}

/**
 * Task update. completed_at mechanics (5B §2): set when status transitions to
 * complete, cleared when moved off complete — the plan (dates) is untouched.
 */
export async function updateTask(
  id: string,
  updates: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  if (updates.status === 'complete') {
    updates.completed_at = new Date().toISOString();
    updates.percent_complete = 100;
  } else if (typeof updates.status === 'string') {
    updates.completed_at = null;
  }

  // BEFORE UPDATE trigger `tasks_set_updated_by` handles updated_by.
  // updated_at is handled by the existing updated_at trigger.
  const { data, error } = await supabase.from('tasks').update(updates).eq('id', id)
    .select('id');

  if (error) return { success: false, error: error.message };
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}

export async function deleteTask(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('tasks')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id)
    .select('id');

  if (error) return { success: false, error: error.message };
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}

// ── Phases ──

export async function createPhase(
  projectId: string,
  name: string,
  sortOrder: number
): Promise<{ success: boolean; id?: string; error?: string }> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('phases')
    .insert({ project_id: projectId, name, sort_order: sortOrder })
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, id: data.id };
}

export async function deletePhase(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  // Detach tasks first so they fall back to unphased rather than dangling.
  const { error: detachError } = await supabase
    .from('tasks')
    .update({ phase_id: null })
    .eq('phase_id', id);
  if (detachError) return { success: false, error: detachError.message };

  const { data, error } = await supabase
    .from('phases')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id)
    .select('id');

  if (error) return { success: false, error: error.message };
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}

// ── Dependencies ──

/**
 * Create a dependency with the SERVICE-LAYER cycle guard (Q-N4 locked; DB
 * enforcement logged as tech debt). Rejects self-links and any link that
 * closes a loop (successor already reaches predecessor through the existing
 * dependency graph).
 */
export async function createDependency(
  projectId: string,
  predecessorId: string,
  successorId: string,
  dependencyType: DependencyType = 'finish_to_start'
): Promise<{ success: boolean; error?: string }> {
  if (predecessorId === successorId) {
    return { success: false, error: 'A task cannot depend on itself.' };
  }

  const supabase = createClient();

  // Load the project's existing dependency edges for the reachability check
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id')
    .eq('project_id', projectId)
    .eq('is_deleted', false);
  const taskIds = (tasks ?? []).map((t) => t.id);

  const { data: edges } = await supabase
    .from('task_dependencies')
    .select('predecessor_id, successor_id')
    .in('predecessor_id', taskIds)
    .eq('is_deleted', false);

  // DFS: can we already reach predecessorId starting from successorId?
  // If yes, adding predecessor -> successor closes a cycle.
  const graph = new Map<string, string[]>();
  for (const edge of edges ?? []) {
    const list = graph.get(edge.predecessor_id) ?? [];
    list.push(edge.successor_id);
    graph.set(edge.predecessor_id, list);
  }

  const stack = [successorId];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node === predecessorId) {
      return {
        success: false,
        error: 'That dependency would create a loop (the predecessor already depends on this task).',
      };
    }
    if (seen.has(node)) continue;
    seen.add(node);
    for (const next of graph.get(node) ?? []) stack.push(next);
  }

  const { data, error } = await supabase.from('task_dependencies').insert({
    predecessor_id: predecessorId,
    successor_id: successorId,
    dependency_type: dependencyType,
  });

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'That dependency already exists.' };
    }
    return { success: false, error: error.message };
  }
  return { success: true };
}

export async function deleteDependency(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('task_dependencies')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id)
    .select('id');

  if (error) return { success: false, error: error.message };
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}
