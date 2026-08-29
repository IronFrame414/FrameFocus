import 'server-only';
import { Resend } from 'resend';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';

// Spec 2 — Resend client wrapper + email_logs bookkeeping.
// Server-only: API routes and the cron job. Sending domain is
// ezcontractorbinder.com (verified in Resend); each tenant sends as
// "<Company Name> <slug@ezcontractorbinder.com>" (single verified domain,
// dynamic local part).
//
// +REPLY-TO [Josh, S97 — platform-wide]: every CLIENT-FACING send carries
// Reply-To = the sending company's own address, so a client's reply reaches the
// company rather than the platform domain. The From line is unchanged. Pass
// `replyToCompanyId` and sendEmail() resolves it — see resolveCompanyReplyTo
// for the order (companies.email -> owner's email -> no header).
//
// INTERNAL mail is deliberately EXCLUDED: manager notifications
// (signing-service, co-signing-service's signed/declined notices,
// incident-notify, the delivery check-in) already go TO the company, so a
// reply-to pointing back at it adds nothing. They simply omit
// replyToCompanyId.

/**
 * The single Resend-verified domain every tenant sends from.
 *
 * WHY THIS IS NOT IN lib/brand.ts [S99]
 * It looks like a brand constant and it is not. Every value in brand.ts can be
 * edited freely — rename the product and `brand.name` is true the moment it is
 * saved. This string is a CLAIM ABOUT EXTERNAL STATE: that DKIM, SPF and DMARC
 * are published for this domain at the registrar and that Resend shows it
 * verified. Editing it without that being true does not mis-label a screen, it
 * makes Resend reject EVERY send — proposals, invoices, change orders, all
 * three reminder crons — with no UI anywhere that would show it.
 *
 * Sitting it next to `brand.name` would invite exactly that: a future rename
 * edits the file, sees a domain that no longer matches the new name, and
 * "finishes the job". The two must be able to diverge. A sender-reputation
 * split onto a subdomain, or a rebrand that keeps the warmed-up domain, are
 * both ordinary — and neither is a brand decision.
 *
 * It also belongs on the server side of the line: brand.ts is imported into
 * client bundles (nav, landing, manifest), this module is `server-only`.
 * Nothing about the domain is secret, but nothing client-side needs it either.
 *
 * TO CHANGE IT: verify the new domain in Resend FIRST, then edit here.
 */
export const SENDING_DOMAIN = 'ezcontractorbinder.com';

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
  DEFAULT_INVOICE_BODY,
  DEFAULT_INVOICE_SUBJECT,
  DEFAULT_INVOICE_REMINDER_BODY,
  DEFAULT_INVOICE_REMINDER_SUBJECT,
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
  | 'co_signature_declined'
  // 6D §7 — delivery check-in notification (email_types row seeded in S78).
  | 'material_delivery'
  // 6C §4 — incident hierarchy notification (email_types row seeded in S78).
  | 'safety_incident'
  // 7D1 §13 — a sent invoice delivered to the client, PDF attached
  // (email_types row seeded in 20260807000000).
  | 'invoice'
  // 7E §6 — an AR reminder on an overdue invoice (email_types row seeded in
  // 20260815000000). The ONLY §7 event that rides this mechanism — see the
  // reminder cron's header.
  | 'invoice_reminder'
  // Chat §5.6a / ND-42 — a mentioned SUBCONTRACTOR only. The `email_types.mention`
  // row landed with the chat schema in 20260906000000; this union did not, so
  // `logEmail({ email_type: 'mention' })` did not type-check until slice 4.
  // Half the registry shipped and the half that fails a build did not — found
  // by S126's ruling sweep, not by anything failing.
  | 'mention'
  // D2 [S135] — a team invitation. The `email_types.invite` row lands in
  // 20260915000000, in the SAME commit as this line: S126 found `mention`
  // shipped in the table and missing from this union, and that half only fails
  // at compile time, so it shipped silently. Both halves or neither.
  | 'invite'
  // S137 — the day −7 / day −3 trial warning. `email_types.trial_warning` row
  // lands in 20260918000000, same rule as above: both halves or neither.
  | 'trial_warning'
  // PO module R-L4 — the vendor-facing purchase order. `email_types` row lands
  // in 20261047000000, SAME commit as this line (both halves or neither).
  | 'purchase_order'
  // ── P1/P2 [S160] — the emails SUPABASE AUTH composes ─────────────────────
  // Rows land in 20261009000000, in the SAME commit as these lines. The rule
  // this union has been bitten by twice (`mention`, then nearly `invite`) is
  // that the table half fails at RUNTIME and the union half at COMPILE time, so
  // shipping one without the other ships silently. Both halves or neither.
  //
  // ⚠️ `auth_invite` IS NOT `invite`. `invite` is OUR invitation, from
  // `sendInviteEmail()`, branded with the tenant and carrying
  // `/invite/accept?token=…`. `auth_invite` is GoTrue's own, which only fires
  // from the Supabase dashboard's Authentication → Users → Invite button and
  // which nothing in this repository triggers. Telling them apart in
  // `email_logs` is the entire subject of the S159 investigation.
  | 'auth_signup_confirmation'
  | 'auth_recovery'
  | 'auth_magic_link'
  | 'auth_email_change'
  | 'auth_reauthentication'
  | 'auth_invite'
  // S174 #1 — a batch of selections released to the client. The
  // `email_types.selection_released` row lands in 20261029000000, in the SAME
  // commit as this line. Third time this rule is written down and it has been
  // broken once (`mention`): the table half fails at RUNTIME, this half at
  // COMPILE time, so one without the other ships silently. Both halves or
  // neither.
  | 'selection_released'
  // [S175 stage 6] The specifications sheet, PDF attached. The
  // `email_types.selection_specifications` row lands in 20261036000000, in the
  // SAME commit as this line — fourth time this rule is written down.
  //
  // ⚠️ NOT `selection_released`, and the difference is the whole point. That
  // one asks the client to CHOOSE and links the portal; this one tells her
  // what she chose and carries the sheet. The filed PDF is REPLACED on every
  // regeneration (Q4.1), so `email_logs` is the only record of which version
  // went out when — and one type covering both messages would make that
  // question unanswerable.
  | 'selection_specifications';

