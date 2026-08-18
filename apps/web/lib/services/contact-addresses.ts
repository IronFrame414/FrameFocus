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

/** The one-line site address a project points at, formatted for display. */
export type SiteAddress = Pick<
  Database['public']['Tables']['contact_addresses']['Row'],
  'id' | 'address_line1' | 'address_line2' | 'city' | 'state' | 'zip'
>;

/**
 * The job-site address for a project — `projects.contact_address_id`.
 *
 * ⚠️ VISIBILITY IS THE DATABASE'S, NOT THIS FUNCTION'S [M2-01 / B2, S154].
 * `contact_addresses_select_scoped` decides who gets a row back:
 *
 *   * staff (owner/admin/PM/foreman/crew) — always, company-scoped;
 *   * a SUBCONTRACTOR — only when assigned to this project, and then only THIS
 *     address, never the contact's other addresses (a client home address does
 *     not travel with the grant);
 *   * a CLIENT — never.
 *
 * So this returns `null` for a caller with no claim, and the caller renders
 * nothing. Do NOT add a role check here: `app/m/detail-access.ts` states in its
 * own header that its route guard is UI-only and RLS will not catch a bypass,
 * and B2 was deliberately built the other way round.
 *
 * ONE round trip. The embed is resolved through the FK
 * `projects.contact_address_id`, and RLS applies to the embedded resource — a
 * refused address comes back as `null` rather than as an error, which is
 * exactly the shape the caller wants.
 */
export async function getProjectSiteAddress(projectId: string): Promise<SiteAddress | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('projects')
    .select(
      'contact_addresses:contact_address_id (id, address_line1, address_line2, city, state, zip)'
    )
    .eq('id', projectId)
    .maybeSingle();

  const address = (data as { contact_addresses: SiteAddress | null } | null)?.contact_addresses;
  return address ?? null;
}

/** `1 Site Lane, Apt 2 · Ridgefield, CT 06877` — nulls dropped, never blank parts. */
export function formatSiteAddress(a: SiteAddress): string {
  const street = [a.address_line1, a.address_line2].filter(Boolean).join(', ');
  return `${street} · ${a.city}, ${a.state} ${a.zip}`;
}
