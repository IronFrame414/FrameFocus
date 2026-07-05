import 'server-only';
import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { CONSENT_TEXT } from '@/lib/proposal/proposal-defaults';

// 5D §6 — CO signing-session lifecycle, mirroring the M4 pattern
// (signing-service.ts): all functions take the service-role client
// because the public signing flow has no auth.uid(), and RLS on
// co_signing_sessions intentionally has no write policies (the token
// IS the credential). Unlike M4 there is NO email delivery at launch —
// the contractor shares the tokenized link manually (client delivery
// is gated by the Pre-Module 9 Decision Gate, flag F-3) — and no
// signed-PDF compositing (flag F-2 unresolved; the session's
// signature_data + consent columns are the binding record).

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
 * projects.contract_value is NOT touched (D-6 — Module 7 / #80 owns
 * the write-through).
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
    .select('id, status, co_number')
    .eq('id', session.change_order_id)
    .single();
  if (!co || co.status !== 'sent') {
    return { success: false, error: 'This change order is no longer awaiting signature.' };
  }

  const signedAt = new Date().toISOString();

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

  return { success: true };
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
    .select('id, status')
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

  return { success: true };
}
