import { z } from 'zod';
import { discountTypes } from './estimate';

// Enums mirror the CHECK constraints on the estimate child tables
// (migration 20260618120000, amended 20261025000000).
//
// [S170] 'allowance' is a ROW TYPE now, not a unit of measure. _Superseded
// comment, quoted not deleted: "`allowance` IS valid here — unlike the cost
// catalog — because allowance is an estimate-time concept on a material row
// (§4.5/§4.14)."_ It left the UoM enum and the DB CHECK in the same migration.

// 4D-rev: a line item is composed of typed rows; no more line_type.
export const rowTypes = ['labor', 'material', 'subcontractor', 'other', 'allowance'] as const;

export const laborUnits = ['hours', 'days'] as const;

export const materialUnitsOfMeasure = [
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

export const estimateAttachmentTypes = ['site_photo', 'plan', 'sub_bid', 'other'] as const;

export const estimateCategorySchema = z.object({
  estimate_id: z.string().uuid(),
  name: z.string().min(1, 'Category name is required').max(200),
  sort_order: z.number().int(),
});

export const estimateSubcategorySchema = z.object({
  estimate_id: z.string().uuid(),
  category_id: z.string().uuid(),
  name: z.string().min(1, 'Subcategory name is required').max(200),
  sort_order: z.number().int(),
});

// 4D-rev: a line item is a named unit with a per-line discount and an
// optional total override. Costs and markups live on its rows
// (estimateLineRowSchema), not here.
export const estimateLineItemSchema = z.object({
  estimate_id: z.string().uuid(),
  category_id: z.string().uuid(),
  subcategory_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1, 'Line item name is required').max(200),
  description: z.string().optional(),
  discount_type: z.enum(discountTypes).nullable().optional(),
  discount_amount: z.number().min(0).nullable().optional(),
  total_price_override: z.number().min(0).nullable().optional(),
  notes: z.string().optional(),
  sort_order: z.number().int(),
});

// 4D-rev: one schema for all four row types, refined so only the
// columns valid for the row_type are present (mirrors the DB CHECK
// `estimate_line_rows_type_columns`).
export const estimateLineRowSchema = z
  .object({
    line_item_id: z.string().uuid(),
    row_type: z.enum(rowTypes),
    name: z.string().min(1, 'Row name is required').max(200),
    sort_order: z.number().int(),
    markup_percent: z.number().min(0).nullable().optional(),
    apply_tax: z.boolean().default(false),
    // Labor
    rate: z.number().min(0).nullable().optional(),
    quantity: z.number().min(0).nullable().optional(),
    labor_unit: z.enum(laborUnits).nullable().optional(),
    // Material
    catalog_item_id: z.string().uuid().nullable().optional(),
    unit_of_measure: z.enum(materialUnitsOfMeasure).nullable().optional(),
    unit_cost: z.number().min(0).nullable().optional(),
    // Subcontractor / Other
    amount: z.number().min(0).nullable().optional(),
    subcontractor_id: z.string().uuid().nullable().optional(),
  })
  .refine((r) => r.row_type !== 'labor' || r.apply_tax === false, {
    message: 'Labor rows are never taxed',
    path: ['apply_tax'],
  })
  .refine(
    (r) =>
      r.row_type !== 'labor' ||
      (r.amount == null &&
        r.subcontractor_id == null &&
        r.catalog_item_id == null &&
        r.unit_of_measure == null &&
        r.unit_cost == null),
    { message: 'Labor rows only use rate, quantity, and unit', path: ['row_type'] }
  )
  .refine(
    (r) =>
      r.row_type !== 'material' ||
      (r.rate == null && r.labor_unit == null && r.amount == null && r.subcontractor_id == null),
    { message: 'Material rows only use quantity, unit, and unit cost', path: ['row_type'] }
  )
  .refine(
    (r) =>
      (r.row_type !== 'subcontractor' && r.row_type !== 'other') ||
      (r.rate == null &&
        r.quantity == null &&
        r.labor_unit == null &&
        r.catalog_item_id == null &&
        r.unit_of_measure == null &&
        r.unit_cost == null),
    { message: 'This row type only uses a single amount', path: ['row_type'] }
  )
  .refine((r) => r.row_type !== 'other' || r.subcontractor_id == null, {
    message: 'Only subcontractor rows take a subcontractor',
    path: ['subcontractor_id'],
  });

export const estimateSubBidSchema = z.object({
  estimate_id: z.string().uuid(),
  line_item_id: z.string().uuid(),
  subcontractor_id: z.string().uuid('A subcontractor is required'),
  bid_amount: z.number().min(0, 'Bid amount cannot be negative'),
  bid_document_file_id: z.string().uuid().nullable().optional(),
  notes: z.string().optional(),
  received_at: z.string().optional(),
});

export const estimateFileSchema = z.object({
  estimate_id: z.string().uuid(),
  file_id: z.string().uuid(),
  attachment_type: z.enum(estimateAttachmentTypes),
  notes: z.string().optional(),
  sort_order: z.number().int().optional(),
});

export type EstimateCategoryInput = z.infer<typeof estimateCategorySchema>;
export type EstimateSubcategoryInput = z.infer<typeof estimateSubcategorySchema>;
export type EstimateLineItemInput = z.infer<typeof estimateLineItemSchema>;
export type EstimateLineRowInput = z.infer<typeof estimateLineRowSchema>;
export type EstimateSubBidInput = z.infer<typeof estimateSubBidSchema>;
export type EstimateFileInput = z.infer<typeof estimateFileSchema>;
