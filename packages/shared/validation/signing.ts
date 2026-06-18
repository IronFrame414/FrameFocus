import { z } from 'zod';
import { declineReasonCodes } from './estimate';

// Spec 2 (4F) — public signing page inputs. Enums mirror the
// signing_sessions CHECK constraints (migration 20260612161659).
// decline reason codes are shared with estimates.decline_reason_code
// (same six values).

export const signatureTypes = ['draw', 'type'] as const;

// ~500KB cap on the base64 signature PNG
const MAX_SIGNATURE_DATA_LENGTH = 500 * 1024;

export const completeSignatureSchema = z.object({
  signature_type: z.enum(signatureTypes),
  signature_data: z
    .string()
    .min(1, 'Signature is required')
    .max(MAX_SIGNATURE_DATA_LENGTH, 'Signature image is too large'),
  signer_name: z.string().min(1, 'Name is required').max(200),
  consent_given: z.literal(true, {
    errorMap: () => ({ message: 'You must agree to the terms to sign' }),
  }),
});

export const declineSchema = z.object({
  decline_reason: z.enum(declineReasonCodes),
  decline_notes: z.string().max(2000).optional(),
});

export type CompleteSignatureInput = z.infer<typeof completeSignatureSchema>;
export type DeclineInput = z.infer<typeof declineSchema>;
