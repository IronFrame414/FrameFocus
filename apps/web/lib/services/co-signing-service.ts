import 'server-only';
import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { CONSENT_TEXT } from '@/lib/proposal/proposal-defaults';
import {
  buildSenderAddress,
  getManagerRecipients,
  logEmail,
  sendEmail,
} from '@/lib/services/email-service';
import { generateChangeOrderPDF, storeSignedCoPDF } from '@/lib/services/co-pdf-service';
import { ChangeOrderEmail } from '@/lib/email/templates/change-order-email';

// 5D §6 — CO signing-session lifecycle, mirroring the M4 pattern
// (signing-service.ts): all functions take the service-role client
// because the public signing flow has no auth.uid(), and RLS on
// co_signing_sessions intentionally has no write policies (the token
// IS the credential).
//
// Signed-artifact spec (Session 64) reopens two 5D flags that this file's
// original comment recorded as unresolved:
//   * F-3 (client email delivery) — the send route now emails the CO.
//   * F-2 (signed-PDF compositing) — completeCoSignature now composites and
//     stores the fully-signed v2 artifact and emails both parties (§6/§7).
// The co_signing_sessions row remains the binding record; the PDF is the
// frozen, human-readable artifact of it.

export { CONSENT_TEXT };

type CoSigningSessionRow = Database['public']['Tables']['co_signing_sessions']['Row'];

export interface CreateCoSessionParams {
  companyId: string;
  changeOrderId: string;
  recipientEmail: string | null;
  recipientName: string | null;
  expiresAt: string;
}

/** New pending session. Token is the access credential (crypto-random UUID). */
export async function createCoSigningSession(
  admin: SupabaseClient<Database>,
  params: CreateCoSessionParams
): Promise<{ token: string | null; sessionId: string | null; error: string | null }> {
  const token = randomUUID();

  const { data, error } = await admin
    .from('co_signing_sessions')
    .insert({
      company_id: params.companyId,
      change_order_id: params.changeOrderId,
      token,
      recipient_email: params.recipientEmail,
      recipient_name: params.recipientName,
      expires_at: params.expiresAt,
    })
    .select('id')
    .single();

  if (error) return { token: null, sessionId: null, error: error.message };
  return { token, sessionId: data.id, error: null };
}

/**
 * Returns the session only while it is actionable: pending and not past
 * expiry. Anything else returns null — the page renders the error card.
 */
export async function getActiveCoSessionByToken(
  admin: SupabaseClient<Database>,
  token: string
): Promise<CoSigningSessionRow | null> {
  const { data } = await admin
    .from('co_signing_sessions')
    .select('*')
    .eq('token', token)
    .maybeSingle();

  if (!data) return null;
  if (data.status !== 'pending') return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return data;
}

/** Old links stop working when a CO is re-sent or voided. */
export async function invalidateSessionsForChangeOrder(
  admin: SupabaseClient<Database>,
  changeOrderId: string
): Promise<void> {
  await admin
    .from('co_signing_sessions')
    .update({ status: 'invalidated' })
    .eq('change_order_id', changeOrderId)
    .eq('status', 'pending');
}

export interface CompleteCoSignatureParams {
  signatureType: 'draw' | 'type';
  signatureData: string; // base64 PNG (data URL ok)
  signerName: string;
  signerIp: string | null;
  signerUserAgent: string | null;
}

/**
 * D-4 — the client signature is what makes the CO binding: records the
 * signature with full ESIGN audit data and moves the CO to `signed`.
 * projects.contract_value is NOT touched (D-6; #80 closed by derivation —
 * the revised total is derived by lib/services/contract-value.ts, 7B).
 */
