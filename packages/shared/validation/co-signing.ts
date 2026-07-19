import { z } from 'zod';

// 5D §6 — CO signing inputs. Signature completion reuses
// completeSignatureSchema from ./signing (the capture is identical to
// M4). Declining a CO records notes only — co_signing_sessions has no
// reason-code column (unlike estimates); the CO itself stays `sent`.

export const coDeclineSchema = z.object({
  decline_notes: z.string().max(2000).optional(),
});

// Send = internal acceptance (D-4) + client delivery by email (signed-artifact
// spec §7, reopening F-3). Recipient fields stay optional: when omitted the
// send route resolves the change order's project primary contact. The
// contractor signature is captured at send (spec §4.2): mode + printed name are
// required on the FIRST send (when the CO has no contractor signature yet) and
// reused verbatim on re-send. Subject/body are optional company-templated
// overrides (defaults in proposal-defaults.ts).
export const coSendSchema = z.object({
  recipient_name: z.string().max(200).optional(),
  recipient_email: z.string().email('Invalid email address').max(320).optional(),
  expires_in_days: z.number().int().min(1).max(365).optional(),
  contractor_signature_mode: z.enum(['saved_image', 'typed_name']).optional(),
  contractor_signature_name: z.string().min(1).max(200).optional(),
  subject: z.string().max(200).optional(),
  body: z.string().max(5000).optional(),
});

export type CoDeclineInput = z.infer<typeof coDeclineSchema>;
export type CoSendInput = z.infer<typeof coSendSchema>;
