import { createClient } from '@/lib/supabase-browser';

export async function createSubcontractor(
  sub: Record<string, unknown>
): Promise<{ success: boolean; id?: string; error?: string }> {
  const supabase = createClient();

  // Postgres defaults fill in company_id, created_by, updated_by.
  const { data, error } = await supabase.from('subcontractors').insert(sub).select('id').single();

  if (error) return { success: false, error: error.message };
  return { success: true, id: data.id };
}

export async function updateSubcontractor(
  id: string,
  updates: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  // BEFORE UPDATE trigger `subcontractors_set_updated_by` handles updated_by.
  // updated_at is handled by the existing updated_at trigger.
  const { error } = await supabase.from('subcontractors').update(updates).eq('id', id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function deleteSubcontractor(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  // BEFORE UPDATE trigger handles updated_by.
  const { error } = await supabase
    .from('subcontractors')
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}


// ── Picker options (4D bidding tab) ──

export interface SubcontractorOption {
  id: string;
  company_name: string;
  default_markup_percent: number | null;
}

export async function listSubcontractorOptions(): Promise<SubcontractorOption[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('subcontractors')
    .select('id, company_name, default_markup_percent')
    .eq('is_deleted', false)
    .order('company_name', { ascending: true });

  if (error) return [];
  return data ?? [];
}
