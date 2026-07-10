import { z } from 'zod';

// ============================================================================
// Module 6 / 6A — Time Tracking validation
// Enums mirror the CHECK constraints in migration 20260710130000 exactly. The
// segment field-gating (§5.2) is enforced in the DB via CHECK constraints; this
// mirrors it in zod so forms fail with friendly messages before the round-trip.
// Free text (note) is intentionally under-constrained per CLAUDE.md guidance.
// ============================================================================

export const segmentTypes = [
  'work',
  'material_run',
  'warranty',
  'travel',
  'shop',
  'break',
] as const;
export type SegmentType = (typeof segmentTypes)[number];

export const completionValues = ['complete', 'incomplete'] as const;
export type Completion = (typeof completionValues)[number];

const projectBearing: readonly SegmentType[] = ['work', 'material_run', 'warranty'];

// ── Clock in ──
// gps is optional; captured only when the company enables GPS (Settings pass).

const gpsSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  accuracy: z.number().optional(),
  captured_at: z.string().optional(),
});

export const clockInSchema = z.object({
  clock_in: z.string().optional(), // device timestamp; defaults to now() server-side
  gps_in: gpsSchema.optional(),
});
export type ClockInInput = z.infer<typeof clockInSchema>;

// ── Open a segment (§5.2 gating applied via superRefine) ──

export const openSegmentSchema = z
  .object({
    session_id: z.string().uuid(),
    segment_type: z.enum(segmentTypes),
    project_id: z.string().uuid().nullable().optional(),
    task_id: z.string().uuid().nullable().optional(),
    segment_start: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    const bearing = projectBearing.includes(val.segment_type);
    const hasProject = val.project_id != null;
    const hasTask = val.task_id != null;

    if (bearing && !hasProject) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['project_id'],
        message: `A ${val.segment_type} segment requires a project.`,
      });
    }
    if (!bearing && hasProject) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['project_id'],
        message: `A ${val.segment_type} segment cannot carry a project.`,
      });
    }
    // A task may only attach to a work segment (§5.2).
    if (hasTask && val.segment_type !== 'work') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['task_id'],
        message: 'Only a work segment can be attributed to a task.',
      });
    }
  });
export type OpenSegmentInput = z.infer<typeof openSegmentSchema>;

// ── End a segment ──
// note is mandatory for every type except break; completion is required iff a
// task was attached (the caller supplies had_task to enforce it at the edge).

export const endSegmentSchema = z
  .object({
    segment_id: z.string().uuid(),
    segment_type: z.enum(segmentTypes),
    had_task: z.boolean(),
    segment_end: z.string().optional(),
    completion: z.enum(completionValues).nullable().optional(),
    note: z.string().nullable().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.segment_type !== 'break' && !val.note?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['note'],
        message: 'A note is required to end this segment.',
      });
    }
    if (val.had_task && val.completion == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['completion'],
        message: 'Mark the task complete or incomplete before ending.',
      });
    }
    if (!val.had_task && val.completion != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['completion'],
        message: 'Only a task-attributed segment can carry a completion.',
      });
    }
  });
export type EndSegmentInput = z.infer<typeof endSegmentSchema>;

// ── Clock out ──

export const clockOutSchema = z.object({
  session_id: z.string().uuid(),
  clock_out: z.string().optional(),
  gps_out: gpsSchema.optional(),
  // The open segment is ended as part of clock-out; its end fields ride along.
  end_segment: endSegmentSchema.optional(),
});
export type ClockOutInput = z.infer<typeof clockOutSchema>;
