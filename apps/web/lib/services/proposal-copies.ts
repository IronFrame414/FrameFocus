import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { logEmail, sendEmail } from '@/lib/services/email-service';
import { ProposalEmail } from '@/lib/email/templates/proposal-email';

// S120 PART 4 — "ALSO SEND TO" RECIPIENTS ARE ACTUALLY SENT TO.
//
// ⚠️ THE DEFECT THIS CLOSES. `estimates.also_send_to` (the details page's "Also
// send to" contacts, S103 §1.4) was stored, shown and frozen on send — and NO
// send route ever read it. Every recipient saved there was silently never
// emailed. Both proposal routes (send, resend) now call this, so the rule lives
// in ONE place.
//
// ⚠️ A COPY, NOT A SECOND SIGNER [S120 unattended decision — ASK-9]. Each extra
// recipient gets the same email and the same PDF, WITHOUT the signing link: the
// estimate keeps exactly one live signing link, held by its contact
// (invalidateSessionsForEstimate — "only one active signing link per estimate,
// ever"). So a recipient here — and above all the TYPED address, which is not
// a contact at all (4-B) — gains no read path into the app: no token, no
// portal, nothing but the email.

export type RecipientKind = 'signer' | 'contact' | 'typed';

export interface CopyRecipient {
  email: string;
  kind: Exclude<RecipientKind, 'signer'>;
}

// A `type`, not an interface: it keeps an implicit index signature so it stays
// assignable to the generated Json type (estimate_events.payload) — the same
// reason AlsoSendToRecipient is one.
export type RecipientResult = {
  email: string;
  kind: RecipientKind;
  status: 'sent' | 'failed';
  error?: string;
};

/**
 * Who gets a copy: every `also_send_to` contact (its SNAPSHOT email — the list
 * freezes on send, so the record says where it actually went) and the typed
 * address, deduplicated case-insensitively, never the signer twice.
 */
export function collectCopyRecipients(
  estimate: { also_send_to: unknown; also_send_to_email: string | null },
  signerEmail: string
): CopyRecipient[] {
  const seen = new Set([signerEmail.trim().toLowerCase()]);
  const out: CopyRecipient[] = [];
  const add = (raw: unknown, kind: CopyRecipient['kind']) => {
    if (typeof raw !== 'string') return;
    const email = raw.trim().toLowerCase();
    if (!email || seen.has(email)) return;
    seen.add(email);
    out.push({ email, kind });
  };
  if (Array.isArray(estimate.also_send_to)) {
    for (const r of estimate.also_send_to) add((r as { email?: unknown } | null)?.email, 'contact');
  }
  add(estimate.also_send_to_email, 'typed');
  return out;
}

/**
 * Send one copy to each recipient, logging every attempt. A failed copy never
 * fails the send (the signer's email has already gone); it is reported back so
 * the route can say so, and it is in `email_logs` with its error.
 */
export async function sendProposalCopies(
  admin: SupabaseClient<Database>,
  params: {
    companyId: string;
    estimateId: string;
    recipients: CopyRecipient[];
    sender: string;
    subject: string;
    /** Body text with {signing_link} ALREADY replaced by a copy-safe phrase. */
    bodyText: string;
    company: { name: string; logo_url: string | null; brand_color: string | null };
    pdf: { filename: string; content: Buffer };
    resend: boolean;
  }
): Promise<RecipientResult[]> {
  const results: RecipientResult[] = [];
  for (const r of params.recipients) {
    let messageId: string | null = null;
    let error: string | null = null;
    try {
      const sent = await sendEmail({
        from: params.sender,
        replyToCompanyId: params.companyId,
        to: r.email,
        subject: params.subject,
        react: ProposalEmail({
          companyName: params.company.name,
          logoUrl: params.company.logo_url,
          brandColor: params.company.brand_color || '#1a56db',
          bodyText: params.bodyText,
          signingUrl: null,
        }),
        attachments: [params.pdf],
      });
      messageId = sent.messageId;
      error = sent.error;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Email send failed';
    }
    await logEmail(admin, {
      company_id: params.companyId,
      estimate_id: params.estimateId,
      signing_session_id: null,
      resend_message_id: messageId,
      email_type: 'proposal',
      recipient_email: r.email,
      sender_email: params.sender,
      subject: params.subject,
      status: error ? 'failed' : 'sent',
      metadata: {
        copy: true,
        recipient_kind: r.kind,
        body: params.bodyText,
        ...(params.resend ? { resend: true } : {}),
        ...(error ? { error } : {}),
      },
    });
    if (error)
      console.error(
        `[proposal-copies] copy to ${r.kind} failed for estimate ${params.estimateId}: ${error}`
      );
    results.push({
      email: r.email,
      kind: r.kind,
      status: error ? 'failed' : 'sent',
      ...(error ? { error } : {}),
    });
  }
  return results;
}

/** What {signing_link} reads as in a copy: never the link itself. */
export function copySigningPhrase(signerName: string): string {
  return `the signing link, which was sent to ${signerName}`;
}
