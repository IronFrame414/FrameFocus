import { createClient } from '@/lib/supabase-browser';
import type { AnyFileCategory, FileCategory } from './files';
import { applied, DISCARDED } from './mutation-result';
import { SIGNED_URL_TTL_SECONDS } from './signed-url-ttl';

const BUCKET = 'project-files';
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

type UploadResult = { success: boolean; id?: string; error?: string };
type MutationResult = { success: boolean; error?: string };

// Browsers leave file.type EMPTY for formats they don't recognize — notably
// iPhone HEIC. Falling back straight to application/octet-stream makes such
// photos invisible to every mime_type LIKE 'image/%' query (log/incident
// photo grids and PDF embeds), so infer from the extension first.
const EXTENSION_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};

function inferMimeType(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_MIME[ext] ?? 'application/octet-stream';
}

const HEIC_MIME_TYPES = new Set(['image/heic', 'image/heif']);
const HEIC_JPEG_QUALITY = 0.82;

// #94: browsers and react-pdf render JPEG/PNG only — HEIC bytes stored as-is
// are invisible in photo grids and captioned "not embedded" in PDFs. Convert
// at upload so every consumer keys off the row's image/jpeg mime_type
// unchanged. heic2any is browser-only and heavy, so it is dynamically
// imported here — non-HEIC uploads never load it. Returns null on ANY
// failure: the caller falls back to uploading the original bytes, so an
// upload never fails harder than the pre-conversion behavior.
async function convertHeicToJpeg(file: File): Promise<File | null> {
  try {
    const { default: heic2any } = await import('heic2any');
    const result = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: HEIC_JPEG_QUALITY,
    });
    // Multi-frame HEIC (bursts) yields an array — keep the first frame.
    const blob = Array.isArray(result) ? result[0] : result;
    if (!blob) return null;
    const jpegName = `${file.name.replace(/\.(heic|heif)$/i, '')}.jpg`;
    return new File([blob], jpegName, { type: 'image/jpeg' });
  } catch (err) {
    console.error('HEIC conversion failed — uploading original bytes:', err);
    return null;
  }
}

