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
    /** files.id list — already-uploaded photos to bind to this line (S90). */
    photo_file_ids: z.array(z.string().uuid()).max(20).optional(),
  })
  .refine((i) => i.qty_damaged <= i.qty_received, {
    message: 'Damaged quantity cannot exceed received',
  })
  .refine((i) => i.qty_damaged <= 0 || (i.photo_file_ids?.length ?? 0) > 0, {
    message: 'A damage photo is required on any line with damaged quantity',
  });

export const deliveryCheckInSchema = z.object({
  project_id: z.string().uuid(),
  purchase_order_id: z.string().uuid().nullable().optional(),
  vendor_name: z.string().min(1, 'Vendor is required').max(200),
  delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'delivery_date must be YYYY-MM-DD'),
  notes: z.string().max(2000).nullable().optional(),
  items: z.array(deliveryCheckInItemSchema).min(1, 'At least one line is required'),
  /** files.id list — general whole-delivery photos, always optional (S90). */
  photo_file_ids: z.array(z.string().uuid()).max(20).optional(),
});

export type DeliveryCheckInInput = z.infer<typeof deliveryCheckInSchema>;

// 6D — delivery edit payload (PUT /api/deliveries/[id], S90). Same damage
// rule as check-in. Existing photos already bound to a line live in the DB,
// which zod cannot see — the form reports them via existing_photo_count so
// this layer blocks the obvious miss with the same message; the route
// re-derives the truth from files.delivery_item_id and is authoritative.

export const deliveryEditItemSchema = z
  .object({
    /** Present when editing an existing line; absent for new lines. */
    id: z.string().uuid().optional(),
    po_item_id: z.string().uuid().nullable().optional(),
    description: z.string().min(1, 'Item description is required').max(500),
    qty_received: z.number().min(0, 'Received cannot be negative'),
    qty_damaged: z.number().min(0, 'Damaged cannot be negative'),
    issue_note: z.string().max(1000).nullable().optional(),
    /** files.id list — NEWLY uploaded photos to bind to this line. */
    photo_file_ids: z.array(z.string().uuid()).max(20).optional(),
    /** Photos already bound to this line (form-reported; route re-verifies). */
    existing_photo_count: z.number().int().min(0).default(0),
  })
  .refine((i) => i.qty_damaged <= i.qty_received, {
    message: 'Damaged quantity cannot exceed received',
  })
  .refine(
    (i) => i.qty_damaged <= 0 || (i.photo_file_ids?.length ?? 0) + i.existing_photo_count > 0,
    { message: 'A damage photo is required on any line with damaged quantity' }
  );

export const deliveryEditSchema = z.object({
  /** Ignored by the route on PO-linked deliveries (vendor comes from the PO). */
  vendor_name: z.string().min(1, 'Vendor is required').max(200).optional(),
  delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'delivery_date must be YYYY-MM-DD'),
  notes: z.string().max(2000).nullable().optional(),
  items: z.array(deliveryEditItemSchema).min(1, 'At least one line is required'),
  /** files.id list — NEW general whole-delivery photos, always optional. */
  photo_file_ids: z.array(z.string().uuid()).max(20).optional(),
});

export type DeliveryEditInput = z.infer<typeof deliveryEditSchema>;
