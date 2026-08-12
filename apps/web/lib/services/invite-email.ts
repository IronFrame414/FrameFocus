import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { ROLE_LABELS, type CompanyRole } from '@framefocus/shared';
import { brand } from '@/lib/brand';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { buildSenderAddress, logEmail, sendEmail } from '@/lib/services/email-service';
import { InviteEmail } from '@/lib/email/templates/invite-email';

/**
 * D2 [S135] — sending an invitation, which this product has never done.
 *
 * `createInvitation()` inserted a row and `invite-form.tsx` rendered a copyable
 * link under the words "Share this link with {email}". There was no send call
 * anywhere, no invite function in `email-service.ts`, and no `invite` row in
 * `email_types`. Josh invited two employees, neither received anything, and the
 * screen gave him no reason to think anything was wrong.
 *
 * ⚠️ ONE MECHANISM, TWO CALLERS. Both `POST /api/invites` (create) and
 * `POST /api/invites/[id]/resend` call THIS. A second "does the same thing"
 * send path is the divergence CLAUDE.md's PARITY rule describes — written in a
 * form that looks like agreement, and discovered later as two emails that
 * disagree about what the link is.
 *
 * ⚠️ A FAILED SEND IS NOT A FAILED INVITATION. The row is already committed and
 * the link is already valid when this runs. It therefore NEVER throws: it
 * reports `{ emailed, error }` and the caller shows the link either way. The
 * defect being fixed is a UI that implied delivery — replacing it with one that
 * hides a failure would be the same defect wearing a different coat.
 */
export interface InviteEmailResult {
  emailed: boolean;
  error: string | null;
  link: string;
}

export function buildInviteLink(token: string, origin: string): string {
  return `${origin.replace(/\/+$/, '')}/invite/accept?token=${token}`;
}

/**
 * The invite email's subject line.
 *
 * ⚠️ EXTRACTED SO IT CAN BE ASSERTED [S136]. It was previously built inline, and
 * that is precisely why the stale product name reached real recipients: the
 * TEMPLATE was always correct, and `brand-email-footer.test.tsx` renders
 * templates. A subject is not in a template, so no brand test could see it, and
 * adding InviteEmail to that test would still not have caught this.
 *
 * A pure function of the company name needs no database, so the assertion is a
 * unit test rather than a live harness. Any future subject that names the
 * product should be built the same way, for the same reason.
 */
export function buildInviteSubject(companyName: string): string {
  return `${companyName} invited you to join them on ${brand.name}`;
}

export async function sendInviteEmail(
  supabase: SupabaseClient<Database>,
  invitationId: string,
  origin: string
): Promise<InviteEmailResult> {
  // Read through the CALLER's client: `invitations_select_owner_admin` is the
  // gate, so a caller who may not see this invitation cannot mail it either.
  const { data: inv, error: invErr } = await supabase
    .from('invitations')
    .select('id, email, role, token, expires_at, company_id, invited_by')
    .eq('id', invitationId)
    .single();

  if (invErr || !inv) {
    return { emailed: false, error: invErr?.message ?? 'Invitation not found', link: '' };
  }

  const invitation = inv as {
    id: string;
    email: string;
    role: string;
    token: string;
    expires_at: string | null;
    company_id: string;
    invited_by: string | null;
  };
  const link = buildInviteLink(invitation.token, origin);

  const admin = getSupabaseAdmin() as SupabaseClient<Database>;

  const { data: company } = await admin
    .from('companies')
    .select('name, slug, brand_color')
    .eq('id', invitation.company_id)
    .single();

  if (!company) {
    return { emailed: false, error: 'Company not found', link };
  }
  const co = company as { name: string; slug: string; brand_color: string | null };

  // The inviter's name is a nicety, not a requirement — a missing profile must
  // soften the sentence, never fail the send.
  let inviterName: string | null = null;
  if (invitation.invited_by) {
    const { data: inviter } = await admin
      .from('profiles')
      .select('first_name, last_name')
      .eq('user_id', invitation.invited_by)
      .maybeSingle();
    if (inviter) {
      const p = inviter as { first_name: string | null; last_name: string | null };
      const full = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
      inviterName = full.length > 0 ? full : null;
    }
  }

  const roleLabel = ROLE_LABELS[invitation.role as CompanyRole] ?? invitation.role;
  const expiresOn = invitation.expires_at
    ? new Date(invitation.expires_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'the date shown on the invitation';

  const from = buildSenderAddress({ name: co.name, slug: co.slug });
  const subject = buildInviteSubject(co.name);

  let messageId: string | null = null;
  let error: string | null = null;
  try {
    // sendEmail() REPORTS rather than throws ({ messageId, error }); the catch
    // is for what it cannot report — a missing RESEND_API_KEY throws out of
    // getResend() before any request is made.
    const result = await sendEmail({
      from,
      to: invitation.email,
      subject,
      // Reply-To the inviting company: an invitee's questions ("who is this,
      // what is this?") must reach the people who invited them, not the
      // platform domain.
      replyToCompanyId: invitation.company_id,
      react: InviteEmail({
        brandColor: co.brand_color || '#1a56db',
        companyName: co.name,
        roleLabel,
        inviterName,
        acceptUrl: link,
        expiresOn,
      }),
    });
    messageId = result.messageId;
    error = result.error;
  } catch (err: unknown) {
    error = err instanceof Error ? err.message : 'Failed to send invitation email';
  }

  // Logged on success AND failure — a failed send matters most to the audit
  // trail, and "no email arrived" is exactly the question this table answers.
  await logEmail(admin, {
    company_id: invitation.company_id,
    estimate_id: null,
    signing_session_id: null,
    resend_message_id: messageId,
    email_type: 'invite',
    recipient_email: invitation.email,
    sender_email: from,
    subject,
    status: error ? 'failed' : 'sent',
    metadata: { invitation_id: invitation.id, role: invitation.role },
  });

  return { emailed: error === null, error, link };
}
