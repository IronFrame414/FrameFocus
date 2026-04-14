import { createClient } from '@/lib/supabase-browser';

export async function createContact(
  contact: Record<string, unknown>
): Promise<{ success: boolean; id?: string; error?: string }> {
  const supabase = createClient();

  // Postgres defaults fill in company_id, created_by, updated_by.
  const { data, error } = await supabase.from('contacts').insert(contact).select('id').single();

  if (error) return { success: false, error: error.message };
  return { success: true, id: data.id };
}

export async function updateContact(
  id: string,
  updates: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  // BEFORE UPDATE trigger `contacts_set_updated_by` handles updated_by.
  // updated_at is handled by the existing updated_at trigger.
  const { error } = await supabase.from('contacts').update(updates).eq('id', id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function deleteContact(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  // BEFORE UPDATE trigger handles updated_by.
  const { error } = await supabase
    .from('contacts')
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}
