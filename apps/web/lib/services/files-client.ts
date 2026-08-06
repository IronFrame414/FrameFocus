import { createClient } from '@/lib/supabase-browser';
import type { FileCategory } from './files';

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
    project_id: string;
    category: FileCategory;
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

  // Storage path: {company_id}/{project_id}/{uuid}-{safe_filename}
  // Category lives in the column, NOT in the path — keeps category editable
  // without orphaning the storage location.
  const uniqueId = crypto.randomUUID();
  const safeFilename = upload.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${profile.company_id}/${options.project_id}/${uniqueId}-${safeFilename}`;

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
  expiresIn = 300
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
  const { error } = await supabase.from('files').update(updates).eq('id', id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function softDeleteFile(id: string): Promise<MutationResult> {
  const supabase = createClient();

  // BEFORE UPDATE trigger handles updated_by.
  const { error } = await supabase
    .from('files')
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function restoreFile(id: string): Promise<MutationResult> {
  const supabase = createClient();

  // BEFORE UPDATE trigger handles updated_by.
  const { error } = await supabase
    .from('files')
    .update({
      is_deleted: false,
      deleted_at: null,
    })
    .eq('id', id);

  if (error) return { success: false, error: error.message };
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
  const { error: storageError } = await supabase.storage.from(BUCKET).remove([file.file_path]);

  if (storageError) {
    return { success: false, error: `Storage delete failed: ${storageError.message}` };
  }

  // Delete row (RLS enforces owner/admin only)
  const { error: deleteError } = await supabase.from('files').delete().eq('id', id);

  if (deleteError) {
    return { success: false, error: `Database delete failed: ${deleteError.message}` };
  }

  return { success: true };
}
export async function toggleFavorite(id: string, isFavorite: boolean): Promise<MutationResult> {
  const supabase = createClient();

  // BEFORE UPDATE trigger handles updated_by.
  const { error } = await supabase.from('files').update({ is_favorite: isFavorite }).eq('id', id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}