export async function completeCoSignature(
  admin: SupabaseClient<Database>,
  token: string,
  params: CompleteCoSignatureParams
): Promise<{ success: boolean; error?: string }> {
  const session = await getActiveCoSessionByToken(admin, token);
  if (!session) return { success: false, error: 'This link has expired or is no longer valid.' };

  const { data: co } = await admin
    .from('change_orders')
    .select(
      'id, status, co_number, project_id, company_id, contractor_signature_mode, contractor_signature_ref, contractor_signature_name, contractor_signed_at'
    )
    .eq('id', session.change_order_id)
    .single();
  if (!co || co.status !== 'sent') {
    return { success: false, error: 'This change order is no longer awaiting signature.' };
  }

  const signedAt = new Date().toISOString();

  // Render + store the fully-signed v2 first (spec §6 — PDF before the row
  // flip, mirroring completeSignature). v2 = the CO rendered with the contractor
  // block (reconstructed from the CO row) PLUS the client block, passed in via
  // signatureOverride because it is NOT yet persisted at this point. Rendering
  // before the write keeps a failed render retryable (session stays pending).
  const generated = await generateChangeOrderPDF(admin, co.id, {
    clientSignature: {
      name: params.signerName,
      imageDataUri: params.signatureData,
      signedAt,
      ip: params.signerIp,
    },
  });
  if (!generated) {
    return { success: false, error: 'Could not generate the change order document.' };
  }
  const v2 = generated.buffer;
  const stored = await storeSignedCoPDF(admin, {
    companyId: co.company_id,
    projectId: co.project_id,
    coNumber: co.co_number,
    variant: 'v2',
    signedPdfBuffer: v2,
  });
  if (stored.error || !stored.fileId) {
    return { success: false, error: stored.error ?? 'Could not store the signed change order.' };
  }

  const { error: sessionError } = await admin
    .from('co_signing_sessions')
    .update({
      status: 'completed',
      signed_at: signedAt,
      signature_type: params.signatureType,
      signature_data: params.signatureData,
      signer_name: params.signerName,
      signer_ip: params.signerIp,
      signer_user_agent: params.signerUserAgent,
      consent_given: true,
      consent_text: CONSENT_TEXT,
    })
    .eq('id', session.id)
    .eq('status', 'pending');
  if (sessionError) return { success: false, error: sessionError.message };

  const { error: coError } = await admin
    .from('change_orders')
    .update({ status: 'signed', signed_at: signedAt })
    .eq('id', co.id)
    .eq('status', 'sent');
  if (coError) return { success: false, error: coError.message };

  // Email v2 to both parties (spec §7.2). Best-effort — a failed notification
  // must not roll back the binding signature (mirrors notifyManagers).
  await notifyCoSigned(admin, {
    companyId: co.company_id,
    changeOrderId: co.id,
    coNumber: co.co_number,
    sessionId: session.id,
    clientEmail: session.recipient_email,
    clientName: session.recipient_name,
    signedPdf: v2,
  });

  return { success: true };
}

/**
 * Emails the fully-signed v2 to the client and the contractor side
 * (Owner/Admin), one email per unique recipient, logging each
 * (email_type 'co_signature_complete'). Spec §7.2.
 */
async function notifyCoSigned(
  admin: SupabaseClient<Database>,
  params: {
    companyId: string;
    changeOrderId: string;
    coNumber: string;
    sessionId: string;
    clientEmail: string | null;
    clientName: string | null;
    signedPdf: Buffer;
  }
): Promise<void> {
  const { data: company } = await admin
    .from('companies')
    .select('name, slug, logo_url, brand_color')
    .eq('id', params.companyId)
    .single();
  if (!company) return;

  const sender = buildSenderAddress(company);
  const managers = await getManagerRecipients(admin, params.companyId);

  const recipients: Array<{ email: string; name: string }> = [];
  if (params.clientEmail) {
    recipients.push({ email: params.clientEmail, name: params.clientName ?? 'there' });
  }
  for (const m of managers) recipients.push({ email: m.email, name: m.first_name });

  const subject = `Change order ${params.coNumber} signed`;
  const seen = new Set<string>();
  for (const r of recipients) {
    if (seen.has(r.email)) continue;
    seen.add(r.email);

    const bodyText = `Hi ${r.name},\n\nChange order ${params.coNumber} has been signed by all parties. The fully signed copy is attached for your records.\n\n— ${company.name}`;

    const { messageId, error } = await sendEmail({
      from: sender,
      to: r.email,
      subject,
      react: ChangeOrderEmail({
        companyName: company.name,
        logoUrl: company.logo_url,
        brandColor: company.brand_color || '#1a56db',
        bodyText,
        signingUrl: null,
      }),
      attachments: [{ filename: `${params.coNumber}-signed.pdf`, content: params.signedPdf }],
    });

    await logEmail(admin, {
      company_id: params.companyId,
      estimate_id: null,
      signing_session_id: null,
      change_order_id: params.changeOrderId,
      co_signing_session_id: params.sessionId,
      resend_message_id: messageId,
      email_type: 'co_signature_complete',
      recipient_email: r.email,
      sender_email: sender,
      subject,
      status: error ? 'failed' : 'sent',
      metadata: error ? { error } : undefined,
    });
  }
}

