import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { coSendSchema } from '@framefocus/shared/validation/co-signing';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  createCoSigningSession,
  invalidateSessionsForChangeOrder,
} from '@/lib/services/co-signing-service';
import {
  compositeSignedCoPDF,
  downloadImageBase64,
  generateChangeOrderPDF,
  storeSignedCoPDF,
} from '@/lib/services/co-pdf-service';
import {
  buildSenderAddress,
  DEFAULT_CO_BODY,
  DEFAULT_CO_SUBJECT,
  logEmail,
  replaceTemplateVariables,
  sendEmail,
} from '@/lib/services/email-service';
import { ChangeOrderEmail } from '@/lib/email/templates/change-order-email';

// Signed-artifact spec §§4.2, 6, 7 — "Send" a change order. Sending IS the
// internal contractor-side acceptance (D-4). The contractor signs at send from
// an authenticated session (§4.2); a contractor-signed / client-unsigned PDF
// (v1) is generated, attached, and emailed to the client with a tokenized
// signing link (§6/§7, reopening F-3). Owner/Admin/PM send (D-5). The route
// accepts draft OR sent and mints a fresh token, so it doubles as re-send —
// no separate resend route (spec §1). On re-send the existing contractor
// signature is reused and v1 is regenerated.

const DEFAULT_EXPIRES_IN_DAYS = 30;

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
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
  if (!profile || !['owner', 'admin', 'project_manager'].includes(profile.role)) {
    return NextResponse.json(
      { error: 'Only Owner, Admin, or Project Manager can send change orders' },
      { status: 403 }
    );
  }

  let parsed;
  try {
    parsed = coSendSchema.safeParse(await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }
  const input = parsed.data;

  // RLS-scoped fetch — cross-tenant ids 404 here. Selects the new contractor
  // signature columns (type errors vs. un-regenerated database.ts are expected).
  const { data: co } = await supabase
    .from('change_orders')
    .select(
      'id, status, co_number, title, company_id, project_id, contractor_signature_mode, contractor_signature_ref, contractor_signature_name, contractor_signed_at'
    )
    .eq('id', params.id)
    .eq('is_deleted', false)
    .maybeSingle();
  if (!co) return NextResponse.json({ error: 'Change order not found' }, { status: 404 });

  if (co.status !== 'draft' && co.status !== 'sent') {
    return NextResponse.json(
      { error: `Only Draft or Sent change orders can be sent (status: ${co.status})` },
      { status: 409 }
    );
  }

  const admin = getSupabaseAdmin() as SupabaseClient<Database>;

  const { data: company } = await admin
    .from('companies')
    .select('name, slug, logo_url, brand_color, contractor_signature_path')
    .eq('id', co.company_id)
    .single();
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 500 });

  // ── Contractor signature (spec §4.2) ─────────────────────────────────────
  // Required only when the CO carries no contractor signature yet (first send).
  // On re-send it is reused verbatim (Q D).
  const needsSignature = !co.contractor_signed_at;
  let sigMode = co.contractor_signature_mode as 'saved_image' | 'typed_name' | null;
  let sigRef = co.contractor_signature_ref as string | null;
  let sigName = co.contractor_signature_name as string | null;
  let sigSignedAt = co.contractor_signed_at as string | null;
  let sigSignedBy: string | null = null;

  if (needsSignature) {
    if (!input.contractor_signature_mode || !input.contractor_signature_name) {
      return NextResponse.json(
        { error: 'A contractor signature (mode + printed name) is required to send this change order.' },
        { status: 400 }
      );
    }
    sigMode = input.contractor_signature_mode;
    sigName = input.contractor_signature_name;
    sigRef = null;
    if (sigMode === 'saved_image') {
      if (!company.contractor_signature_path) {
        return NextResponse.json(
          {
            error:
              'No saved signature image on file. Add one in Company Settings, or send with a typed name.',
          },
          { status: 422 }
        );
      }
      sigRef = company.contractor_signature_path;
    }
    // Identity via the caller's company_member id (auth.uid() is reserved for
    // audit columns). The DB column has no DEFAULT — this is an UPDATE.
    const { data: member } = await supabase
      .from('company_members')
      .select('id')
      .eq('profile_id', profile.id)
      .eq('is_deleted', false)
      .maybeSingle();
    if (!member) {
      return NextResponse.json(
        { error: 'No company member record for the current user.' },
        { status: 422 }
      );
    }
    sigSignedAt = new Date().toISOString();
    sigSignedBy = member.id;
  }

  // ── Recipient resolution (Q C) — override wins; else the project's contact.
  let recipientEmail = input.recipient_email ?? null;
  let recipientName = input.recipient_name ?? null;
  if (!recipientEmail) {
    const { data: project } = await admin
      .from('projects')
      .select('contact_id')
      .eq('id', co.project_id)
      .maybeSingle();
    if (project?.contact_id) {
      const { data: contact } = await admin
        .from('contacts')
        .select('first_name, last_name, email')
        .eq('id', project.contact_id)
        .maybeSingle();
      if (contact?.email) {
        recipientEmail = contact.email;
        recipientName = recipientName ?? `${contact.first_name} ${contact.last_name}`.trim();
      }
    }
  }
  if (!recipientEmail) {
    return NextResponse.json(
      {
        error:
          'No recipient email. Set a primary contact on the project, or pass recipient_email.',
      },
      { status: 422 }
    );
  }

  const sentAt = new Date();
  const expiresAt = new Date(sentAt);
  expiresAt.setDate(expiresAt.getDate() + (input.expires_in_days ?? DEFAULT_EXPIRES_IN_DAYS));

  // Only one active signing link per CO, ever.
  await invalidateSessionsForChangeOrder(admin, co.id);

  const session = await createCoSigningSession(admin, {
    companyId: co.company_id,
    changeOrderId: co.id,
    recipientEmail,
    recipientName,
    expiresAt: expiresAt.toISOString(),
  });
  if (!session.token) {
    return NextResponse.json(
      { error: session.error ?? 'Could not create a signing session' },
      { status: 500 }
    );
  }

  // Apply status flip + contractor signature (RLS client — Owner/Admin/PM UPDATE
  // path). Sending IS acceptance (D-4), so this stands even if email fails.
  const updates: Record<string, unknown> = {};
  if (co.status === 'draft') {
    updates.status = 'sent';
    updates.sent_at = sentAt.toISOString();
  }
  if (needsSignature) {
    updates.contractor_signature_mode = sigMode;
    updates.contractor_signature_ref = sigRef;
    updates.contractor_signature_name = sigName;
    updates.contractor_signed_at = sigSignedAt;
    updates.contractor_signed_by = sigSignedBy;
  }
  if (Object.keys(updates).length > 0) {
    const { error: updateError } = await supabase
      .from('change_orders')
      .update(updates)
      .eq('id', co.id);
    if (updateError) {
      await invalidateSessionsForChangeOrder(admin, co.id);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  }

  // Generate v1 (contractor-signed, client-unsigned). Read via admin so it
  // reflects the update just applied.
  const generated = await generateChangeOrderPDF(admin, co.id);
  if (!generated) {
    await invalidateSessionsForChangeOrder(admin, co.id);
    return NextResponse.json({ error: 'Could not generate the change order PDF' }, { status: 500 });
  }

  const contractorImage =
    sigMode === 'saved_image' && sigRef
      ? await downloadImageBase64(admin, 'project-files', sigRef)
      : null;

  const v1 = await compositeSignedCoPDF(generated.buffer, {
    block: 'contractor',
    signatureImageBase64: contractorImage,
    signerName: sigName ?? company.name,
    signedAtIso: sigSignedAt ?? sentAt.toISOString(),
  });

  const stored = await storeSignedCoPDF(admin, {
    companyId: co.company_id,
    projectId: co.project_id,
    coNumber: co.co_number,
    variant: 'v1',
    signedPdfBuffer: v1,
  });
  if (stored.error) {
    return NextResponse.json({ error: stored.error }, { status: 500 });
  }

  // Email v1 + tokenized signing link to the client.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const signingUrl = `${appUrl}/sign-co/${session.token}`;
  const variables: Record<string, string> = {
    company_name: company.name,
    contact_name: recipientName ?? 'there',
    co_number: co.co_number,
    co_title: co.title,
    signing_link: signingUrl,
    expiration_date: fmtDate(expiresAt),
    sent_date: fmtDate(sentAt),
  };
  const subject = replaceTemplateVariables(input.subject ?? DEFAULT_CO_SUBJECT, variables);
  const bodyText = replaceTemplateVariables(input.body ?? DEFAULT_CO_BODY, variables);
  const sender = buildSenderAddress(company);

  const { messageId, error: sendError } = await sendEmail({
    from: sender,
    to: recipientEmail,
    subject,
    react: ChangeOrderEmail({
      companyName: company.name,
      logoUrl: company.logo_url,
      brandColor: company.brand_color || '#1a56db',
      bodyText,
      signingUrl,
    }),
    attachments: [{ filename: `${co.co_number}.pdf`, content: v1 }],
  });

  await logEmail(admin, {
    company_id: co.company_id,
    estimate_id: null,
    signing_session_id: null,
    change_order_id: co.id,
    co_signing_session_id: session.sessionId,
    resend_message_id: messageId,
    email_type: 'change_order',
    recipient_email: recipientEmail,
    sender_email: sender,
    subject,
    status: sendError ? 'failed' : 'sent',
    metadata: sendError ? { error: sendError, body: bodyText } : { body: bodyText },
  });

  // The CO is sent (D-4) and the tokenized link is live regardless: the
  // contractor can still share it manually / sign in person (F-3, §7.4). A
  // failed email is a warning, not a rollback.
  return NextResponse.json({
    success: true,
    signingUrl,
    ...(sendError ? { emailWarning: `Email delivery failed: ${sendError}` } : {}),
  });
}
