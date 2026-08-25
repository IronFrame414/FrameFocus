import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { buildSenderAddress, logEmail, sendEmail } from '@/lib/services/email-service';
import { SelectionReleasedEmail } from '@/lib/email/templates/selection-released-email';

/**
 * S174 #1 — RELEASING SELECTIONS SENDS AN EMAIL, which it never did.
 *
 * ===========================================================================
 * ⚠️ THE DEFECT
 * ===========================================================================
 * Josh, click-testing S173: *"I received the estimate via email when I tested
 * it. I have not received the selections."* `grep -rn 'sendEmail'` over
 * `app/api/selections/` and `selection-lifecycle-service.ts` returned NOTHING.
 * The release flipped the rows, opened the signing sessions, notified the
 * company's own managers — and told the one person the whole feature is for
 * nothing at all.
 *
 * This is the same class as S173's Job 1, one module over: the MECHANISM was
 * complete and nothing connected it to the client. A suite that exercises the
 * lifecycle cannot see it, because the lifecycle is not what is broken.
 *
 * ===========================================================================
 * ⚠️ ONE MECHANISM, TWO CALLERS — AND DELIBERATELY NOT A SECOND MAILER
 * ===========================================================================
 * `POST /api/selections/release` (the batch) and `POST /api/selections/[id]/offer`
 * (the single) both call THIS. Josh: *"Do NOT build a second mailer."* It rides
 * `sendEmail()` from `email-service.ts` — the `getResend()` wrap, the +REPLY-TO
 * resolution, the `email_logs` row — exactly as the estimate does. A second
 * "does the same thing" send path is the divergence CLAUDE.md's PARITY rule
 * describes: written in a form that looks like agreement and discovered later
 * as two emails that disagree about what the link is.
 *
 * ===========================================================================
 * ⚠️ ONE EMAIL PER RELEASE, NOT ONE PER SELECTION
 * ===========================================================================
 * Josh's S173 ruling: **the batch is a DELIVERY mechanism, not a signing unit.**
 * The signature stays one-per-selection; the DELIVERY is the batch. So a
 * release of four selections is ONE message listing four, not four messages —
 * which is also why `email_logs` gets no `selection_id` column and the ids ride
 * in `metadata` (see the migration's header).
 *
 * ===========================================================================
 * ⚠️ A FAILED SEND IS NOT A FAILED RELEASE
 * ===========================================================================
 * The rows are already `awaiting_approval` and the signing sessions are already
 * open when this runs. It therefore NEVER throws: it reports
 * `{ emailed, error, recipient }` and the caller surfaces a WARNING. Rolling a
 * release back because Resend was down would be worse than the defect being
 * fixed. The same doctrine the CO send route states in its own words: *"A
 * failed email is a warning, not a rollback."*
 *
 * ⚠️ AND IT MUST NOT SILENTLY SUCCEED EITHER. `emailed: false` reaches the
 * screen. The defect this file fixes is a UI that implied delivery; replacing
 * it with one that hides a failure is the same defect wearing a different coat
 * (`invite-email.ts`, D2).
 */

type Db = SupabaseClient<Database>;

export interface SelectionEmailResult {
  emailed: boolean;
  error: string | null;
  recipient: string | null;
}

/**
 * The subject line.
 *
 * ⚠️ EXTRACTED SO IT CAN BE ASSERTED WITHOUT A DATABASE — the S136 lesson,
 * verbatim: the invite TEMPLATE was always correct and the stale product name
 * was in the SUBJECT, which no template test can see. Every new subject is
 * built this way for that reason.
 */
export function buildSelectionsReleasedSubject(companyName: string, count: number): string {
  return count === 1
    ? `${companyName}: a selection is ready for you to choose`
    : `${companyName}: ${count} selections are ready for you to choose`;
}

/** `/portal/<projectId>/selections` — the ONLY destination. See the template. */
export function buildSelectionsPortalLink(projectId: string, origin: string): string {
  return `${origin.replace(/\/+$/, '')}/portal/${projectId}/selections`;
}

