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

/** A custom, per-job category. The key is slugged from the label ONCE, at
 *  creation — it never changes afterwards. Owner/Admin by RLS. */
export async function createFileCategory(input: {
  label: string;
  projectId: string;
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
    project_id: input.projectId,
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
