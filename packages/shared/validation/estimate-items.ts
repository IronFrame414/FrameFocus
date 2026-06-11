import { z } from 'zod';
import { discountTypes } from './estimate';

// Enums mirror the CHECK constraints on the estimate child tables
// exactly (migration 20260611102749). `allowance` IS valid here —
// unlike the cost catalog — because allowance is an estimate-time
// concept on a material row (§4.5/§4.14).

export const lineTypes = ['detailed', 'lump_sum'] as const;

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
  'allowance',
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

export const estimateLineItemSchema = z
  .object({
    estimate_id: z.string().uuid(),
    category_id: z.string().uuid(),
    subcategory_id: z.string().uuid().nullable().optional(),
    name: z.string().min(1, 'Line item name is required').max(200),
    description: z.string().optional(),
    line_type: z.enum(lineTypes),
    sub_bid_amount: z.number().min(0).nullable().optional(),
    subcontractor_id: z.string().uuid().nullable().optional(),
    labor_cost: z.number().min(0).nullable().optional(),
    subcontractor_markup_percent: z.number().min(0).nullable().optional(),
    labor_markup_percent: z.number().min(0).nullable().optional(),
    material_markup_percent: z.number().min(0).nullable().optional(),
    discount_type: z.enum(discountTypes).nullable().optional(),
    discount_amount: z.number().min(0).nullable().optional(),
    notes: z.string().optional(),
    sort_order: z.number().int(),
  })
  .refine(
    (item) => item.line_type === 'lump_sum' || item.sub_bid_amount == null,
    { message: 'Sub bid amount applies only to lump-sum lines', path: ['sub_bid_amount'] }
  )
  .refine(
    (item) => item.line_type === 'detailed' || item.labor_cost == null,
    { message: 'Labor cost applies only to detailed lines', path: ['labor_cost'] }
  );

export const estimateLineMaterialSchema = z.object({
  line_item_id: z.string().uuid(),
  catalog_item_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1, 'Material name is required').max(200),
  unit_of_measure: z.enum(materialUnitsOfMeasure),
  unit_cost: z.number().min(0, 'Unit cost cannot be negative'),
  quantity: z.number().min(0).nullable().optional(),
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
export type EstimateLineMaterialInput = z.infer<typeof estimateLineMaterialSchema>;
export type EstimateSubBidInput = z.infer<typeof estimateSubBidSchema>;
export type EstimateFileInput = z.infer<typeof estimateFileSchema>;
