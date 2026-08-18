import { createClient } from '@/lib/supabase-browser';
import { applied, DISCARDED } from '@/lib/services/mutation-result';
import type { Database } from '@framefocus/shared/types/database';
import type { PrimaryAddress } from './contact-addresses';

export type { PrimaryAddress };

export type CreateAddressInput = Pick<
  Database['public']['Tables']['contact_addresses']['Insert'],
  | 'contact_id'
  | 'label'
  | 'address_line1'
  | 'address_line2'
  | 'city'
  | 'state'
  | 'zip'
  | 'is_primary'
>;

export type UpdatePrimaryAddressInput = Pick<
  Database['public']['Tables']['contact_addresses']['Insert'],
  'label' | 'address_line1' | 'address_line2' | 'city' | 'state' | 'zip'
>;

export async function createAddress(
  input: CreateAddressInput
): Promise<{ success: boolean; id?: string; error?: string }> {
  const supabase = createClient();

  // Postgres defaults fill in company_id, created_by, updated_by, created_at, updated_at.
  const { data, error } = await supabase
    .from('contact_addresses')
    .insert(input)
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, id: data.id };
}

export async function updatePrimaryAddress(
  contactId: string,
  input: UpdatePrimaryAddressInput
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  const { data: existing, error: lookupError } = await supabase
    .from('contact_addresses')
    .select('id')
    .eq('contact_id', contactId)
    .eq('is_deleted', false)
    .eq('is_primary', true)
    .maybeSingle();

  if (lookupError) return { success: false, error: lookupError.message };

  if (existing) {
    // BEFORE UPDATE trigger `contact_addresses_set_updated_by` handles updated_by.
    // updated_at is handled by the existing updated_at trigger.
    const { data, error } = await supabase
      .from('contact_addresses')
      .update(input)
      .eq('id', existing.id)
      .select('id');

    if (error) return { success: false, error: error.message };
    // M2-03 [S154]. `contact_addresses_update_authorized` is owner/admin/PM.
    if (!applied(data)) return { success: false, error: DISCARDED };
    return { success: true };
  }

  // Postgres defaults fill in company_id, created_by, updated_by, created_at, updated_at.
  const { error } = await supabase
    .from('contact_addresses')
    .insert({ ...input, contact_id: contactId, is_primary: true });

  if (error) return { success: false, error: error.message };
  return { success: true };
}


// ── 4D — address picker ──

export interface ContactAddressOption {
  id: string;
  label: string | null;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  zip: string;
  is_primary: boolean;
}

export async function listAddressesForContact(
  contactId: string
): Promise<{ addresses: ContactAddressOption[]; error: string | null }> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('contact_addresses')
    .select('id, label, address_line1, address_line2, city, state, zip, is_primary')
    .eq('contact_id', contactId)
    .eq('is_deleted', false)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true });

  // M2-07 [S154]. See listContactOptions — an empty list here is the input to
  // the address a proposal and a lien release later print.
  if (error) {
    console.error('listAddressesForContact: query failed', { contactId, error });
    return { addresses: [], error: error.message };
  }
  return { addresses: data ?? [], error: null };
}
