// Pure task/phase logic shared by server services AND client components.
// No supabase imports here — client components import runtime values from
// this file, never from tasks.ts (which pulls in next/headers).

import type { Database } from '@framefocus/shared/types/database';

type TaskRow = Database['public']['Tables']['tasks']['Row'];
type PhaseRow = Database['public']['Tables']['phases']['Row'];
type DependencyRow = Database['public']['Tables']['task_dependencies']['Row'];

export type TaskStatus = 'not_started' | 'in_progress' | 'blocked' | 'complete';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type DependencyType =
  | 'finish_to_start'
  | 'start_to_start'
  | 'finish_to_finish'
  | 'start_to_finish';

export type Task = Omit<TaskRow, 'status' | 'priority'> & {
  status: TaskStatus;
  priority: TaskPriority | null;
  assignee: {
    id: string;
    display_name: string;
    schedule_color: string | null;
  } | null;
};

export type Phase = PhaseRow;
export type TaskDependency = Omit<DependencyRow, 'dependency_type'> & {
  dependency_type: DependencyType;
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  complete: 'Complete',
};

/** Phase roll-up computed at read (5B §4) — never stored. */
export interface PhaseRollup {
  phase: Phase;
  tasks: Task[];
  start_date: string | null; // MIN(task.start_date)
  end_date: string | null; // MAX(task.due_date)
  status: TaskStatus;
  percent: number; // avg of member tasks' percent_complete
}

/** Roll phases up from their tasks (5B §4). Tasks without a phase are returned under `unphased`. */
export function rollupPhases(
  phases: Phase[],
  tasks: Task[]
): { rollups: PhaseRollup[]; unphased: Task[] } {
  const byPhase = new Map<string, Task[]>();
  const unphased: Task[] = [];

  for (const task of tasks) {
    if (task.phase_id) {
      const list = byPhase.get(task.phase_id) ?? [];
      list.push(task);
      byPhase.set(task.phase_id, list);
    } else {
      unphased.push(task);
    }
  }

  const rollups = phases.map((phase) => {
    const phaseTasks = byPhase.get(phase.id) ?? [];
    const dated = phaseTasks.filter((t) => t.start_date || t.due_date);
    const starts = dated.map((t) => t.start_date ?? t.due_date!).sort();
    const ends = dated.map((t) => t.due_date ?? t.start_date!).sort();

    let status: TaskStatus = 'not_started';
    if (phaseTasks.length > 0) {
      if (phaseTasks.every((t) => t.status === 'complete')) status = 'complete';
      else if (phaseTasks.some((t) => t.status === 'blocked')) status = 'blocked';
      else if (phaseTasks.some((t) => t.status === 'in_progress' || t.status === 'complete'))
        status = 'in_progress';
    }

    const percent =
      phaseTasks.length === 0
        ? 0
        : Math.round(
            phaseTasks.reduce((sum, t) => sum + (t.percent_complete ?? 0), 0) / phaseTasks.length
          );

    return {
      phase,
      tasks: phaseTasks,
      start_date: starts[0] ?? null,
      end_date: ends[ends.length - 1] ?? null,
      status,
      percent,
    };
  });

  return { rollups, unphased };
}
