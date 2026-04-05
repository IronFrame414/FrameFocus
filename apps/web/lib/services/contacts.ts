import { createClient } from '@/lib/supabase-server';

export interface Contact {
  id: string;
  company_id: string;
  contact_type: 'lead' | 'client';
  status: 'active' | 'inactive' | 'archived';
  first_name: string;
  last_name: string;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  source: string | null;
  notes: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

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
