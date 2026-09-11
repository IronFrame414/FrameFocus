import 'server-only';
import { Resend } from 'resend';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  buildUnsubscribeHeaders,
  isEmailUnsubscribed,
  type UnsubscribeScope,
} from '@/lib/services/email-unsubscribe';
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

/**
 * Where PLATFORM mail tells the reader to reply [Josh, deletion-sweep
 * session]. The sending domain is verified in Resend for SENDING only — it
 * has no inbox — so a Reply-To on the domain would silently eat replies the
 * ruled copy promises are read ("Questions? Reply to this email"). This is
 * the monitored box, and it is also the contact address the published terms
 * and privacy policy name.
 *
 * PLATFORM mail only. Tenant-facing mail (proposals, invoices, COs) resolves
 * Reply-To to the COMPANY via resolveCompanyReplyTo() — a client's reply must
 * reach the contractor, never this box.
 */
export const SUPPORT_REPLY_TO = 'ezcontractorbinder@gmail.com';

// ===========================================================================
// THE SEND GATE — RULED [Josh, email-loop sessions, 2026-08-30]
// ===========================================================================
// Every real send this platform has ever made from the test environment went
// through a LIVE key that happened to be present (423 sends, 86% into one
// mailbox, 51 guaranteed bounces — docs/specs/email-loop-diagnosis.md). S126's
// rule — "the transport is stubbed" — was convention, and convention did not
// survive a Playwright suite driving the real dev server, where nothing can be
// stubbed. This gate is that rule made structural, at the ONE call site
// (sendEmail below) every product sender goes through.
//
// WHO MAY SEND:
//   EMAIL_SEND_ENABLED=false  → nobody, anywhere. The kill switch outranks
//                               everything, production included.
//   EMAIL_SEND_ENABLED=true   → this process, explicitly. The deliberate
//                               override for a supervised non-prod send.
//   neither set               → only a Vercel PRODUCTION deployment
//                               (VERCEL_ENV === 'production').
//
// WHY VERCEL_ENV AND NOT A HUMAN-SET FLAG AS THE PRODUCTION PATH: default-deny
// is safe in test and catastrophic in production if the flag goes missing —
// the retention warnings are the only channel that reaches a locked customer.
// The tension resolves by keying production-allow on a variable THE PLATFORM
// sets on every production deployment, so it cannot be forgotten by a human;
// the human-set flag exists only as an explicit override in either direction.
// Preview deploys (VERCEL_ENV='preview'), CI, Codespaces and dev servers all
// land in default-deny.
//
// A REFUSAL IS LOUD, NEVER SILENT: sendEmail returns it as `error`, so every
// existing caller writes an email_logs row with status 'failed' and the reason
// in metadata — the same audit surface a missing key already uses, which the
// incident retry banner reads — and console.error names it server-side.
export type SendGateDecision = { allowed: true } | { allowed: false; reason: string };

export function emailSendAllowed(env: NodeJS.ProcessEnv = process.env): SendGateDecision {
  if (env.EMAIL_SEND_ENABLED === 'false') {
    return { allowed: false, reason: 'EMAIL_SEND_ENABLED=false — kill switch' };
  }
  if (env.EMAIL_SEND_ENABLED === 'true') return { allowed: true };
  if (env.VERCEL_ENV === 'production') return { allowed: true };
  return {
    allowed: false,
    reason: `send not authorized here: EMAIL_SEND_ENABLED is unset and VERCEL_ENV=${
      env.VERCEL_ENV ?? '(unset)'
    } is not 'production'`,
  };
}

