import { z } from 'zod';

export const contactAddressSchema = z.object({
  label: z.string().max(100).optional(),
  address_line1: z.string().min(1, 'Address line 1 is required').max(200),
  address_line2: z.string().max(200).optional(),
  city: z.string().min(1, 'City is required').max(100),
  state: z.string().min(1, 'State is required').max(100),
  zip: z.string().min(1, 'ZIP is required').max(20),
  is_primary: z.boolean(),
});

export type ContactAddressInput = z.infer<typeof contactAddressSchema>;
