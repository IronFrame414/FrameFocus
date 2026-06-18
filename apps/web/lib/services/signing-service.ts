import 'server-only';
import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import {
  getManagerRecipients,
  logEmail,
  buildSenderAddress,
  sendEmail,
} from '@/lib/services/email-service';
import {
  compositeSignedPDF,
  generateProposalPDF,
  storeSignedPDF,
} from '@/lib/services/proposal-service';
import { NotificationEmail } from '@/lib/email/templates/notification-email';

// Spec 2 (4F) — signing-session lifecycle. All functions take the
// service-role client: the public signing flow has no auth.uid(),
// and RLS on signing_sessions intentionally has no write policies.

import { CONSENT_TEXT } from '@/lib/proposal/proposal-defaults';
export { CONSENT_TEXT };

type SigningSessionRow = Database['public']['Tables']['signing_sessions']['Row'];

export interface CreateSessionParams {
  companyId: string;
  estimateId: string;
  recipientEmail: string;
  recipientName: string | null;
  expiresAt: string;
}

/**
 * F3/F4 — new pending session. Token is the access credential
 * (crypto-random UUID); expiration matches the estimate's.
 */
export async function createSigningSession(
  admin: SupabaseClient<Database>,
  params: CreateSessionParams
): Promise<{ token: string | null; sessionId: string | null; error: string | null }> {
  const token = randomUUID();

  const { data, error } = await admin
    .from('signing_sessions')
    .insert({
      company_id: params.companyId,
      estimate_id: params.estimateId,
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
 * Returns the session only while it is actionable: pending and not
 * past expiry. Anything else (completed / declined / invalidated /
 * expired) returns null — the route renders the friendly error page.
 */
export async function getActiveSessionByToken(
  admin: SupabaseClient<Database>,
  token: string
): Promise<SigningSessionRow | null> {
  const { data } = await admin
    .from('signing_sessions')
    .select('*')
    .eq('token', token)
    .maybeSingle();

  if (!data) return null;
  if (data.status !== 'pending') return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return data;
}

/** F10 — old links stop working when a proposal is re-sent. */
export async function invalidateSessionsForEstimate(
  admin: SupabaseClient<Database>,
  estimateId: string
): Promise<void> {
  await admin
    .from('signing_sessions')
    .update({ status: 'invalidated' })
    .eq('estimate_id', estimateId)
    .eq('status', 'pending');
}

async function notifyManagers(
  admin: SupabaseClient<Database>,
  params: {
    companyId: string;
    estimateId: string;
    emailType: 'signature_complete' | 'signature_declined' | 'estimate_expired';
    heading: string;
    message: string;
  }
): Promise<void> {
  const { data: company } = await admin
    .from('companies')
    .select('name, slug, brand_color')
    .eq('id', params.companyId)
    .single();
  if (!company) return;

  const recipients = await getManagerRecipients(admin, params.companyId);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const sender = buildSenderAddress(company);

  for (const recipient of recipients) {
    const { messageId, error } = await sendEmail({
      from: sender,
      to: recipient.email,
      subject: params.heading,
      react: NotificationEmail({
        brandColor: company.brand_color || '#1a56db',
        heading: params.heading,
        message: params.message,
        estimateUrl: `${appUrl}/dashboard/estimates/${params.estimateId}`,
      }),
    });

    await logEmail(admin, {
      company_id: params.companyId,
      estimate_id: params.estimateId,
      signing_session_id: null,
      resend_message_id: messageId,
      email_type: params.emailType,
      recipient_email: recipient.email,
      sender_email: sender,
      subject: params.heading,
      status: error ? 'failed' : 'sent',
      metadata: error ? { error } : undefined,
    });
  }
}

export interface CompleteSignatureParams {
  signatureType: 'draw' | 'type';
  signatureData: string; // base64 PNG (data URL ok)
  signerName: string;
  signerIp: string | null;
  signerUserAgent: string | null;
}

/**
 * F6/F7 — records the signature with full audit data, composites
 * the signed PDF, stores it in Module 3, moves the estimate to
 * accepted, and notifies Owner/Admin.
 */
export async function completeSignature(
  admin: SupabaseClient<Database>,
  token: string,
  params: CompleteSignatureParams
): Promise<{ success: boolean; error?: string }> {
  const session = await getActiveSessionByToken(admin, token);
  if (!session) return { success: false, error: 'This link has expired or is no longer valid.' };

  const { data: estimate } = await admin
    .from('estimates')
    .select('id, status, name, estimate_number, company_id')
    .eq('id', session.estimate_id)
    .single();
  if (!estimate || estimate.status !== 'sent') {
    return { success: false, error: 'This proposal is no longer awaiting signature.' };
  }

  const signedAt = new Date().toISOString();

  // Generate + composite + store the signed PDF first — if this
  // fails the session stays pending and the client can retry.
  const generated = await generateProposalPDF(admin, estimate.id);
  if (!generated) return { success: false, error: 'Could not generate the proposal document.' };

  const signedPdf = await compositeSignedPDF(generated.buffer, {
    signatureImageBase64: params.signatureData,
    signerName: params.signerName,
    signedAtIso: signedAt,
  });

  const { fileId, error: storeError } = await storeSignedPDF(admin, {
    companyId: estimate.company_id,
    estimateNumber: estimate.estimate_number,
    signedPdfBuffer: signedPdf,
  });
  if (storeError || !fileId) {
    return { success: false, error: storeError ?? 'Could not store the signed proposal.' };
  }

  const { error: sessionError } = await admin
    .from('signing_sessions')
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

  const { error: estimateError } = await admin
    .from('estimates')
    .update({
      status: 'accepted',
      accepted_at: signedAt,
      signed_proposal_file_id: fileId,
    })
    .eq('id', estimate.id);
  if (estimateError) return { success: false, error: estimateError.message };

  await notifyManagers(admin, {
    companyId: estimate.company_id,
    estimateId: estimate.id,
    emailType: 'signature_complete',
    heading: `Proposal signed: ${estimate.estimate_number}`,
    message: `${params.signerName} signed "${estimate.name}" (${estimate.estimate_number}) on ${new Date(signedAt).toLocaleDateString()}.\nThe estimate is now Accepted and the signed PDF is stored in Files.`,
  });

  return { success: true };
}

export interface DeclineParams {
  declineReason:
    | 'too_expensive'
    | 'chose_competitor'
    | 'project_canceled'
    | 'timing'
    | 'scope_changed'
    | 'other';
  declineNotes: string | null;
  signerIp: string | null;
  signerUserAgent: string | null;
}

/**
 * F8 — decline with reason code. Estimate columns use the 4C names
 * (decline_reason_code / decline_reason_notes); the session keeps
 * its own copy for the legal record.
 */
export async function declineEstimate(
  admin: SupabaseClient<Database>,
  token: string,
  params: DeclineParams
): Promise<{ success: boolean; error?: string }> {
  const session = await getActiveSessionByToken(admin, token);
  if (!session) return { success: false, error: 'This link has expired or is no longer valid.' };

  const { data: estimate } = await admin
    .from('estimates')
    .select('id, status, name, estimate_number, company_id')
    .eq('id', session.estimate_id)
    .single();
  if (!estimate || estimate.status !== 'sent') {
    return { success: false, error: 'This proposal is no longer awaiting a response.' };
  }

  const declinedAt = new Date().toISOString();

  const { error: sessionError } = await admin
    .from('signing_sessions')
    .update({
      status: 'declined',
      declined_at: declinedAt,
      decline_reason: params.declineReason,
      decline_notes: params.declineNotes,
      signer_ip: params.signerIp,
      signer_user_agent: params.signerUserAgent,
    })
    .eq('id', session.id)
    .eq('status', 'pending');
  if (sessionError) return { success: false, error: sessionError.message };

  const { error: estimateError } = await admin
    .from('estimates')
    .update({
      status: 'declined',
      declined_at: declinedAt,
      decline_reason_code: params.declineReason,
      decline_reason_notes: params.declineNotes,
    })
    .eq('id', estimate.id);
  if (estimateError) return { success: false, error: estimateError.message };

  await notifyManagers(admin, {
    companyId: estimate.company_id,
    estimateId: estimate.id,
    emailType: 'signature_declined',
    heading: `Proposal declined: ${estimate.estimate_number}`,
    message: `The client declined "${estimate.name}" (${estimate.estimate_number}).\nReason: ${params.declineReason.replace(/_/g, ' ')}${params.declineNotes ? `\nNotes: ${params.declineNotes}` : ''}`,
  });

  return { success: true };
}

/**
 * J5/J8 — unsubscribe from reminders for this estimate. Works for
 * any session matching the token, regardless of status (the client
 * may click unsubscribe in an old reminder email).
 */
export async function recordUnsubscribe(
  admin: SupabaseClient<Database>,
  token: string
): Promise<{ success: boolean; companyName?: string; error?: string }> {
  const { data: session } = await admin
    .from('signing_sessions')
    .select('estimate_id, company_id')
    .eq('token', token)
    .maybeSingle();

  if (!session) return { success: false, error: 'Invalid link' };

  const { error } = await admin
    .from('estimates')
    .update({ client_unsubscribed_at: new Date().toISOString() })
    .eq('id', session.estimate_id);
  if (error) return { success: false, error: error.message };

  const { data: company } = await admin
    .from('companies')
    .select('name')
    .eq('id', session.company_id)
    .single();

  return { success: true, companyName: company?.name };
}

/** Expose the manager notifier for the cron's expiration pass (J7). */
export { notifyManagers };
