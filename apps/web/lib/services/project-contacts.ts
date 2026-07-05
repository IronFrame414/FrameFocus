import { createClient } from '@/lib/supabase-server';
import type { Database } from '@framefocus/shared/types/database';

type ProjectContactRow = Database['public']['Tables']['project_contacts']['Row'];

/** Junction row joined with the Module 2 contact it attaches. */
export type ProjectContact = ProjectContactRow & {
  contact: {
    id: string;
    first_name: string;
    last_name: string;
    company_name: string | null;
    contact_type: string;
    email: string | null;
    phone: string | null;
  } | null;
};

export async function getProjectContacts(projectId: string): Promise<ProjectContact[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('project_contacts')
    .select(
      '*, contact:contacts(id, first_name, last_name, company_name, contact_type, email, phone)'
    )
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true });

  if (error) return [];
  return (data ?? []) as unknown as ProjectContact[];
}