export interface LogEmailInput {
  company_id: string;
  estimate_id: string | null;
  signing_session_id: string | null;
  // Signed-artifact spec §4.3 — CO email FKs (nullable; set only for CO emails).
  change_order_id?: string | null;
  co_signing_session_id?: string | null;
  /** 7D1 §13 — the invoice this email delivered (20260807000000). */
  invoice_id?: string | null;
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
      invoice_id: input.invoice_id ?? null,
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
  /** Explicit Reply-To. Normally leave unset and pass replyToCompanyId. */
  replyTo?: string | null;
  /** +REPLY-TO [Josh, S97 — platform-wide]: a client's reply must reach the
   *  COMPANY, not the platform domain. Pass the sending company's id and this
   *  wrapper resolves and sets Reply-To itself, so a sender added later
   *  INHERITS the behaviour instead of having to remember it.
   *
   *  Omit for INTERNAL mail (manager notifications) — see the resolver. */
  replyToCompanyId?: string | null;
}

/**
 * +REPLY-TO — the company's contact address.
 *
 * SOURCE OF TRUTH, in order:
 *   1. companies.email — the column EXISTS and is the intended home.
 *   2. the OWNER's profile email — used when the company has not filled it in.
 *   3. NULL — no Reply-To header at all. The send still goes; a missing reply
 *      address must never fail a send or make one up.
 *
 * THE CACHE IS NOW TIME-LIMITED [S97]. It was "resolved once per process", set
 * on the assumption that companies.email could not change — true only because
 * nothing could SET it. Now that Company Settings has a Company Email control,
 * an unbounded cache means Josh fills the field in, sends a test, and still
 * sees the owner's address: the new control would look broken when it is not.
 * A short TTL keeps the read off the hot path without outliving an edit in any
 * way a person would notice.
 */
const REPLY_TO_TTL_MS = 60_000;
const replyToCache = new Map<string, { value: string | null; expires: number }>();

export async function resolveCompanyReplyTo(companyId: string): Promise<string | null> {
  const cached = replyToCache.get(companyId);
  if (cached && cached.expires > Date.now()) return cached.value;

  const admin = getSupabaseAdmin() as SupabaseClient<Database>;

  const { data: company } = await admin
    .from('companies')
    .select('email')
    .eq('id', companyId)
    .maybeSingle();

  let resolved: string | null =
    company?.email && company.email.trim() !== '' ? company.email.trim() : null;

  if (!resolved) {
    const { data: owner } = await admin
      .from('profiles')
      .select('email')
      .eq('company_id', companyId)
      .eq('role', 'owner')
      .eq('is_deleted', false)
      .limit(1)
      .maybeSingle();
    resolved = owner?.email && owner.email.trim() !== '' ? owner.email.trim() : null;
  }

  replyToCache.set(companyId, { value: resolved, expires: Date.now() + REPLY_TO_TTL_MS });
  return resolved;
}

/**
 * Thin Resend send wrapper. Returns the Resend message id, or an
 * error message. No retries (Module 3H rule — avoid double-sends).
 */
export async function sendEmail(
  params: SendEmailParams
): Promise<{ messageId: string | null; error: string | null }> {
  const resend = getResend();

  // Resolved HERE rather than at each call site, so a sender added later
  // inherits it. A failure to resolve is never a failure to send.
  let replyTo = params.replyTo ?? null;
  if (!replyTo && params.replyToCompanyId) {
    try {
      replyTo = await resolveCompanyReplyTo(params.replyToCompanyId);
    } catch (err) {
      console.error('reply-to resolution failed; sending without it', err);
      replyTo = null;
    }
  }

  const { data, error } = await resend.emails.send({
    from: params.from,
    to: [params.to],
    subject: params.subject,
    react: params.react,
    attachments: params.attachments,
    // Omitted entirely when null — never an empty header, never the recipient.
    ...(replyTo ? { replyTo } : {}),
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
