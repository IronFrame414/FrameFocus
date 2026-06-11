import { z } from 'zod';

// Enums mirror the CHECK constraints on cost_catalog exactly
// (migration 20260611002451). `allowance` is intentionally absent from
// unit_of_measure — it is an estimate-time concept (4C/4D), not a
// catalog property.

export const catalogCategories = [
  'lumber',
  'fasteners',
  'electrical',
  'plumbing',
  'finishes',
  'concrete',
  'drywall',
  'roofing',
  'paint',
  'hardware',
  'insulation',
  'other',
] as const;

export const catalogUnitsOfMeasure = [
  'each',
  'sq_ft',
  'linear_ft',
  'box',
  'bundle',
  'bag',
  'gallon',
  'pair',
  'set',
  'other',
] as const;

export const costCatalogSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  category: z.enum(catalogCategories),
  unit_of_measure: z.enum(catalogUnitsOfMeasure),
  unit_cost: z.number().positive('Unit cost must be greater than zero'),
  default_vendor_id: z.string().uuid().optional(),
  product_url: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  last_verified_at: z.string().optional(),
  notes: z.string().optional(),
});

export type CostCatalogInput = z.infer<typeof costCatalogSchema>;