// ===========================================================================
// THE BOUNCE GUARD — RULED [Josh, deliverability session, 2026-09-10]
// ===========================================================================
// Refuse, at the chokepoint, any recipient on a domain that CANNOT EXIST.
//
// WHY THIS IS NOT A FIXTURE PROBLEM. 52 sends went to
// `qa-client-a@example.invalid` — an RFC 2606 reserved TLD that can never
// resolve — and every one of them is `status='sent'` in `email_logs` with a
// real `resend_message_id`. Resend ACCEPTED them; the hard bounce happened
// afterwards, at SES, where this platform could not see it. That was ~12% of
// the domain's volume over the period, against an industry norm that treats
// >2% as reputation-damaging, on a domain with no history to absorb it.
//
// The obvious fix — "stop putting .invalid in fixtures" — is the same class of
// control that already failed here twice: a convention, binding only the code
// that remembers it. The S126 stub-the-transport rule did not survive a
// Playwright suite driving a real dev server, which is why the send gate above
// exists. This is that lesson applied to the ADDRESS rather than the
// ENVIRONMENT, at the same single call site, so a sender added later inherits
// it instead of having to remember it.
//
// ⚠️ IT IS A RESERVED-LIST CHECK, NOT A LIVE DNS LOOKUP — RULED [Josh].
// Resolving MX/A at send time would put a network call on the critical path of
// every invoice, proposal and change order, and would fail CLOSED on a DNS
// blip — silently stopping real client mail to fix a fixture problem. The
// reserved list is static, has no false positives (these domains are reserved
// by RFC precisely so they can never be delegated), and costs nothing.
//
// ⚠️ IT GUARDS THE RECIPIENT ONLY, NEVER Reply-To. A Reply-To is resolved from
// company data (resolveCompanyReplyTo) and a useless one must never fail a
// send — the resolver already degrades to no header at all rather than to a
// failed send, and that ruling is not disturbed here.
//
// A REFUSAL IS LOUD AND IS NOT A SEND: sendEmail returns it as `error`, so
// every existing caller writes an `email_logs` row with status 'failed' and
// the reason in metadata — the same audit surface the send gate and the
// consent check already use. No caller changes, and the refused address is
// counted as a failure rather than as a send.
export type RecipientDecision = { deliverable: true } | { deliverable: false; reason: string };

/** RFC 2606 §2 (.test/.example/.invalid/.localhost) + RFC 6761. */
const RESERVED_TLDS = [
  'invalid',
  'test',
  'example',
  'localhost',
  // RFC 6762 mDNS. Not RFC 2606, included on the same reasoning [Josh]: it can
  // never be an internet mailbox either.
  'local',
] as const;

/** RFC 2606 §3 — reserved second-level names, and anything beneath them. */
const RESERVED_DOMAINS = ['example.com', 'example.net', 'example.org'] as const;

/**
 * Pure, and exported so the decision table can be asserted without a
 * transport — the shape `emailSendAllowed` uses, for the same reason.
 *
 * Deliberately NOT an RFC 5322 parser. Every caller passes a bare address
 * (`sendEmail` hands Resend `to: [params.to]`), so this trims whitespace and a
 * trailing `>` for safety and otherwise reads the substring after the last
 * `@`. Anything it cannot find a domain in is undeliverable by definition and
 * is refused under its own reason, never silently passed.
 */
export function recipientIsDeliverable(address: string): RecipientDecision {
  const trimmed = address.trim().replace(/>$/, '').trim();
  const at = trimmed.lastIndexOf('@');
  // Each names what is ACTUALLY wrong — this string is what lands in
  // email_logs.metadata and is the only thing that will explain the row later.
  if (at === -1) {
    return { deliverable: false, reason: `no @ in recipient address "${address}"` };
  }
  if (at === 0) {
    return { deliverable: false, reason: `no local part in recipient address "${address}"` };
  }
  if (at === trimmed.length - 1) {
    return { deliverable: false, reason: `no domain in recipient address "${address}"` };
  }

  // A trailing dot is a fully-qualified name and is the same domain.
  const domain = trimmed.slice(at + 1).toLowerCase().replace(/\.$/, '');
  if (domain === '') {
    return { deliverable: false, reason: `no domain in recipient address "${address}"` };
  }

  const tld = domain.slice(domain.lastIndexOf('.') + 1);
  if ((RESERVED_TLDS as readonly string[]).includes(tld)) {
    return {
      deliverable: false,
      reason: `.${tld} is a reserved TLD (RFC 2606/6761) and can never resolve`,
    };
  }

  // Suffix match: `mail.example.com` is as reserved as `example.com`.
  for (const reserved of RESERVED_DOMAINS) {
    if (domain === reserved || domain.endsWith(`.${reserved}`)) {
      return {
        deliverable: false,
        reason: `${reserved} is a reserved domain (RFC 2606 §3) and can never resolve`,
      };
    }
  }

  return { deliverable: true };
}

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
  // S107 Part B — a bid request sent to a subcontractor: a SUMMARY plus the
  // tokenised link, never the detail and never money. The `email_types` row is
  // seeded in 20261580000000 — ⚠️ note that is an INSERT into a LOOKUP TABLE,
  // not a CHECK widening; the `email_logs_email_type_check` constraint the
  // older migrations rewrite no longer exists (replaced by
  // `email_logs_email_type_fkey`). Adding a member here without the row makes
  // the send succeed and its log INSERT fail, after the mail has gone.
  | 'sub_bid_request'
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
  | 'selection_specifications'
  // Deletion sweep §3 — the three retention warnings preceding permanent
  // deletion (copy: docs/specs/retention-warning-emails.md). The
  // `email_types.retention_warning` row lands in 20261053000000, same rule as
  // every member above: both halves or neither. One type for all three
  // emails; email_logs.metadata.kind tells them apart.
  | 'retention_warning'
  // Deliverability warming [Josh, 2026-09-10] — a low, steady, non-clockwork
  // send to four inboxes Josh owns, so Gmail has volume it can score. The
  // `email_types.warming` row lands in 20261590000000, in the SAME commit as
  // this line. FIFTH time this rule is written down and it has been broken once
  // (`mention`): the table half fails at RUNTIME, this half at COMPILE time, so
  // one without the other ships silently. Both halves or neither.
  //
  // ⚠️ IT IS ITS OWN TYPE BECAUSE NO EXISTING TYPE COULD BE MADE INERT. Every
  // other member of this union is defined by a record it points at, and warming
  // mail points at nothing. Logging it as `proposal` or `invite` would also
  // poison the one table the deliverability work has to read.
  | 'warming';