export async function uploadFile(
  file: File,
  options: {
    /**
     * NULL for a COMPANY-SCOPED file that belongs to no job — 7C compliance
     * documents are keyed on a member, not a project [S140].
     *
     * A null here is not a loosening: `files_insert_non_client`
     * (20260728000000) only admits `project_id IS NULL` for Owner/Admin, so
     * the database refuses this shape for every other role whatever the caller
     * passes. `path_segment` is then REQUIRED, because the storage path's
     * second segment has no project id to take.
     */
    project_id: string | null;
    category: AnyFileCategory;
    /**
     * Second storage-path segment when `project_id` is null (e.g.
     * `compliance/{member_id}`). Ignored when a project id is present.
     * Storage RLS keys on segment ONE (the company id), so anything below it
     * is free-form — see CLAUDE.md, storage-policy inline-subquery note.
     */
    path_segment?: string;
    tags?: string[];
    /**
     * Client-generated row id (§5.3, offline-ready). When present the insert
     * is an UPSERT ON THE PRIMARY KEY, so replaying a queued photo N times
     * produces exactly one `files` row — and a replay that finds the row
     * already landed removes its just-uploaded duplicate blob instead of
     * orphaning it.
     */
    id?: string;
  }
): Promise<UploadResult> {
  // Client-side size check — fail fast before touching storage.
  // #94: the limit applies to the ORIGINAL bytes — an oversized HEIC is
  // rejected before we spend the conversion (the converted JPEG is smaller,
  // so nothing that passes here can exceed the limit after conversion).
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      success: false,
      error: `File too large. Max size is ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB.`,
    };
  }

  // #94: HEIC → JPEG at upload. On conversion failure `upload` keeps the
  // original file and its inferred HEIC mime (today's stored-but-unrendered
  // behavior). All downstream fields (path, name, size, mime_type) follow
  // `upload`, never `file`.
  let upload = file;
  let mimeType = inferMimeType(file);
  if (HEIC_MIME_TYPES.has(mimeType)) {
    const converted = await convertHeicToJpeg(file);
    if (converted) {
      upload = converted;
      mimeType = 'image/jpeg';
    }
  }

  const supabase = createClient();

  // company_id is needed to build the storage path.
  // Tech debt #24: unavoidable until company_id lands in JWT custom claims.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();
  if (!profile) return { success: false, error: 'Profile not found' };

  // Storage path: {company_id}/{project_id}/{uuid}-{safe_filename}, or
  // {company_id}/{path_segment}/{uuid}-{safe_filename} for a company-scoped
  // file with no project [S140].
  // Category lives in the column, NOT in the path — keeps category editable
  // without orphaning the storage location.
  const uniqueId = crypto.randomUUID();
  const safeFilename = upload.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const scopeSegment = options.project_id ?? options.path_segment;
  if (!scopeSegment) {
    // Guarded rather than allowed to interpolate: `${null}` would have
    // produced a literal "null" path segment and stored the bytes somewhere
    // no reader looks. Fail before touching storage.
    return {
      success: false,
      error: 'Upload needs either a project or a path segment.',
    };
  }
  const storagePath = `${profile.company_id}/${scopeSegment}/${uniqueId}-${safeFilename}`;

  // Upload bytes first
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, upload, {
    contentType: mimeType,
    upsert: false,
  });

  if (uploadError) {
    return { success: false, error: `Upload failed: ${uploadError.message}` };
  }

  // Insert row. Postgres defaults fill in company_id, created_by, updated_by.
  const row = {
    ...(options.id ? { id: options.id } : {}),
    project_id: options.project_id,
    category: options.category,
    file_name: upload.name,
    file_path: storagePath,
    file_size: upload.size,
    mime_type: mimeType,
    tags: options.tags ?? [],
  };

  if (options.id) {
    // §5.3 — idempotent on the client-generated id. ignoreDuplicates (DO
    // NOTHING) mirrors the queue executors: a replay is byte-identical by
    // definition, and DO UPDATE would run trigger friction for no gain.
    // `maybeSingle` returns null when the row already existed — the earlier
    // landing owns the bytes, so this attempt's blob is a duplicate to remove.
    const { data, error: insertError } = await supabase
      .from('files')
      .upsert(row, { onConflict: 'id', ignoreDuplicates: true })
      .select('id')
      .maybeSingle();

    if (insertError) {
      await supabase.storage.from(BUCKET).remove([storagePath]);
      return { success: false, error: `Database insert failed: ${insertError.message}` };
    }
    if (!data) {
      await supabase.storage.from(BUCKET).remove([storagePath]);
      return { success: true, id: options.id };
    }
    return { success: true, id: data.id };
  }

  const { data, error: insertError } = await supabase
    .from('files')
    .insert(row)
    .select('id')
    .single();

  if (insertError) {
    // Cleanup: orphaned blob
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return { success: false, error: `Database insert failed: ${insertError.message}` };
  }

  return { success: true, id: data.id };
}

/** 113c-spec §6 (#113b) — a sub's bid PDF uploaded at BID ENTRY, before any
 *  project exists: files.project_id stays NULL (nullable by schema; the
 *  Module 5 FK only constrains non-NULL values) and the storage path keys
 *  the estimate — `{company_id}/estimate-bids/{estimate_id}/{uuid}-{name}`.
 *  Storage RLS only checks the first path segment (company_id), so the
 *  path convention holds. The file rides to the draft sub-contract's
 *  signed_doc_file_id at conversion (spec §3). Not HEIC-converted — bid
 *  documents are PDFs, not photos. */
export async function uploadEstimateBidDocument(
  file: File,
  estimateId: string
): Promise<UploadResult> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      success: false,
      error: `File too large. Max size is ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB.`,
    };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();
  if (!profile) return { success: false, error: 'Profile not found' };

  const uniqueId = crypto.randomUUID();
  const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${profile.company_id}/estimate-bids/${estimateId}/${uniqueId}-${safeFilename}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
    contentType: inferMimeType(file),
    upsert: false,
  });
  if (uploadError) return { success: false, error: `Upload failed: ${uploadError.message}` };

  const { data, error: insertError } = await supabase
    .from('files')
    .insert({
      project_id: null,
      category: 'contracts',
      file_name: file.name,
      file_path: storagePath,
      file_size: file.size,
      mime_type: inferMimeType(file),
      tags: [],
    })
    .select('id')
    .single();
  if (insertError) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return { success: false, error: `Database insert failed: ${insertError.message}` };
  }
  return { success: true, id: data.id };
}

/** Client-side signed URL for viewing a file (e.g. an attached bid PDF).
 *  Storage RLS scopes reads by the company_id path segment. */
