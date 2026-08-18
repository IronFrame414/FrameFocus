import { createClient } from '@/lib/supabase-server';
import type { Database } from '@framefocus/shared/types/database';

type SubcontractorRow = Database['public']['Tables']['subcontractors']['Row'];
export type Subcontractor = Omit<SubcontractorRow, 'sub_type' | 'status'> & {
  sub_type: 'subcontractor' | 'vendor';
  status: 'active' | 'inactive' | 'archived';
};

export async function getSubcontractors(filters?: {
  sub_type?: string;
  status?: string;
  trade_type?: string;
}): Promise<Subcontractor[]> {
  const supabase = await createClient();

  let query = supabase
    .from('subcontractors')
    .select('*')
    .eq('is_deleted', false)
    .order('company_name', { ascending: true });

  if (filters?.sub_type) {
    query = query.eq('sub_type', filters.sub_type);
  }
  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.trade_type) {
    query = query.eq('trade_type', filters.trade_type);
  }

  const { data, error } = await query;
  if (error) return [];
  return data ?? [];
}

export async function getSubcontractor(id: string): Promise<Subcontractor | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('subcontractors')
    .select('*')
    .eq('id', id)
    // ⚠️ No `is_deleted` filter [M2-02, S154] — same convention and same reason
    // as `getContact()`. A by-id fetch must return a soft-deleted row so a
    // restore flow can reach it; `getSubcontractors()` filters the list.
    .maybeSingle();

  return data ?? null;
}

// ---------------------------------------------------------------------------
// TECH_DEBT #132 [S122] — THE OWNER/ADMIN HALF, ON ITS OWN TABLE.
// ---------------------------------------------------------------------------
// `default_hourly_rate`, `default_markup_percent` and `ein` no longer live on
// `subcontractors`; migration 20260903000000 moved them to
// `subcontractor_financials`, whose SELECT policy is Owner/Admin.
//
// ⚠️ THIS IS WHY `select('*')` ABOVE IS NOW SAFE. It was the leak: the columns
// were on a table whose SELECT policy has no role arm, so a crew member,
// foreman, PM or subcontractor got the company's margin, cost rate and the
// sub's tax id in the payload of every screen that lists subs. The fix is the
// schema, not a narrower select — a narrower select is a UI gate wearing a
// service-layer coat, and #136 is what that costs.
//
// A refusal and an absent row are DELIBERATELY INDISTINGUISHABLE here: both
// return null. A caller below Admin has no business telling them apart, and
// `maybeSingle()` returns no error for an RLS-filtered read anyway.

export interface SubcontractorFinancials {
  default_hourly_rate: number | null;
  default_markup_percent: number | null;
  ein: string | null;
}

/** Owner/Admin only, by RLS. Returns null for every other role, and for a sub
 *  that simply has no financial row yet — the table is lazily populated. */
export async function getSubcontractorFinancials(
  subcontractorId: string
): Promise<SubcontractorFinancials | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('subcontractor_financials')
    .select('default_hourly_rate, default_markup_percent, ein')
    .eq('subcontractor_id', subcontractorId)
    .maybeSingle();

  return (data as SubcontractorFinancials | null) ?? null;
}
