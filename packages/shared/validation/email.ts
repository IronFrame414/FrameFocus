import { z } from 'zod';

// Spec 2 (4E/4J) — email sending + reminder schedule shapes.

// Day offsets after sent_at. ≥ 1 everywhere (a day-0 reminder makes
// no sense — locked build decision), max 10 steps, strictly
// ascending so the cron's reminder_count indexing stays coherent.
export const reminderScheduleSchema = z
  .array(z.number().int('Whole days only').min(1, 'Reminders start at day 1'))
  .max(10, 'At most 10 reminder steps')
  .refine((days) => days.every((d, i) => i === 0 || d > days[i - 1]), {
    message: 'Reminder days must be in ascending order',
  });

export const sendProposalSchema = z.object({
  estimate_id: z.string().uuid(),
  subject: z.string().min(1, 'Subject is required').max(200),
  body: z.string().min(1, 'Body is required').max(5000),
});

export type ReminderScheduleInput = z.infer<typeof reminderScheduleSchema>;
export type SendProposalInput = z.infer<typeof sendProposalSchema>;
