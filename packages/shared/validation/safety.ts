import { z } from 'zod';
import { INCIDENT_TYPES } from '../constants/safety';

// 6C — incident creation payload (POST /api/safety-incidents). Mirrors the
// live constraints: member-or-outsider identity (num_nonnulls = 1) per party
// row, and the injury invariant (type 'injury' ⇒ ≥1 injured party) so the
// deferred DB trigger never has to fire the rejection.

const personRow = {
  member_id: z.string().uuid().nullable().optional(),
  name: z.string().max(200).nullable().optional(),
};

export const incidentInjurySchema = z
  .object({
    ...personRow,
    treatment_sought: z.boolean().default(false),
    treatment_notes: z.string().max(2000).nullable().optional(),
  })
  .refine((r) => Boolean(r.member_id) !== Boolean(r.name?.trim()), {
    message: 'Each injured party is a roster member OR a typed outside name — exactly one',
  });

export const incidentWitnessSchema = z
  .object(personRow)
  .refine((r) => Boolean(r.member_id) !== Boolean(r.name?.trim()), {
    message: 'Each witness is a roster member OR a typed outside name — exactly one',
  });

export const incidentCreateSchema = z
  .object({
    project_id: z.string().uuid().nullable(), // null = shop/yard (Phase 3 Q3)
    incident_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'incident_date must be YYYY-MM-DD'),
    incident_type: z.enum(INCIDENT_TYPES),
    description: z.string().min(1, 'Description is required').max(5000),
    prevention_notes: z.string().max(5000).nullable().optional(),
    injuries: z.array(incidentInjurySchema).default([]),
    witnesses: z.array(incidentWitnessSchema).default([]),
  })
  .refine((i) => i.incident_type !== 'injury' || i.injuries.length > 0, {
    message: 'An injury must name at least one injured party',
  });

export type IncidentCreateInput = z.infer<typeof incidentCreateSchema>;