/**
 * Emails the contractor side (Owner/Admin) that the client declined
 * (email_type 'co_signature_declined', spec §7.2 — contractor only; the
 * client is NOT emailed). Best-effort.
 */
async function notifyCoDeclined(
  admin: SupabaseClient<Database>,
  params: {
    companyId: string;
    changeOrderId: string;
    coNumber: string;
    sessionId: string;
    declineNotes: string | null;
  }
): Promise<void> {
  const { data: company } = await admin
    .from('companies')
    .select('name, slug, logo_url, brand_color')
    .eq('id', params.companyId)
    .single();
  if (!company) return;

  const sender = buildSenderAddress(company);
  const managers = await getManagerRecipients(admin, params.companyId);
  const subject = `Change order ${params.coNumber} declined`;

  for (const m of managers) {
    const bodyText = `Hi ${m.first_name},\n\nChange order ${params.coNumber} was declined by the client.${
      params.declineNotes ? `\n\nNotes: ${params.declineNotes}` : ''
    }\n\nYou can void it or send a revised change order from the project.\n\n— ${company.name}`;

    const { messageId, error } = await sendEmail({
      from: sender,
      to: m.email,
      subject,
      react: ChangeOrderEmail({
        companyName: company.name,
        logoUrl: company.logo_url,
        brandColor: company.brand_color || '#1a56db',
        bodyText,
        signingUrl: null,
      }),
    });

    await logEmail(admin, {
      company_id: params.companyId,
      estimate_id: null,
      signing_session_id: null,
      change_order_id: params.changeOrderId,
      co_signing_session_id: params.sessionId,
      resend_message_id: messageId,
      email_type: 'co_signature_declined',
      recipient_email: m.email,
      sender_email: sender,
      subject,
      status: error ? 'failed' : 'sent',
      metadata: error ? { error } : undefined,
    });
  }
}

export interface DeclineCoParams {
  declineNotes: string | null;
  signerIp: string | null;
  signerUserAgent: string | null;
}

/**
 * Client declines to sign. The decline lives on the session (audit
 * record); the CO stays `sent` — the contractor decides whether to void
 * it or re-send a fresh link (post-send revision is void + new CO, F-4).
 */
export async function declineCoSignature(
  admin: SupabaseClient<Database>,
  token: string,
  params: DeclineCoParams
): Promise<{ success: boolean; error?: string }> {
  const session = await getActiveCoSessionByToken(admin, token);
  if (!session) return { success: false, error: 'This link has expired or is no longer valid.' };

  const { data: co } = await admin
    .from('change_orders')
    .select('id, status, co_number, company_id')
    .eq('id', session.change_order_id)
    .single();
  if (!co || co.status !== 'sent') {
    return { success: false, error: 'This change order is no longer awaiting a response.' };
  }

  const { error: sessionError } = await admin
    .from('co_signing_sessions')
    .update({
      status: 'declined',
      declined_at: new Date().toISOString(),
      decline_notes: params.declineNotes,
      signer_ip: params.signerIp,
      signer_user_agent: params.signerUserAgent,
    })
    .eq('id', session.id)
    .eq('status', 'pending');
  if (sessionError) return { success: false, error: sessionError.message };

  // Notify the contractor side (spec §7.2 — contractor only). Best-effort.
  await notifyCoDeclined(admin, {
    companyId: co.company_id,
    changeOrderId: co.id,
    coNumber: co.co_number,
    sessionId: session.id,
    declineNotes: params.declineNotes,
  });

  return { success: true };
}
