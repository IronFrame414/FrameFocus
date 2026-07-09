import { createClient } from '@/lib/supabase-server';
import type { Database } from '@framefocus/shared/types/database';

import type { ContactType } from '@framefocus/shared/constants';
export type { ContactType };

type ContactRow = Database['public']['Tables']['contacts']['Row'];

// contact_type widened in Module 5 (5A §7a) — see CONTACT_TYPES in
// @framefocus/shared/constants/form-options.
export type Contact = Omit<ContactRow, 'contact_type' | 'status'> & {
  contact_type: ContactType;
  status: 'active' | 'inactive' | 'archived';
};

export async function getContacts(filters?: {
  contact_type?: string;
  status?: string;
}): Promise<Contact[]> {
  const supabase = await createClient();

  let query = supabase
    .from('contacts')
    .select('*')
    .eq('is_deleted', false)
    .order('last_name', { ascending: true });

  if (filters?.contact_type) {
    query = query.eq('contact_type', filters.contact_type);
  }
  if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  const { data, error } = await query;
  if (error) return [];
  return data ?? [];
}

export async function getContact(id: string): Promise<Contact | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', id)
    .eq('is_deleted', false)
    .single();

  return data ?? null;
}
