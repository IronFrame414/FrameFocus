import { createClient } from '@/lib/supabase-browser';
import type { ContactType } from '@framefocus/shared/constants';
import type { ProjectContact } from '@/lib/services/project-contacts';
import { applied, DISCARDED } from '@/lib/services/mutation-result';
import { createContact } from '@/lib/services/contacts-client';
export type { ProjectContact };

/** Attach an existing Module 2 contact to a project. */
export async function attachContact(
  projectId: string,
  contactId: string,
  role?: string | null,
  notes?: string | null
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  const { data, error } = await supabase.from('project_contacts').insert({
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
  // §1d — route through createContact so a matching (company_id, lower(email))
  // contact is REUSED, not duplicated. This is the path behind "create a contact
  // in the project" and the inline add-a-contact surfaces; minting a fresh row
  // each time is what produced the Karen Foster duplicates.
  const created = await createContact(contact as Record<string, unknown>);
  if (!created.success || !created.id) {
    return { success: false, error: created.error ?? 'Could not create the contact.' };
  }

  return attachContact(projectId, created.id, role ?? contact.contact_type);
}

export async function detachContact(
  projectContactId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('project_contacts')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', projectContactId)
    .select('id');

  if (error) return { success: false, error: error.message };
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}
