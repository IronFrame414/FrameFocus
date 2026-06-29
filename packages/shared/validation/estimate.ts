import { z } from 'zod';
import { reminderScheduleSchema } from './email';

// Enums mirror the CHECK constraints on estimates exactly
// (migration 20260611102749). Free text is intentionally
// under-constrained per CLAUDE.md validation guidance.

export const estimateStatuses = [
  'draft',
  'review',
  'sent',
  'viewed',
  'accepted',
  'declined',
  'expired',
  'revised',
] as const;

export const discountTypes = ['percent', 'fixed'] as const;

export const pricingModes = ['markup', 'margin'] as const;

export const proposalPricingLevels = ['total_only', 'category_totals', 'line_items'] as const;

// 4D-rev: per-line / per-category proposal presentation override.
// NULL = inherit (category, then the estimate's proposal_pricing_level).
export const presentationModes = ['itemized', 'lump_sum'] as const;

// 4D-rev: Scope of Work is now one level of nesting — a parent
// sub-category title with child bullets — plus a free-text summary.
export const scopeSectionSchema = z.object({
  title: z.string().min(1, 'Section title is required').max(200),
  bullets: z.array(z.string().min(1).max(2000)),
});

export type ScopeSectionInput = z.infer<typeof scopeSectionSchema>;

export const declineReasonCodes = [
  'too_expensive',
  'chose_competitor',
  'project_canceled',
  'timing',
  'scope_changed',
  'other',
] as const;

export const termsSectionSchema = z.object({
  name: z.string().min(1, 'Section name is required').max(100),
  content: z.string(),
});

// contact_address_id became required in 4D — the /new form requires
// a job-site address (column stays nullable; old rows unaffected).
export const createEstimateSchema = z.object({
  name: z.string().min(1, 'Estimate name is required').max(200),
  contact_id: z.string().uuid('A client is required'),
  contact_address_id: z.string().uuid('A job-site address is required'),
});

export const updateEstimateSchema = z.object({
  name: z.string().min(1, 'Estimate name is required').max(200).optional(),
  contact_id: z.string().uuid().optional(),
  contact_address_id: z.string().uuid().nullable().optional(),
  tax_rate: z.number().min(0, 'Tax rate cannot be negative').optional(),
  subcontractor_markup_percent: z.number().min(0).nullable().optional(),
  material_markup_percent: z.number().min(0).nullable().optional(),
  labor_markup_percent: z.number().min(0).nullable().optional(),
  discount_type: z.enum(discountTypes).nullable().optional(),
  discount_amount: z
    .number()
    .min(0, 'Discount cannot be negative')
    .nullable()
    .optional(),
  proposal_pricing_level: z.enum(proposalPricingLevels).optional(),
  cover_letter: z.string().optional(),
  // 4D-rev: nested scope sections + free-text summary replace the
  // former flat scope_of_work TEXT[].
  scope_summary: z.string().nullable().optional(),
  scope_sections: z.array(scopeSectionSchema).nullable().optional(),
  terms_sections: z.array(termsSectionSchema).optional(),
  expiration_days: z
    .number()
    .int('Expiration must be a whole number of days')
    .positive('Expiration must be at least 1 day')
    .optional(),
  internal_notes: z.string().nullable().optional(),
  // 4J: NULL = use company default; [] = reminders off for this
  // estimate. Strict shape (≥ 1, ascending, ≤ 10) lives in
  // email.ts's reminderScheduleSchema.
  reminder_schedule: reminderScheduleSchema.nullable().optional(),
});

// pricing_mode is intentionally NOT on updateEstimateSchema — mode
// changes go through the switch_pricing_mode RPC (sticky-value swap
// + recompute), never a plain column update.

// 4K — clone from existing
export const cloneEstimateSchema = z.object({
  source_estimate_id: z.string().uuid(),
  contact_id: z.string().uuid('A client is required'),
  contact_address_id: z.string().uuid('A job-site address is required'),
  name: z.string().min(1, 'Estimate name is required').max(200),
});

export type CloneEstimateInput = z.infer<typeof cloneEstimateSchema>;

export type CreateEstimateFormInput = z.infer<typeof createEstimateSchema>;
export type UpdateEstimateFormInput = z.infer<typeof updateEstimateSchema>;
export type TermsSectionInput = z.infer<typeof termsSectionSchema>;
