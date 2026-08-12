import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import type { CompanyRole } from '@framefocus/shared';
import { buildSenderAddress, logEmail, sendEmail } from '@/lib/services/email-service';
import { NotificationEmail } from '@/lib/email/templates/notification-email';
import { mentionTitle } from '@/lib/chat/mention-notify';
import type { ThreadKind } from '@/lib/chat/threads';

/**
 * ND-30 / ND-42 — the mention email. SUBCONTRACTORS ONLY.
 *
 * Spec: chat-spec.md §5.6a, §5.6a-i, A-C46…A-C50. Slice 4.
 *
 * ===========================================================================
 * THIS IS AN EXPLICIT EXCEPTION TO PARENT R3, AND THE EXCEPTION IS THE FEATURE
 * ===========================================================================
 * A mentioned **subcontractor with a profile** gets in-app, push AND email.
 * **Everyone else — crew, foreman, PM, Admin, Owner — gets in-app and push and
 * NO EMAIL.**
 *
 * ND-15 scoped subs to three events precisely because **a sub may not have the
 * app**. That reasoning applies to subs and to nobody else, since staff are in
 * it: emailing a foreman every time somebody tags him is volume without value,
 * and volume without value is how people learn to filter the channel that was
 * supposed to reach them.
 *
 * ⚠️ Emailing everyone is what R3 READS LIKE, which is why A-C47 exists and
 * asserts that a mentioned crew member receives **no** email. Without that one
 * criterion, a build that emails every recipient passes every other criterion
 * in this block.
 *
 * ---------------------------------------------------------------------------
 * CALLED FROM THE CHAT SEND PATH, ALONGSIDE notify() — NEVER INSIDE IT
 * ---------------------------------------------------------------------------
 * `notify()` sends no email, and four existing consumers (incident-notify,
 * co-signing, delivery check-in, invoice delivery) each drive their own. Moving
 * this inside `notify()` would double-send for every one of them. The seam this
 * fills is recorded at the bottom of `mention-notify.ts`.
 */

/** The audience, after ND-42's filter has been applied. */
export interface MentionEmailRecipient {
  profileId: string;
  role: CompanyRole;
  /** `profiles.email` — NOT NULL. See the note in `mentionEmailAudience`. */
  email: string | null;
}

export interface MentionEmailParams {
  admin: SupabaseClient<Database>;
  companyId: string;
  projectId: string;
  projectName: string;
  kind: ThreadKind;
  messageId: string;
  authorName: string;
  body: string;
  recipients: MentionEmailRecipient[];
  /** Absolute origin for the link. */
  origin: string;
}

/**
 * ND-42's filter, as a named pure function so it can be tested without a
 * mailbox — and so the rule is one expression rather than a condition buried in
 * a loop.
 *
 * ⚠️ `subcontractors.email` IS THE WRONG COLUMN and is deliberately not used
 * here. It is nullable, and it is null on one of the four live rows; a build
 * that reached for it would silently send nothing for that sub while appearing
 * to work for the others. The address is `profiles.email`, which is NOT NULL —
 * and §5.6a-vi's "sub without a profile" case never reaches this function at
 * all, because a mention can only resolve to a profile (ND-2) and the picker
 * never offers one that does not exist (A-C49).
 */
export function mentionEmailAudience(
  recipients: MentionEmailRecipient[]
): MentionEmailRecipient[] {
  return recipients.filter((r) => r.role === 'subcontractor' && Boolean(r.email));
}

/**
 * §5.6a-v / A-C50 — where the email's button goes.
 *
 * A named function rather than a template literal inline, because **A-C50 is a
 * `[unit]` criterion** and the alternative is unassertable: the template is
 * invoked as `NotificationEmail({...})` (the house pattern — see
 * incident-notify.ts), which returns the component's RENDERED OUTPUT, not an
 * element carrying `estimateUrl` as a prop. A test reaching for
 * `react.props.estimateUrl` gets `undefined`, which is how the first version of
 * `s126-chat-email.live.ts` failed.
 *
 * ⚠️ MOBILE, NOT DASHBOARD. `DASHBOARD_ROLES` excludes subcontractor, so a
 * `/dashboard` link is the wrong surface for the one audience this email has.
 * ND-40: a PARAM on the project screen, never a `/m/p/{id}/chat` route.
 */
export function mentionEmailUrl(origin: string, projectId: string): string {
  return `${origin}/m/p/${projectId}?chat=1`;
}

export async function sendMentionEmails(
  params: MentionEmailParams
): Promise<{ sent: number; skipped: number; errors: string[] }> {
  const audience = mentionEmailAudience(params.recipients);
  const skipped = params.recipients.length - audience.length;
  if (audience.length === 0) return { sent: 0, skipped, errors: [] };

  const { data: company } = await params.admin
    .from('companies')
    .select('name, slug, brand_color')
    .eq('id', params.companyId)
    .single();

  if (!company) return { sent: 0, skipped, errors: ['company not found'] };

  const sender = buildSenderAddress(company);

  // R6 + ND-23, and A-C48 is the criterion that holds it: the subject carries
  // the REAL MESSAGE TEXT and the thread name. A "you were mentioned" email
  // passes a naive "an email was sent" assertion and defeats the entire point
  // — the recipient would have to open the app to learn what was wanted, which
  // is the situation chat exists to end.
  //
  // Built by `mentionTitle()`, the SAME function the in-app row and the push
  // use, so the three channels cannot drift into describing one event three
  // ways. That is where `— subs` comes from on a sub thread.
  const subject = mentionTitle(params.authorName, params.projectName, params.kind, params.body);

  const url = mentionEmailUrl(params.origin, params.projectId);

  let sent = 0;
  const errors: string[] = [];

  for (const recipient of audience) {
    let messageId: string | null = null;
    let sendError: string | null = null;

    try {
      const result = await sendEmail({
        from: sender,
        to: recipient.email!,
        subject,
        react: NotificationEmail({
          brandColor: company.brand_color || '#1a56db',
          heading: `${params.authorName} mentioned you`,
          // The body again, in full, under a heading that says who. The subject
          // truncates at 140 (ND-31); this does not.
          message: params.body,
          estimateUrl: url,
          ctaLabel: 'Open chat',
        }),
      });
      messageId = result.messageId;
      sendError = result.error;
    } catch (err) {
      sendError = err instanceof Error ? err.message : 'Email send failed';
    }

    if (sendError) errors.push(`${recipient.email}: ${sendError}`);
    else sent += 1;

    // A-C46 — logged whether or not it sent. A failed send still costs and
    // still needs a trail; the `email_types.mention` row landed with slice 1
    // precisely so this FK resolves.
    await logEmail(params.admin, {
      company_id: params.companyId,
      estimate_id: null,
      signing_session_id: null,
      resend_message_id: messageId,
      email_type: 'mention',
      recipient_email: recipient.email!,
      sender_email: sender,
      subject,
      status: sendError ? 'failed' : 'sent',
      metadata: {
        message_id: params.messageId,
        project_id: params.projectId,
        thread_kind: params.kind,
        ...(sendError ? { error: sendError } : {}),
      },
    });
  }

  return { sent, skipped, errors };
}
