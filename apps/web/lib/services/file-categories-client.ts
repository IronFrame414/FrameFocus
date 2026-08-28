import { createClient } from '@/lib/supabase-browser';
import type { FileCategoryRow } from '@/lib/services/files';
export type { FileCategoryRow };

// Redesign 6.1 — the browser half of per-company file categories. RLS is the
// enforcement: SELECT is company-wide; INSERT/UPDATE are Owner/Admin
// (`file_categories_{insert,update}_owner_admin`). The KEY is immutable at the
// database (trigger) — a rename changes the label, never the key, so app
// writers targeting 'lien_releases' etc. cannot be orphaned.

/** Company-wide rows plus, when given, a project's custom rows. */
export async function listFileCategories(projectId?: string): Promise<FileCategoryRow[]> {
  const supabase = createClient();
  let query = supabase
    .from('file_categories')
    .select('id, key, label, sort_order, is_system, project_id')
    .eq('is_deleted', false)
    .order('sort_order', { ascending: true });
  query = projectId
    ? query.or(`project_id.is.null,project_id.eq.${projectId}`)
    : query.is('project_id', null);
  const { data, error } = await query;
  if (error) return [];
  return (data ?? []) as FileCategoryRow[];
}

/** A custom category — per-job when `projectId` is given, company-wide when
 *  omitted (the Settings manager's case). The key is slugged from the label
 *  ONCE, at creation — it never changes afterwards. Owner/Admin by RLS. */
export async function createFileCategory(input: {
  label: string;
  projectId?: string;
}): Promise<{ success: boolean; key?: string; error?: string }> {
  const label = input.label.trim();
  if (!label) return { success: false, error: 'Name the category first.' };
  const key = `custom_${label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)}`;
  if (key === 'custom_') return { success: false, error: 'Name the category first.' };

  const supabase = createClient();
  const { error } = await supabase.from('file_categories').insert({
    key,
    label,
    project_id: input.projectId ?? null,
    sort_order: 100,
  });
  if (error) {
    return {
      success: false,
      error: error.code === '23505' ? 'A category with that name already exists.' : error.message,
    };
  }
  return { success: true, key };
}

// ── Step 8 (Settings › Documents) — the management surface Entry 20 deferred ──

/** Rename a category's LABEL. The key never changes (DB trigger); every file
 *  keeps its category through any rename. Owner/Admin by RLS. */
export async function renameFileCategory(
  id: string,
  label: string
): Promise<{ success: boolean; error?: string }> {
  const trimmed = label.trim();
  if (!trimmed) return { success: false, error: 'A category needs a name.' };
  const supabase = createClient();
  const { data, error } = await supabase
    .from('file_categories')
    .update({ label: trimmed })
    .eq('id', id)
    .select('id');
  if (error) return { success: false, error: error.message };
  if (!data?.length) return { success: false, error: 'Rename was not applied.' };
  return { success: true };
}

/** Persist a full ordering: each row's sort_order becomes its index. One
 *  UPDATE per moved row — the list is ~15 rows, and PostgREST has no batch
 *  UPDATE with distinct values. */
export async function reorderFileCategories(
  orderedIds: string[]
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from('file_categories')
      .update({ sort_order: i })
      .eq('id', orderedIds[i]);
    if (error) return { success: false, error: error.message };
  }
  return { success: true };
}

/** Soft-delete a CUSTOM category — refused while any live file still uses it,
 *  because the files page groups by the visible category list and a hidden
 *  key would make those files unreachable (silent loss, the #129 class). The
 *  DB trigger independently refuses system rows. */
export async function deleteFileCategory(cat: {
  id: string;
  key: string;
  is_system: boolean;
}): Promise<{ success: boolean; error?: string }> {
  if (cat.is_system) {
    return { success: false, error: 'Built-in categories cannot be deleted — rename them instead.' };
  }
  const supabase = createClient();
  const { count, error: countError } = await supabase
    .from('files')
    .select('id', { count: 'exact', head: true })
    .eq('category', cat.key)
    .eq('is_deleted', false);
  if (countError) return { success: false, error: countError.message };
  if ((count ?? 0) > 0) {
    return {
      success: false,
      error: `${count} file${count === 1 ? '' : 's'} still use this category. Re-categorize them first.`,
    };
  }
  const { data, error } = await supabase
    .from('file_categories')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', cat.id)
    .select('id');
  if (error) return { success: false, error: error.message };
  if (!data?.length) return { success: false, error: 'Delete was not applied.' };
  return { success: true };
}