export async function getFileSignedUrlClient(
  fileId: string,
  expiresIn = SIGNED_URL_TTL_SECONDS
): Promise<string | null> {
  const supabase = createClient();
  const { data: row } = await supabase.from('files').select('file_path').eq('id', fileId).single();
  if (!row?.file_path) return null;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(row.file_path, expiresIn);
  return data?.signedUrl ?? null;
}

export async function updateFile(
  id: string,
  updates: {
    file_name?: string;
    category?: FileCategory;
    tags?: string[];
    ai_tags?: string[] | null;
    markup_data?: Record<string, unknown> | null;
  }
): Promise<MutationResult> {
  const supabase = createClient();

  // BEFORE UPDATE trigger `files_set_updated_by` handles updated_by automatically.
  // `.select('id')` is what makes the affected rows observable — see
  // mutation-result.ts. Without it an RLS-discarded update reports success.
  const { data, error } = await supabase.from('files').update(updates).eq('id', id).select('id');

  if (error) return { success: false, error: error.message };
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}

export async function softDeleteFile(id: string): Promise<MutationResult> {
  const supabase = createClient();

  // BEFORE UPDATE trigger handles updated_by.
  const { data, error } = await supabase
    .from('files')
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id');

  if (error) return { success: false, error: error.message };
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}

export async function restoreFile(id: string): Promise<MutationResult> {
  const supabase = createClient();

  // BEFORE UPDATE trigger handles updated_by.
  const { data, error } = await supabase
    .from('files')
    .update({
      is_deleted: false,
      deleted_at: null,
    })
    .eq('id', id)
    .select('id');

  if (error) return { success: false, error: error.message };
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}

export async function permanentDeleteFile(id: string): Promise<MutationResult> {
  const supabase = createClient();

  // Look up file_path so we can delete the storage blob
  const { data: file, error: fetchError } = await supabase
    .from('files')
    .select('file_path')
    .eq('id', id)
    .single();

  if (fetchError || !file) {
    return { success: false, error: 'File not found' };
  }

  // Delete storage blob first — if row delete fails after, we have an orphan
  // row but no orphan bytes. Opposite ordering would waste storage.
  //
  // ⚠️ M3-02 [S157] — NEITHER HALF ERRORS WHEN RLS REFUSES, so this function
  // reported `{ success: true }` having deleted NOTHING, on the one operation
  // in M3 that is genuinely irreversible. Proven LIVE at S155 (F4) as a crew
  // member: `remove()` returned `error: null` with an EMPTY removed-list, the
  // row DELETE affected zero rows with `error: null`, and the row was still
  // there afterwards.
  //
  // The storage API's refusal is the empty `data` array, NOT an error — which
  // is why `storageError` alone was never going to catch it.
  const { data: removed, error: storageError } = await supabase.storage
    .from(BUCKET)
    .remove([file.file_path]);

  if (storageError) {
    return { success: false, error: `Storage delete failed: ${storageError.message}` };
  }
  if (!removed || removed.length === 0) {
    // Nothing was removed and storage did not say so. Stop BEFORE deleting the
    // row: reporting success here would claim the bytes are gone while they
    // are still served, and deleting the row anyway would strand them
    // permanently with no record pointing at them.
    return { success: false, error: DISCARDED };
  }

  // Delete row (RLS enforces owner/admin only).
  //
  // `.select('id')` for the same reason as every UPDATE-shaped write in this
  // repo — see mutation-result.ts. A DELETE that matches no row is not an
  // error, and this one is NOT the legitimate-empty case the helper warns
  // about: we have already proven the row exists by reading `file_path` above.
  const { data: deleted, error: deleteError } = await supabase
    .from('files')
    .delete()
    .eq('id', id)
    .select('id');

  if (deleteError) {
    return { success: false, error: `Database delete failed: ${deleteError.message}` };
  }
  if (!applied(deleted)) {
    // The bytes are gone and the row is not. Say so precisely rather than
    // reporting a clean success or a bare failure — CLAUDE.md forbids naming a
    // cause that has not been verified, and this one HAS been.
    return {
      success: false,
      error:
        'The file contents were deleted but the record could not be removed. Contact an owner or admin.',
    };
  }

  return { success: true };
}
export async function toggleFavorite(id: string, isFavorite: boolean): Promise<MutationResult> {
  const supabase = createClient();

  // BEFORE UPDATE trigger handles updated_by.
  const { data, error } = await supabase
    .from('files')
    .update({ is_favorite: isFavorite })
    .eq('id', id)
    .select('id');

  if (error) return { success: false, error: error.message };
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}