function fmtDate(value: string): string {
  // `due_date` is a DATE, so it arrives as 'YYYY-MM-DD'. Parsing that with
  // `new Date()` reads it as UTC midnight and renders the PREVIOUS day west of
  // Greenwich — the classic off-by-one that makes a due date look already
  // missed. Split it and build a LOCAL date instead.
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Mail the client that `selectionIds` have been released on her project.
 *
 * The selections are read through the CALLER'S client, not the service role:
 * `selections_select_*` is the gate, so a caller who may not see a selection
 * cannot mail it either. The recipient, the company and the project name are
 * read with the admin client, exactly as the CO send route resolves them —
 * a PM may release a selection without being able to read `contacts` at all
 * (Roster Visibility Floor), and that must not turn into a silent no-send.
 */
export async function sendSelectionsReleasedEmail(
  rls: Db,
  input: { projectId: string; selectionIds: string[]; origin: string }
): Promise<SelectionEmailResult> {
  if (!input.selectionIds.length) {
    return { emailed: false, error: 'No selections to send.', recipient: null };
  }

  const { data: sels } = await rls
    .from('selections')
    .select('id, name, due_date, company_id, project_id')
    .in('id', input.selectionIds)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true });

  const selections = sels ?? [];
  if (!selections.length) {
    return { emailed: false, error: 'Those selections could not be read.', recipient: null };
  }

  const companyId = selections[0].company_id;
  const admin = getSupabaseAdmin() as Db;

  const { data: company } = await admin
    .from('companies')
    .select('name, slug, logo_url, brand_color')
    .eq('id', companyId)
    .maybeSingle();
  if (!company) {
    return { emailed: false, error: 'Company not found.', recipient: null };
  }

  const { data: project } = await admin
    .from('projects')
    .select('name, contact_id')
    .eq('id', input.projectId)
    .maybeSingle();
  if (!project) {
    return { emailed: false, error: 'Project not found.', recipient: null };
  }

  // The recipient is the project's primary contact. Same resolution the CO send
  // route uses, and the same failure sentence discipline: it names the remedy.
  let recipientEmail: string | null = null;
  let recipientName: string | null = null;
  if (project.contact_id) {
    const { data: contact } = await admin
      .from('contacts')
      .select('first_name, last_name, email')
      .eq('id', project.contact_id)
      .maybeSingle();
    if (contact?.email && contact.email.trim() !== '') {
      recipientEmail = contact.email.trim();
      recipientName = `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim() || null;
    }
  }
  if (!recipientEmail) {
    return {
      emailed: false,
      recipient: null,
      error:
        'The selections were released, but no email went out: this project has no client contact with an email address. Set a primary contact on the project.',
    };
  }

  // The soonest due date across the released set — one line, not one per row.
  // A batch with no due dates says nothing rather than saying "no due date".
  const due = selections
    .map((s) => s.due_date)
    .filter((d): d is string => typeof d === 'string' && d.length > 0)
    .sort()[0];
  const dueDateLine = due
    ? selections.length === 1
      ? `Please choose by ${fmtDate(due)}.`
      : `The soonest of these is due by ${fmtDate(due)}.`
    : null;

  const portalUrl = buildSelectionsPortalLink(input.projectId, input.origin);
  const subject = buildSelectionsReleasedSubject(company.name, selections.length);
  const from = buildSenderAddress({ name: company.name, slug: company.slug });

  let messageId: string | null = null;
  let error: string | null = null;
  try {
    // sendEmail() REPORTS rather than throws ({ messageId, error }); the catch
    // is for what it cannot report — a missing RESEND_API_KEY throws out of
    // getResend() before any request is made.
    const result = await sendEmail({
      from,
      to: recipientEmail,
      subject,
      // +REPLY-TO [S97]: a client's reply about her selections reaches the
      // COMPANY, not the platform domain.
      replyToCompanyId: companyId,
      react: SelectionReleasedEmail({
        companyName: company.name,
        logoUrl: company.logo_url,
        brandColor: company.brand_color || '#1a56db',
        contactName: recipientName ?? 'there',
        projectName: project.name,
        selectionNames: selections.map((s) => s.name),
        dueDateLine,
        portalUrl,
      }),
    });
    messageId = result.messageId;
    error = result.error;
  } catch (err: unknown) {
    error = err instanceof Error ? err.message : 'Failed to send the selections email';
  }

  // Logged on success AND failure — "no email arrived" is exactly the question
  // this table answers, and it is the question that started this fix.
  await logEmail(admin, {
    company_id: companyId,
    estimate_id: null,
    signing_session_id: null,
    resend_message_id: messageId,
    email_type: 'selection_released',
    recipient_email: recipientEmail,
    sender_email: from,
    subject,
    status: error ? 'failed' : 'sent',
    metadata: {
      project_id: input.projectId,
      selection_ids: selections.map((s) => s.id),
      selection_count: selections.length,
      ...(error ? { error } : {}),
    },
  });

  return { emailed: error === null, error, recipient: recipientEmail };
}
