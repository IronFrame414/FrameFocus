// S121 5-C — dated tasks → calendar bars. PURE, so every arm of the crew
// self-filter is asserted without a database (test/s121-task-events.test.ts).
//
// ⚠️ THE CREW SELF-FILTER IS LOAD-BEARING (stop rule 8). A crew member's
// calendar holds the tasks they are AMONG the assignees of — and only THEIR bar
// of each. Get it wrong and a crew member either loses their own tasks or sees
// everyone's.
//   SUPERSEDED (schedule.ts, pre-S121):
//     if (options.ownMemberId && assignee?.id !== options.ownMemberId) continue;
//   over a SINGLE embedded assignee.
//
// Q20 [RULED Josh]: the calendar is ONE BAR PER PERSON ("who is where"); the
// Gantt is one bar per task. So a task with three people is three events —
// same `id`, three `key`s, each carrying the whole set in `member_ids`.

import { scheduleColor } from '@framefocus/shared/utils/schedule-colors';
import type { TaskAssignee } from '@/lib/tasks/assignees';
import type { CalendarEvent } from '@/lib/services/schedule';

export interface DatedTask {
  id: string;
  title: string;
  status: string;
  start_date: string | null;
  due_date: string | null;
  project_id: string;
  project_label: string | null;
  assignees: TaskAssignee[];
}

export function taskEvents(tasks: readonly DatedTask[], ownMemberId?: string): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const t of tasks) {
    const memberIds = t.assignees.map((a) => a.id);
    if (ownMemberId && !memberIds.includes(ownMemberId)) continue;
    const people = ownMemberId ? t.assignees.filter((a) => a.id === ownMemberId) : t.assignees;
    const start = t.start_date ?? t.due_date!;
    const end = t.due_date ?? t.start_date!;
    // An unassigned dated task is still ONE bar, with nobody on it.
    for (const a of people.length > 0 ? people : [null]) {
      out.push({
        key: `task-${t.id}-${a?.id ?? 'none'}`,
        id: t.id,
        source: 'task',
        title: t.title,
        start_date: start,
        end_date: end,
        member_id: a?.id ?? null,
        member_name: a?.display_name ?? null,
        member_type: a?.member_type ?? null,
        color: scheduleColor({
          memberId: a?.id ?? null,
          memberType: a?.member_type ?? null,
          explicit: a?.schedule_color ?? null,
          trade: a?.trade ?? null,
        }),
        color_note: a?.member_type === 'subcontractor' && !a.trade ? 'no trade' : null,
        member_ids: memberIds,
        project_id: t.project_id,
        project_label: t.project_label,
        detail: { status: t.status },
      });
    }
  }
  return out;
}
