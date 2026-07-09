import { createClient } from '@/lib/supabase-browser';
import type { ContactType } from '@framefocus/shared/constants';
import type { ProjectContact } from '@/lib/services/project-contacts';
export type { ProjectContact };

/** Attach an existing Module 2 contact to a project. */
export async function attachContact(
  projectId: string,
  contactId: string,
  role?: string | null,
  notes?: string | null
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  const { error } = await supabase.from('project_contacts').insert({
    project_id: projectId,
    contact_id: contactId,
    role: role ?? null,
    notes: notes ?? null,
  });

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'This contact is already attached to the project.' };
    }
    return { success: false, error: error.message };
  }
  return { success: true };
}

/**
 * Write-through create (5A §7b): a contact "created in the project" is a
 * normal Module 2 contacts row (typed so it never surfaces as a lead) plus a
 * project_contacts link — reusable on future projects.
 */
export async function createAndAttachContact(
  projectId: string,
  contact: {
    first_name: string;
    last_name: string;
    contact_type: ContactType;
    company_name?: string | null;
    email?: string | null;
    phone?: string | null;
  },
  role?: string | null
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  const { data, error } = await supabase.from('contacts').insert(contact).select('id').single();
  if (error) return { success: false, error: error.message };

  return attachContact(projectId, data.id, role ?? contact.contact_type);
}

export async function detachContact(
  projectContactId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  const { error } = await supabase
    .from('project_contacts')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', projectContactId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}
