import { createClient } from '@/lib/supabase-server';
import type { Database } from '@framefocus/shared/types/database';

type FileRow = Database['public']['Tables']['files']['Row'];

export type FileCategory =
  | 'photos'
  | 'contracts'
  | 'plans'
  | 'permits'
  | 'invoices'
  | 'change_orders'
  | 'daily_logs'
  | 'receipts'
  | 'other';

export type FileRecord = Omit<FileRow, 'category'> & {
  category: FileCategory;
};

// Trash-bin pattern (list): filters is_deleted = false by default so deleted rows never appear in
// normal listings. Pass include_deleted: true to surface soft-deleted rows for the trash UI. See CLAUDE.md "Trash-bin pattern".
export async function getFiles(filters?: {
  project_id?: string;
  category?: FileCategory;
  include_deleted?: boolean;
}): Promise<FileRecord[]> {
  const supabase = await createClient();

  let query = supabase
    .from('files')
    .select('*')
    .order('created_at', { ascending: false });

  if (!filters?.include_deleted) {
    query = query.eq('is_deleted', false);
  }
  if (filters?.project_id) {
    query = query.eq('project_id', filters.project_id);
  }
  if (filters?.category) {
    query = query.eq('category', filters.category);
  }

  const { data, error } = await query;
  if (error) return [];
  return (data ?? []) as FileRecord[];
}

// Trash-bin pattern (single-row fetch): intentionally does NOT filter is_deleted so a
// restore-from-trash flow can fetch a soft-deleted record by id. See CLAUDE.md "Trash-bin pattern".
export async function getFile(id: string): Promise<FileRecord | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('files')
    .select('*')
    .eq('id', id)
    .single();

  return (data as FileRecord | null) ?? null;
}

export async function getSignedUrl(
  filePath: string,
  expiresIn: number = 3600
): Promise<string | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .storage
    .from('project-files')
    .createSignedUrl(filePath, expiresIn);

  if (error) return null;
  return data?.signedUrl ?? null;
}