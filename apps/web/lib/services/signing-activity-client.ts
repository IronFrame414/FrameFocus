import { createClient } from '@/lib/supabase-browser';
import type { Database } from '@framefocus/shared/types/database';
import { SIGNED_URL_TTL_SECONDS } from './signed-url-ttl';

// Spec 2 — read-side helpers for the estimate detail page's signing
// activity section. RLS limits both tables to Owner/Admin SELECT on
// their own company; other roles simply get empty lists.

type SigningSessionRow = Database['public']['Tables']['signing_sessions']['Row'];
type EmailLogRow = Database['public']['Tables']['email_logs']['Row'];

export type SigningSessionStatus =
  | 'pending'
  | 'completed'
  | 'declined'
  | 'expired'
  | 'invalidated';

export type SigningSession = Omit<SigningSessionRow, 'status' | 'signature_data'> & {
  status: SigningSessionStatus;
};

export type EmailLog = EmailLogRow;

export async function listSigningSessions(estimateId: string): Promise<SigningSession[]> {
  const supabase = createClient();

  // signature_data (the base64 PNG) is intentionally not selected —
  // it can be hundreds of KB and the activity list never shows it.
  const { data, error } = await supabase
    .from('signing_sessions')
    .select(
      'id, company_id, estimate_id, token, status, recipient_email, recipient_name, expires_at, signed_at, signature_type, signer_name, declined_at, decline_reason, decline_notes, signer_ip, signer_user_agent, consent_given, consent_text, created_at, updated_at'
    )
    .eq('estimate_id', estimateId)
    .order('created_at', { ascending: false });

  if (error) return [];
  return (data ?? []) as SigningSession[];
}

export async function listEmailLogs(estimateId: string): Promise<EmailLog[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('email_logs')
    .select('*')
    .eq('estimate_id', estimateId)
    .order('sent_at', { ascending: false });

  if (error) return [];
  return data ?? [];
}

/**
 * Signed proposal download: resolves the Module 3 file row and a
 * short-lived signed URL. `?download=` forces a download instead of
 * inline rendering (Supabase gotcha — CLAUDE.md).
 */
export async function getSignedProposalUrl(
  fileId: string
): Promise<{ url: string | null; error?: string }> {
  const supabase = createClient();

  const { data: file, error } = await supabase
    .from('files')
    .select('file_path, file_name')
    .eq('id', fileId)
    .maybeSingle();
  if (error || !file) return { url: null, error: 'Signed proposal file not found' };

  const { data, error: urlError } = await supabase.storage
    .from('project-files')
    .createSignedUrl(file.file_path, SIGNED_URL_TTL_SECONDS);
  if (urlError || !data?.signedUrl) {
    return { url: null, error: urlError?.message ?? 'Could not create download link' };
  }

  return { url: `${data.signedUrl}&download=${encodeURIComponent(file.file_name)}` };
}
