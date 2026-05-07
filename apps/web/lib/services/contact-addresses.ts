import { createClient } from '@/lib/supabase-server';
import type { Database } from '@framefocus/shared/types/database';

export type PrimaryAddress = Pick<
  Database['public']['Tables']['contact_addresses']['Row'],
  | 'id'
  | 'contact_id'
  | 'label'
  | 'address_line1'
  | 'address_line2'
  | 'city'
  | 'state'
  | 'zip'
  | 'is_primary'
>;

export async function getPrimaryAddress(
  contactId: string
): Promise<PrimaryAddress | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('contact_addresses')
    .select(
      'id, contact_id, label, address_line1, address_line2, city, state, zip, is_primary'
    )
    .eq('contact_id', contactId)
    .eq('is_deleted', false)
    .eq('is_primary', true)
    .maybeSingle();

  return data ?? null;
}
