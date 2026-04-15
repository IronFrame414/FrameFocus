import { createClient } from '@/lib/supabase-browser';
import type { FileCategory } from './files';

const BUCKET = 'project-files';
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

type UploadResult = { success: boolean; id?: string; error?: string };
type MutationResult = { success: boolean; error?: string };

export async function uploadFile(
  file: File,
  options: {
    project_id: string;
    category: FileCategory;
    tags?: string[];
  }
): Promise<UploadResult> {
  // Client-side size check — fail fast before touching storage
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      success: false,
      error: `File too large. Max size is ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB.`,
    };
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
  const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${profile.company_id}/${options.project_id}/${uniqueId}-${safeFilename}`;

  // Fallback for browsers that don't populate file.type
  const mimeType = file.type || 'application/octet-stream';

  // Upload bytes first
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
    contentType: mimeType,
    upsert: false,
  });

  if (uploadError) {
    return { success: false, error: `Upload failed: ${uploadError.message}` };
  }

  // Insert row. Postgres defaults fill in company_id, created_by, updated_by.
  const { data, error: insertError } = await supabase
    .from('files')
    .insert({
      project_id: options.project_id,
      category: options.category,
      file_name: file.name,
      file_path: storagePath,
      file_size: file.size,
      mime_type: mimeType,
      tags: options.tags ?? [],
    })
    .select('id')
    .single();

  if (insertError) {
    // Cleanup: orphaned blob
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return { success: false, error: `Database insert failed: ${insertError.message}` };
  }

  return { success: true, id: data.id };
}

export async function updateFile(
  id: string,
  updates: {
    file_name?: string;
    category?: FileCategory;
    tags?: string[];
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
