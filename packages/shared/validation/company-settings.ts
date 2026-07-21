import { z } from 'zod';
import { pricingModes, proposalPricingLevels, termsSectionSchema } from './estimate';
import { reminderScheduleSchema } from './email';

// 4M — Estimating settings on companies (Spec 1).
// Enums mirror the CHECK constraints exactly (migration
// 20260612155156). All defaults are nullable: a company may set
// only some of them, and 4D surfaces "no default set" warnings at
// estimate-creation time when relevant.

// 2–25 chars, A-Z 0-9 and dashes; no leading/trailing/double dash.
// The server/client normalizes to uppercase BEFORE validating.
export const estimateNumberPrefixSchema = z
  .string()
  .min(2, 'Prefix must be at least 2 characters')
  .max(25, 'Prefix must be 25 characters or fewer')
  .regex(
    /^[A-Z0-9](?:[A-Z0-9-]{0,23}[A-Z0-9])?$/,
    'Use only A–Z, 0–9, and dashes; no leading or trailing dash'
  )
  .refine((v) => !v.includes('--'), {
    message: 'No consecutive dashes',
  });

// Markup has no hard ceiling in practice; 1000% is a sanity cap.
export const markupPercentSchema = z
  .number()
  .min(0, 'Cannot be negative')
  .max(1000, 'Markup cannot exceed 1000%');

// Margin is bounded by the equation total = cost / (1 − pct/100):
// ≥ 100 divides by zero or flips sign. Cap 99.99.
export const marginPercentSchema = z
  .number()
  .min(0, 'Cannot be negative')
  .max(99.99, 'Margin must be below 100%');

export const taxRateSchema = z
  .number()
  .min(0, 'Cannot be negative')
  .max(100, 'Tax rate cannot exceed 100%')
  .refine((v) => Math.round(v * 100) / 100 === v, {
    message: 'Tax rate supports at most 2 decimal places',
  });

export const estimatingSettingsSchema = z.object({
  estimate_number_prefix: estimateNumberPrefixSchema.optional(),
  default_pricing_mode: z.enum(pricingModes).optional(),
  default_subcontractor_markup_percent: markupPercentSchema.nullable().optional(),
  default_material_markup_percent: markupPercentSchema.nullable().optional(),
  default_labor_markup_percent: markupPercentSchema.nullable().optional(),
  default_subcontractor_margin_percent: marginPercentSchema.nullable().optional(),
  default_material_margin_percent: marginPercentSchema.nullable().optional(),
  default_labor_margin_percent: marginPercentSchema.nullable().optional(),
  default_tax_rate: taxRateSchema.nullable().optional(),
  // 4D-rev: single company-wide default labor rate (per hour/day),
  // pre-fills new labor rows. Editable per row.
  default_labor_rate: z
    .number()
    .min(0, 'Cannot be negative')
    .max(100000, 'Labor rate looks too high')
    .nullable()
    .optional(),
  default_terms_sections: z.array(termsSectionSchema).optional(),
});

export type EstimatingSettingsInput = z.infer<typeof estimatingSettingsSchema>;

// ── Spec 2 (4E/4J) — proposals & email defaults ──

export const brandColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex color like #1a56db');

export const expirationDaysSchema = z
  .number()
  .int('Whole days only')
  .min(1, 'At least 1 day')
  .max(365, 'At most 365 days');

export const proposalSettingsSchema = z.object({
  brand_color: brandColorSchema.optional(),
  default_proposal_email_subject: z.string().max(200).nullable().optional(),
  default_proposal_email_body: z.string().max(5000).nullable().optional(),
  default_reminder_email_subject: z.string().max(200).nullable().optional(),
  default_reminder_email_body: z.string().max(5000).nullable().optional(),
  default_reminder_schedule: reminderScheduleSchema.optional(),
  default_expiration_days: expirationDaysSchema.optional(),
  default_proposal_pricing_level: z.enum(proposalPricingLevels).optional(),
});

export type ProposalSettingsInput = z.infer<typeof proposalSettingsSchema>;

// ── Company Settings pass [S86] — time-tracking settings ──
// Bounds mirror the CHECK constraints in migration 20260721050000; the
// tighter UI bounds here are sanity caps, not schema truth.

// numeric(5,2) CHECK (> 0); 168 = hours in a week.
export const otThresholdHoursSchema = z
  .number()
  .gt(0, 'Must be more than 0')
  .max(168, 'Cannot exceed 168 hours');

// integer CHECK (>= 0); 480 minutes (8h) is a sanity cap.
export const paidBreakCapMinutesSchema = z
  .number()
  .int('Whole minutes only')
  .min(0, 'Cannot be negative')
  .max(480, 'At most 480 minutes');
