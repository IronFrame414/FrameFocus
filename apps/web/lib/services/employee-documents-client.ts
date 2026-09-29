import { createClient } from '@/lib/supabase-browser';
import { applied, DISCARDED } from './mutation-result';
import { SIGNED_URL_TTL_SECONDS } from './signed-url-ttl';
import type { UploadOutcome } from '@/lib/uploads/upload-batch';

// S118 item 16 — documents filed against a PERSON. Client writes.
// Bucket `employee-documents`, path `{company_id}/{member_id}/{uuid}-{name}`.
// The storage and row policies are Owner/Admin for writes (20262060000000); a
// refused write comes back as an error here, never as a quiet success.

export type { EmployeeDocument } from './employee-documents';

export const EMPLOYEE_DOCUMENTS_BUCKET = 'employee-documents';

/** Storage keys reject `<` and `>` (Codespaces gotcha) — keep a safe name. */
function safeName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, '_').slice(-80) || 'document';
}

/**
 * One file → one object + one row. The object goes first: a row that points at
 * nothing would show a document that cannot be opened. A failed row insert
 * leaves an object with no row, which no read path lists or signs (the storage
 * policy for a non-Owner/Admin requires the row).
 */
export async function uploadEmployeeDocument(
  file: File,
  target: { companyId: string; memberId: string }
): Promise<UploadOutcome> {
  const supabase = createClient();
  const path = `${target.companyId}/${target.memberId}/${crypto.randomUUID()}-${safeName(file.name)}`;
  const { error: upErr } = await supabase.storage
    .from(EMPLOYEE_DOCUMENTS_BUCKET)
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (upErr) return { success: false, error: upErr.message };
  const { data, error } = await supabase
    .from('employee_documents')
    .insert({
      member_id: target.memberId,
      file_name: file.name,
      file_path: path,
      file_size: file.size,
      mime_type: file.type || null,
    })
    .select('id')
    .single();
  if (error || !data)
    return { success: false, error: error?.message ?? 'Could not record the document.' };
  return { success: true, id: data.id as string };
}

/** Owner/Admin: move a document to trash (soft delete — it is kept). */
export async function softDeleteEmployeeDocument(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('employee_documents')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id)
    .select('id');
  if (error) return { success: false, error: error.message };
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}

/**
 * A short-lived URL for one document. Storage RLS decides: Owner/Admin, or the
 * employee for their OWN live document; anyone else gets null.
 */
export async function employeeDocumentUrl(
  path: string,
  downloadName?: string
): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.storage
    .from(EMPLOYEE_DOCUMENTS_BUCKET)
    .createSignedUrl(
      path,
      SIGNED_URL_TTL_SECONDS,
      downloadName ? { download: downloadName } : undefined
    );
  return data?.signedUrl ?? null;
}
