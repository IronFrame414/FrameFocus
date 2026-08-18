import { createClient } from '@/lib/supabase-browser';
import { applied, DISCARDED } from '@/lib/services/mutation-result';

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
  const { data, error } = await supabase
    .from('contacts')
    .update(updates)
    .eq('id', id)
    .select('id');

  if (error) return { success: false, error: error.message };
  // M2-03 [S154]. `contacts_update_authorized` admits owner/admin/PM only, so
  // foreman, crew, subcontractor and client all match ZERO rows — which is not
  // an error, and used to be reported as success.
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}

export async function deleteContact(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  // BEFORE UPDATE trigger handles updated_by.
  const { data, error } = await supabase
    .from('contacts')
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id');

  if (error) return { success: false, error: error.message };
  // M2-03 [S154], and this was the perverse one: before the guard, a crew
  // member was told the contact was deleted (zero rows, no error) while an
  // Owner got a raw Postgres string, because M2-02 made the Owner's write the
  // only one that reached the WITH CHECK. Both halves are fixed now — the
  // Owner's succeeds, and everyone else is told the truth.
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}


// ── Picker options (4D estimate builder) ──

export interface ContactOption {
  id: string;
  first_name: string;
  last_name: string;
  company_name: string | null;
  email: string | null;
}

export async function listContactOptions(): Promise<{
  options: ContactOption[];
  error: string | null;
}> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, company_name, email')
    .eq('is_deleted', false)
    .order('last_name', { ascending: true });

  // M2-07 [S154]. Was `if (error) return []`, which renders a failure as "this
  // company has no contacts" — indistinguishable from the truth. This picker
  // feeds `contact_address_id` into proposals and lien releases, so a silent
  // empty list is how a document ends up with no job-site address.
  if (error) {
    console.error('listContactOptions: contacts query failed', error);
    return { options: [], error: error.message };
  }
  return { options: data ?? [], error: null };
}
