import { z } from 'zod';

// 5D §6 — CO signing inputs. Signature completion reuses
// completeSignatureSchema from ./signing (the capture is identical to
// M4). Declining a CO records notes only — co_signing_sessions has no
// reason-code column (unlike estimates); the CO itself stays `sent`.

export const coDeclineSchema = z.object({
  decline_notes: z.string().max(2000).optional(),
});

// Send = internal acceptance (D-4). Recipient fields are optional at
// launch: with client delivery gated (F-3) the contractor shares the
// tokenized link manually, so there may be no email on file.
export const coSendSchema = z.object({
  recipient_name: z.string().max(200).optional(),
  recipient_email: z.string().email('Invalid email address').max(320).optional(),
  expires_in_days: z.number().int().min(1).max(365).optional(),
});

export type CoDeclineInput = z.infer<typeof coDeclineSchema>;
export type CoSendInput = z.infer<typeof coSendSchema>;
