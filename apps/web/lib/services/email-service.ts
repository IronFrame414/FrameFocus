import 'server-only';
import { Resend } from 'resend';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';

// Spec 2 — Resend client wrapper + email_logs bookkeeping.
// Server-only: API routes and the cron job. Sending domain is
// rafterworks.com (verified in Resend); each tenant sends as
// "<Company Name> <slug@rafterworks.com>" (single verified domain,
// dynamic local part).

export const SENDING_DOMAIN = 'rafterworks.com';

let _resend: Resend | null = null;

/** Lazy init — never instantiate at module load (Module 3H rule). */
export function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error('RESEND_API_KEY is not set');
    _resend = new Resend(key);
  }
  return _resend;
}

export function buildSenderAddress(company: { name: string; slug: string }): string {
  return `${company.name} <${company.slug}@${SENDING_DOMAIN}>`;
}

export type TemplateVariables = {
  company_name: string;
  contact_name: string;
  estimate_number: string;
  estimate_name: string;
  signing_link: string;
  expiration_date: string;
  sent_date: string;
};

/**
 * Replaces {{var}} tokens. Unknown tokens are left untouched. Accepts any
 * string map so change-order variables (co_number, co_title, …) reuse the same
 * substitution as the estimate variables — TemplateVariables is a compatible
 * subtype.
 */
export function replaceTemplateVariables(
  template: string,
  variables: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in variables ? variables[key] : match
  );
}

// Hardcoded fallbacks live in a client-safe module (the send modal
// pre-fills from them too); re-exported here for server callers.
export {
  DEFAULT_PROPOSAL_BODY,
  DEFAULT_PROPOSAL_SUBJECT,
  DEFAULT_REMINDER_BODY,
  DEFAULT_REMINDER_SUBJECT,
  DEFAULT_CO_BODY,
  DEFAULT_CO_SUBJECT,
  DEFAULT_CO_REMINDER_BODY,
  DEFAULT_CO_REMINDER_SUBJECT,
} from '@/lib/proposal/proposal-defaults';

export type EmailType =
  | 'proposal'
  | 'reminder'
  | 'signature_complete'
  | 'signature_declined'
  | 'estimate_expired'
  // Signed-artifact spec §7 — change-order email types.
  | 'change_order'
  | 'co_reminder'
  | 'co_signature_complete'
  | 'co_signature_declined';

export interface LogEmailInput {
  company_id: string;
  estimate_id: string | null;
  signing_session_id: string | null;
  // Signed-artifact spec §4.3 — CO email FKs (nullable; set only for CO emails).
  change_order_id?: string | null;
  co_signing_session_id?: string | null;
  resend_message_id: string | null;
  email_type: EmailType;
  recipient_email: string;
  sender_email: string;
  subject: string;
  status: 'sent' | 'failed';
  metadata?: Record<string, unknown>;
}

/**
 * Inserts an email_logs row via the service-role client. Logged on
 * success AND failure — failed sends matter for the audit trail.
 */
export async function logEmail(
  admin: SupabaseClient<Database>,
  input: LogEmailInput
): Promise<string | null> {
  const { data, error } = await admin
    .from('email_logs')
    .insert({
      company_id: input.company_id,
      estimate_id: input.estimate_id,
      signing_session_id: input.signing_session_id,
      // New columns from the signed-artifact migration — expected type errors
      // against the un-regenerated database.ts until the migration is applied.
      change_order_id: input.change_order_id ?? null,
      co_signing_session_id: input.co_signing_session_id ?? null,
      resend_message_id: input.resend_message_id,
      email_type: input.email_type,
      recipient_email: input.recipient_email,
      sender_email: input.sender_email,
      subject: input.subject,
      status: input.status,
      metadata: (input.metadata ?? {}) as never,
    })
    .select('id')
    .single();

  if (error) {
    console.error('email_logs insert failed:', error.message);
    return null;
  }
  return data.id;
}

export interface SendEmailParams {
  from: string;
  to: string;
  subject: string;
  react: React.ReactElement;
  attachments?: Array<{ filename: string; content: Buffer }>;
}

/**
 * Thin Resend send wrapper. Returns the Resend message id, or an
 * error message. No retries (Module 3H rule — avoid double-sends).
 */
export async function sendEmail(
  params: SendEmailParams
): Promise<{ messageId: string | null; error: string | null }> {
  const resend = getResend();
  const { data, error } = await resend.emails.send({
    from: params.from,
    to: [params.to],
    subject: params.subject,
    react: params.react,
    attachments: params.attachments,
  });

  if (error) return { messageId: null, error: error.message };
  return { messageId: data?.id ?? null, error: null };
}

/**
 * Owner/Admin recipients for heads-up notifications (sign / decline
 * / expiration). Reads via the service-role client — callers run in
 * public-route or cron contexts with no auth.uid().
 */
export async function getManagerRecipients(
  admin: SupabaseClient<Database>,
  companyId: string
): Promise<Array<{ email: string; first_name: string }>> {
  const { data } = await admin
    .from('profiles')
    .select('email, first_name')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .in('role', ['owner', 'admin']);

  return data ?? [];
}
