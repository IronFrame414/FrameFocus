import { z } from 'zod';

/**
 * S122 Part 3 — the body of the Critical Path line sheet's save route
 * (POST /api/projects/[id]/critical-path/tasks/[taskId]).
 *
 * A route accepts JSON from the network, so it re-establishes the shape the
 * database's CHECKs would hold (tasks_duration_days_check, _days_left_check,
 * _start_constraint_check/_pair). RLS and the Q12 guard still decide whether
 * the write is ALLOWED — this only decides whether it is well-formed.
 *
 * Every field is optional: absent = unchanged. `null` clears.
 * `days_left_as_of` is never accepted from the client — the server stamps the
 * company's today when days_left is written (Q1-A: "the as-of stamp is the
 * part that matters").
 */

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'A date is YYYY-MM-DD');

export const criticalPathTaskSaveSchema = z
  .object({
    title: z.string().trim().min(1, 'Task title is required.').max(300).optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    phase_id: uuid.nullable().optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).nullable().optional(),
    status: z.enum(['not_started', 'in_progress', 'blocked', 'complete']).optional(),
    duration_days: z.number().int().min(1).max(3650).nullable().optional(),
    days_left: z.number().int().min(0).max(3650).nullable().optional(),
    start_constraint: z.enum(['fixed', 'not_before']).nullable().optional(),
    constraint_date: isoDate.nullable().optional(),
    /** The task's people, each with its own notify choice (ruling 11). */
    assignees: z
      .array(z.object({ member_id: uuid, notify_changes: z.boolean() }))
      .max(200)
      .optional(),
  })
  .strict()
  .refine(
    (b) =>
      b.start_constraint === undefined && b.constraint_date === undefined
        ? true
        : (b.start_constraint == null) === (b.constraint_date == null),
    { message: 'A start anchor needs its date, and a date needs its anchor.' }
  );

export type CriticalPathTaskSave = z.infer<typeof criticalPathTaskSaveSchema>;

/**
 * S122 Part 4 — a date GESTURE on a task (calendar drag, schedule sheet,
 * Gantt end handle): the dates the user dragged to. The server reads the
 * task's stored dates as "from" — never the client's copy — and translates
 * the gesture (translateMove). `confirm: false` asks for the preview only;
 * nothing is written until the user has seen which edit it is [Josh, Q19].
 */
export const criticalPathMoveSchema = z
  .object({
    to: z.object({ start: isoDate, end: isoDate }).refine((r) => r.end >= r.start, {
      message: 'A bar cannot end before it starts.',
    }),
    confirm: z.boolean(),
  })
  .strict();

export type CriticalPathMove = z.infer<typeof criticalPathMoveSchema>;
