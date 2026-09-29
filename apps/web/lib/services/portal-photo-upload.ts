import 'server-only';
import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';

/**
 * M9 R11 — ONE client photo, stored and recorded AS HER.
 *
 * [S116 F-12, #2-s180u] Moved here, unchanged in substance, from
 * `POST /api/portal/messages`, which used to receive the note and every photo
 * in one multipart request. The composer now uploads each photo through the
 * shared queue (`runUploadBatch`, ≤3 in flight, named failures, retry) via
 * `POST /api/portal/photos`, and posts the message with the ids once they have
 * landed. The gates are the same two, in the same order:
 * `project_files_insert_client` (storage) then `files_insert_client` (row).
 * There is no service-role client here: this adds no authority she did not
 * already have through her own session.
 */
export const MAX_PORTAL_PHOTOS = 6;
const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

export type PortalPhotoUpload =
  | { ok: true; id: string }
  | { ok: false; status: number; error: string };

export async function uploadPortalPhoto(
  supabase: SupabaseClient<Database>,
  params: { companyId: string; projectId: string; file: File; route: string }
): Promise<PortalPhotoUpload> {
  const { companyId, projectId, file, route } = params;
  if (!ALLOWED.includes(file.type)) {
    return { ok: false, status: 400, error: `${file.name} is not a photo we can accept.` };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, status: 400, error: `${file.name} is too large.` };
  }

  // `{company_id}/{project_id}/{name}` — the convention every storage policy
  // in this repo parses with `storage.foldername()`. A random prefix on the
  // filename so two photos called IMG_0001.jpg do not overwrite each other.
  const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, '_').slice(-80);
  const path = `${companyId}/${projectId}/${randomUUID()}-${safeName}`;

  const { error: upErr } = await supabase.storage
    .from('project-files')
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) {
    console.error('portal photo upload failed', {
      route,
      check: 'project_files_insert_client',
      projectId,
      message: upErr.message,
    });
    return { ok: false, status: 400, error: 'That photo could not be uploaded.' };
  }

  const { data: row, error: rowErr } = await supabase
    .from('files')
    .insert({
      project_id: projectId,
      category: 'photos',
      file_name: file.name,
      file_path: path,
      file_size: file.size,
      mime_type: file.type,
      // R11 — her photos are client-visible. Sent explicitly AND enforced by
      // the WITH CHECK, so a caller that forgot it is refused rather than
      // storing a photo she could not then see.
      client_visible: true,
    })
    .select('id')
    .single();

  if (rowErr || !row) {
    console.error('portal photo row failed', {
      route,
      check: 'files_insert_client',
      projectId,
      message: rowErr?.message,
    });
    return { ok: false, status: 400, error: 'That photo could not be saved.' };
  }
  return { ok: true, id: (row as { id: string }).id };
}

/**
 * The ids a client names when she posts a message must be photos SHE uploaded
 * to THIS project, not yet attached to any message. Checked here because
 * `chat_message_photos_insert_client` checks the MESSAGE is hers, not the FILE
 * — and when the photos arrived in the same request that was true by
 * construction; now that they arrive first, it has to be verified.
 */
export async function verifyOwnUnattachedPhotos(
  supabase: SupabaseClient<Database>,
  params: { userId: string; projectId: string; fileIds: string[] }
): Promise<{ ok: true } | { ok: false; error: string; check: string }> {
  const { userId, projectId, fileIds } = params;
  if (fileIds.length === 0) return { ok: true };
  if (new Set(fileIds).size !== fileIds.length) {
    return { ok: false, error: 'A photo was listed twice.', check: 'duplicate ids' };
  }
  const { data: rows, error } = await supabase
    .from('files')
    .select('id, created_by, project_id, category, client_visible, is_deleted')
    .in('id', fileIds);
  if (error) return { ok: false, error: 'Your photos could not be checked.', check: error.message };
  const good = (rows ?? []).filter(
    (r) =>
      r.created_by === userId &&
      r.project_id === projectId &&
      r.category === 'photos' &&
      r.client_visible === true &&
      r.is_deleted === false
  );
  if (good.length !== fileIds.length) {
    return {
      ok: false,
      error: 'A photo could not be attached. Please add it again.',
      check: `own photos ${good.length} of ${fileIds.length}`,
    };
  }
  const { data: used, error: usedErr } = await supabase
    .from('chat_message_photos')
    .select('file_id')
    .in('file_id', fileIds);
  if (usedErr) {
    return { ok: false, error: 'Your photos could not be checked.', check: usedErr.message };
  }
  if ((used ?? []).length > 0) {
    return {
      ok: false,
      error: 'A photo is already on another message.',
      check: `already attached ${(used ?? []).length}`,
    };
  }
  return { ok: true };
}
