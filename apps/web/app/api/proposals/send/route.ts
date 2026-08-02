import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { sendProposalSchema } from '@framefocus/shared/validation/email';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  buildSenderAddress,
  logEmail,
  replaceTemplateVariables,
  sendEmail,
  type TemplateVariables,
} from '@/lib/services/email-service';
import { generateProposalPDF } from '@/lib/services/proposal-service';
import {
  createSigningSession,
  invalidateSessionsForEstimate,
} from '@/lib/services/signing-service';
import { ProposalEmail } from '@/lib/email/templates/proposal-email';

// Spec 2 (4E E5) — "Send Proposal": generate PDF → signing session →
// Resend email with attachment + signing link → estimate to `sent`.
// Owner/Admin only. Template variables in subject/body are replaced
// at send time.

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();
  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    return NextResponse.json(
      { error: 'Only Owner or Admin can send proposals' },
      { status: 403 }
    );
  }

  let parsed;
  try {
    parsed = sendProposalSchema.safeParse(await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }
  const input = parsed.data;

  // RLS-scoped fetch — cross-tenant ids 404 here.
  const { data: estimate } = await supabase
    .from('estimates')
    .select('id, status, name, estimate_number, company_id, contact_id, expiration_days')
    .eq('id', input.estimate_id)
    .eq('is_deleted', false)
    .maybeSingle();
  if (!estimate) return NextResponse.json({ error: 'Estimate not found' }, { status: 404 });

  if (estimate.status !== 'draft' && estimate.status !== 'review') {
    return NextResponse.json(
      { error: `Only Draft or Review estimates can be sent (status: ${estimate.status})` },
      { status: 409 }
    );
  }

  const { data: contact } = await supabase
    .from('contacts')
    .select('first_name, last_name, email')
    .eq('id', estimate.contact_id)
    .single();
  if (!contact?.email) {
    return NextResponse.json(
      { error: 'This contact has no email address. Add one on the Contacts page first.' },
      { status: 422 }
    );
  }

  const admin = getSupabaseAdmin() as SupabaseClient<Database>;

  const { data: company } = await admin
    .from('companies')
    .select('name, slug, logo_url, brand_color')
    .eq('id', estimate.company_id)
    .single();
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 500 });

  const sentAt = new Date();
  const expiresAt = new Date(sentAt);
  expiresAt.setDate(expiresAt.getDate() + estimate.expiration_days);

  // Defensive: only one active signing link per estimate, ever.
  await invalidateSessionsForEstimate(admin, estimate.id);

  const contactName = `${contact.first_name} ${contact.last_name}`.trim();
  const session = await createSigningSession(admin, {
    companyId: estimate.company_id,
    estimateId: estimate.id,
    recipientEmail: contact.email,
    recipientName: contactName,
    expiresAt: expiresAt.toISOString(),
  });
  if (!session.token) {
    return NextResponse.json(
      { error: session.error ?? 'Could not create a signing session' },
      { status: 500 }
    );
  }

  const generated = await generateProposalPDF(admin, estimate.id);
  if (!generated) {
    return NextResponse.json({ error: 'Could not generate the proposal PDF' }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const signingUrl = `${appUrl}/sign/${session.token}`;
  const variables: TemplateVariables = {
    company_name: company.name,
    contact_name: contactName,
    estimate_number: estimate.estimate_number,
    estimate_name: estimate.name,
    signing_link: signingUrl,
    expiration_date: expiresAt.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
    sent_date: sentAt.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
  };

  const subject = replaceTemplateVariables(input.subject, variables);
  const bodyText = replaceTemplateVariables(input.body, variables);
  const sender = buildSenderAddress(company);

  const { messageId, error: sendError } = await sendEmail({
    from: sender,
    // +REPLY-TO [S97]: a client's reply reaches the COMPANY, not the
    // platform domain. Resolved in sendEmail so senders inherit it.
    replyToCompanyId: estimate.company_id,
    to: contact.email,
    subject,
    react: ProposalEmail({
      companyName: company.name,
      logoUrl: company.logo_url,
      brandColor: company.brand_color || '#1a56db',
      bodyText,
      signingUrl,
    }),
    attachments: [
      {
        filename: `${estimate.estimate_number}-proposal.pdf`,
        content: generated.buffer,
      },
    ],
  });

  await logEmail(admin, {
    company_id: estimate.company_id,
    estimate_id: estimate.id,
    signing_session_id: session.sessionId,
    resend_message_id: messageId,
    email_type: 'proposal',
    recipient_email: contact.email,
    sender_email: sender,
    subject,
    status: sendError ? 'failed' : 'sent',
    metadata: sendError ? { error: sendError, body: bodyText } : { body: bodyText },
  });

  if (sendError) {
    // The email never went out — kill the orphaned signing link.
    await invalidateSessionsForEstimate(admin, estimate.id);
    return NextResponse.json({ error: `Email send failed: ${sendError}` }, { status: 502 });
  }

  // Freeze the estimate. RLS-scoped client — Owner/Admin UPDATE path.
  const updates: Record<string, unknown> = {
    status: 'sent',
    sent_at: sentAt.toISOString(),
    expires_at: expiresAt.toISOString(),
  };
  if (estimate.status === 'review') {
    updates.reviewed_by = profile.id;
    updates.reviewed_at = sentAt.toISOString();
  }
  const { error: updateError } = await supabase
    .from('estimates')
    .update(updates)
    .eq('id', estimate.id);
  if (updateError) {
    return NextResponse.json(
      {
        error: `The email was sent but the estimate status update failed: ${updateError.message}. Use "Mark as Sent" to freeze it.`,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