export interface LogEmailInput {
  /**
   * ⚠️ NULLABLE, AND NOT BECAUSE OF THIS FEATURE. `email_logs.company_id` has
   * been nullable since `20261054000000` (deletion sweep §3, 2026-08-30): the
   * FK is `ON DELETE SET NULL` so a tenant's mail record OUTLIVES the tenant.
   * That is a ruled, legally-reviewed behaviour.
   *
   * ⚠️ DO NOT ADD A CHECK REQUIRING A COMPANY FOR NON-AUTH TYPES. It was tried
   * on 2026-09-11 and reverted before merge: a constraint of that shape
   * contradicts `ON DELETE SET NULL` directly — deleting a company nulls every
   * one of its `email_logs` rows, the non-auth ones then violate it, and the
   * company DELETE aborts. Measured on rebuild-test: 1,389 rows, one company.
   * `s138-trial-deletion-run.live.ts` now covers exactly this.
   *
   * A public signup confirmation legitimately has no company: the tenant is
   * being created inside the same uncommitted transaction, so there is no id to
   * resolve rather than one that is hidden. Passing null says that.
   */
  company_id: string | null;
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
  /** Email §3 [Josh ruling] — set ONLY on the recurring class (reminder,
   *  co_reminder, invoice_reminder). Doing so (a) refuses the send if the
   *  recipient has opted out (the backstop behind the crons' own pre-checks —
   *  a future recurring sender that forgets its pre-check still cannot mail an
   *  unsubscribed address), and (b) attaches the RFC 8058 List-Unsubscribe +
   *  List-Unsubscribe-Post headers. NEVER set it on transactional mail, and
   *  never on retention_warning — both ruled. */
  unsubscribe?: { companyId: string; scope: UnsubscribeScope };
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
  // The send gate runs BEFORE getResend(): a refused send must refuse the same
  // way whether or not a key is present, and must never depend on one.
  const gate = emailSendAllowed();
  if (!gate.allowed) {
    const message = `send gate refused: ${gate.reason}`;
    console.error(
      `[email-service] ${message} — to=${params.to} subject="${params.subject}"`
    );
    return { messageId: null, error: message };
  }

  // The bounce guard, before consent and before the key. An address that can
  // never receive mail should not cost a database round-trip to refuse, and
  // "structurally undeliverable" is a stronger fact than "this person opted
  // out" — so when both apply, this is the reason the log should carry.
  const recipient = recipientIsDeliverable(params.to);
  if (!recipient.deliverable) {
    const message = `undeliverable recipient: ${recipient.reason}`;
    console.error(`[email-service] ${message} — to=${params.to} subject="${params.subject}"`);
    return { messageId: null, error: message };
  }

  // Consent, before the key: an unsubscribed recipient is refused identically
  // whether or not this environment could send at all.
  let unsubscribeHeaders: Record<string, string> | null = null;
  if (params.unsubscribe) {
    const claim = {
      companyId: params.unsubscribe.companyId,
      email: params.to,
      scope: params.unsubscribe.scope,
    };
    const suppressed = await isEmailUnsubscribed(
      getSupabaseAdmin() as SupabaseClient<Database>,
      claim.companyId,
      claim.email,
      claim.scope
    );
    if (suppressed) {
      const message = `recipient has unsubscribed (${claim.scope})`;
      console.error(`[email-service] ${message} — to=${params.to} subject="${params.subject}"`);
      return { messageId: null, error: message };
    }
    unsubscribeHeaders = buildUnsubscribeHeaders(claim);
  }

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
    // The RFC 8058 pair, only when the caller opted into the recurring class
    // AND the token/appUrl plumbing is configured (missing config degrades to
    // header-less mail, loudly — see email-unsubscribe.ts).
    ...(unsubscribeHeaders ? { headers: unsubscribeHeaders } : {}),
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
