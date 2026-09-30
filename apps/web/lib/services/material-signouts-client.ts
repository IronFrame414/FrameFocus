import { createClient } from '@/lib/supabase-browser';
import { uploadFile } from '@/lib/services/files-client';
import type {
  NotReturnedReason,
  PhotoStage,
  ReturnCondition,
  SignoutCreateInput,
} from '@/lib/material-signouts/signout';
export type { SignoutDetail, SignoutListItem, SignoutPhoto } from '@/lib/services/material-signouts';

// S118 item 11 — browser writes for the material sign-out. Every state change
// after creation is a SECURITY DEFINER function that re-checks the role, the
// project and the state; there is no UPDATE policy on the record to reach.

type Result<T = undefined> = { success: true; data: T } | { success: false; error: string };

/** Create the record (pending_receipt) with the WP release signature. */
export async function createMaterialSignout(input: SignoutCreateInput): Promise<Result<{ id: string }>> {
  const supabase = createClient();
  const { data, error } = await supabase.from('material_signouts').insert(input).select('id').single();
  if (error || !data) return { success: false, error: error?.message ?? 'The sign-out was not saved.' };
  return { success: true, data: { id: data.id } };
}

/**
 * The two halves of a photo attach, for a retrying batch (`makeAttachWorker`):
 * a photo whose LINK failed is re-linked on retry, never uploaded twice.
 * Category `material_signout` — its own, never MIME — so the project Photos
 * view (PHOTO_VIEW_FILTER) never lists it.
 */
export function uploadSignoutPhotoFile(file: File, projectId: string) {
  return uploadFile(file, { project_id: projectId, category: 'material_signout' });
}

export async function linkSignoutPhoto(
  fileId: string,
  signoutId: string,
  stage: PhotoStage
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  // INSERT without returning rows: a refused insert is an error, never a silent
  // empty read. file_id is UNIQUE, so a retried link cannot attach one file twice.
  const { error } = await supabase
    .from('material_signout_photos')
    .insert({ file_id: fileId, signout_id: signoutId, stage });
  if (error) {
    // A retry after a link that DID land (the response was lost) is already done.
    if (error.code === '23505') return { success: true };
    return { success: false, error: error.message };
  }
  return { success: true };
}

/** The receiving party signs on this device. The database requires ≥1 release photo. */
export async function recordSignoutReceipt(
  signoutId: string,
  payload: { signer_name: string; title: string | null; signature_type: 'draw' | 'type'; signature_data: string }
): Promise<Result> {
  const supabase = createClient();
  const { error } = await supabase.rpc('record_material_signout_receipt', {
    p_signout_id: signoutId,
    p_signer_name: payload.signer_name,
    p_title: payload.title ?? '',
    p_signature_type: payload.signature_type,
    p_signature_data: payload.signature_data,
    p_ip: '',
    p_user_agent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
  });
  if (error) return { success: false, error: error.message };
  return { success: true, data: undefined };
}

/** The office closes it out (Owner/Admin/PM/PE), WP-signed. */
export async function closeMaterialSignout(
  signoutId: string,
  payload: {
    condition_at_return: ReturnCondition;
    returned_date: string;
    returned_time: string;
    return_notes: string | null;
    signer_name: string;
    signature_type: 'draw' | 'type';
    signature_data: string;
    /** [S121 3-F] Required by the DB when the material came back. */
    return_location_note: string | null;
    /** [S121 ASK-28] Required by the DB when it did not. */
    not_returned_reason: NotReturnedReason | null;
  }
): Promise<Result> {
  const supabase = createClient();
  const { error } = await supabase.rpc('close_material_signout', {
    p_signout_id: signoutId,
    p_condition_at_return: payload.condition_at_return,
    p_returned_date: payload.returned_date,
    p_returned_time: payload.returned_time,
    p_return_notes: payload.return_notes ?? '',
    p_signer_name: payload.signer_name,
    p_signature_type: payload.signature_type,
    p_signature_data: payload.signature_data,
    p_return_location_note: payload.return_location_note ?? undefined,
    p_not_returned_reason: payload.not_returned_reason ?? undefined,
  });
  if (error) return { success: false, error: error.message };
  return { success: true, data: undefined };
}

/** Regenerate the record's PDF (after the receipt and after the close). */
export async function generateSignoutPdf(signoutId: string): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(`/api/material-signouts/${signoutId}/pdf`, { method: 'POST' });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return { success: false, error: body?.error ?? `PDF generation failed (${res.status})` };
  }
  return { success: true };
}
