import { z } from 'zod';

// 6D — delivery check-in payload (POST /api/deliveries/check-in).
// Mirrors the live delivery_items CHECKs (qty >= 0, damaged <= received) so
// bad input fails at the API boundary with a readable message instead of a
// constraint error. purchase_order_id nullable = orderless check-in (§4).

export const deliveryCheckInItemSchema = z
  .object({
    po_item_id: z.string().uuid().nullable().optional(),
    description: z.string().min(1, 'Item description is required').max(500),
    qty_received: z.number().min(0, 'Received cannot be negative'),
    qty_damaged: z.number().min(0, 'Damaged cannot be negative'),
    issue_note: z.string().max(1000).nullable().optional(),
  })
  .refine((i) => i.qty_damaged <= i.qty_received, {
    message: 'Damaged quantity cannot exceed received',
  });

export const deliveryCheckInSchema = z.object({
  project_id: z.string().uuid(),
  purchase_order_id: z.string().uuid().nullable().optional(),
  vendor_name: z.string().min(1, 'Vendor is required').max(200),
  delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'delivery_date must be YYYY-MM-DD'),
  notes: z.string().max(2000).nullable().optional(),
  items: z.array(deliveryCheckInItemSchema).min(1, 'At least one line is required'),
});

export type DeliveryCheckInInput = z.infer<typeof deliveryCheckInSchema>;
