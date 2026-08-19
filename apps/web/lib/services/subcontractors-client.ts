import { createClient } from '@/lib/supabase-browser';
import { applied, DISCARDED } from '@/lib/services/mutation-result';

export async function createSubcontractor(
  sub: Record<string, unknown>
): Promise<{ success: boolean; id?: string; error?: string }> {
  const supabase = createClient();

  // Postgres defaults fill in company_id, created_by, updated_by.
  const { data, error } = await supabase.from('subcontractors').insert(sub).select('id').single();

  if (error) return { success: false, error: error.message };
  return { success: true, id: data.id };
}

export async function updateSubcontractor(
  id: string,
  updates: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  // BEFORE UPDATE trigger `subcontractors_set_updated_by` handles updated_by.
  // updated_at is handled by the existing updated_at trigger.
  const { data, error } = await supabase
    .from('subcontractors')
    .update(updates)
    .eq('id', id)
    .select('id');

  if (error) return { success: false, error: error.message };
  // M2-03's rule, applied to the table it had not reached yet [S158].
  // `mutation-result.ts` says it without an escape hatch — *"an UPDATE-shaped
  // write ends `.select('id')` and goes through `applied()`. No exceptions."* —
  // and `subcontractors_update_authorized` admits owner/admin/project_manager
  // only, so foreman, crew, subcontractor and client all match ZERO rows, which
  // is not an error and was reported as success.
  //
  // ⚠️ ALL THREE WRITERS IN THIS FILE ARE GUARDED, DELIBERATELY. Guarding only
  // the one a finding named is the M1-01 shape exactly: a file that teaches both
  // patterns, where the next person copies whichever neighbour they happened to
  // read.
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}

export async function deleteSubcontractor(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  // BEFORE UPDATE trigger handles updated_by.
  const { data, error } = await supabase
    .from('subcontractors')
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id');

  if (error) return { success: false, error: error.message };
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}

/**
 * Put a soft-deleted sub or vendor back. [S158 · Finding 2]
 *
 * `restoreContact()`'s twin, for the second of the two tables S154 restored
 * soft delete to. One function covers subs AND vendors because a vendor is
 * `sub_type = 'vendor'` on this table — there is no separate vendor table to
 * build a third restore for.
 */
export async function restoreSubcontractor(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  // BEFORE UPDATE trigger handles updated_by.
  const { data, error } = await supabase
    .from('subcontractors')
    .update({ is_deleted: false, deleted_at: null })
    .eq('id', id)
    .select('id');

  if (error) return { success: false, error: error.message };
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}


// ---------------------------------------------------------------------------
// TECH_DEBT #132 [S122] — writing the Owner/Admin half.
// ---------------------------------------------------------------------------
// The three figures moved to `subcontractor_financials` (migration
// 20260903000000), whose INSERT/UPDATE are Owner/Admin. This is a separate
// call from the sub itself because it is a separate table with a separate
// policy — the same two-writes-two-policies shape as the team edit surface.
//
// ⚠️ A REFUSED WRITE AFFECTS ZERO ROWS RATHER THAN ERRORING, so this selects
// back and reports the refusal. Without that, a non-Owner/Admin who somehow
// reached this call would be told "saved".
//
// The write is an UPSERT on `subcontractor_id` because the row is created
// lazily: a sub that never had any of the three has no row at all.

export interface SubcontractorFinancialsInput {
  default_hourly_rate: number | null;
  default_markup_percent: number | null;
  ein: string | null;
}

export async function saveSubcontractorFinancials(
  subcontractorId: string,
  values: SubcontractorFinancialsInput
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  // All three null means there is nothing to record. Don't mint an empty row —
  // "no row" is the table's own representation of "nothing set", and an empty
  // row would make the lazy-creation contract untrue for every future reader.
  const allEmpty =
    values.default_hourly_rate === null &&
    values.default_markup_percent === null &&
    values.ein === null;

  const { data: existing } = await supabase
    .from('subcontractor_financials')
    .select('id')
    .eq('subcontractor_id', subcontractorId)
    .maybeSingle();

  if (allEmpty && !existing) return { success: true };

  const { data, error } = await supabase
    .from('subcontractor_financials')
    .upsert({ subcontractor_id: subcontractorId, ...values }, { onConflict: 'subcontractor_id' })
    .select('id');

  if (error) return { success: false, error: error.message };
  if ((data ?? []).length === 0) {
    return { success: false, error: 'Only an owner or admin can set sub rates, markup or EIN.' };
  }
  return { success: true };
}

// ── Picker options (4D bidding tab) ──

// ⚠️ `default_markup_percent` WAS FETCHED HERE AND NEVER USED [#132, S122].
// The picker renders `company_name` only — verified by grep before removing it:
// zero references to `.default_markup_percent` anywhere in the bidding tab.
// It was dead payload shipping the company's margin to every role that can
// open an estimate, which is exactly the leak #132 is about. Removed rather
// than retargeted: nothing needs it here.
export interface SubcontractorOption {
  id: string;
  company_name: string;
}

export async function listSubcontractorOptions(): Promise<SubcontractorOption[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('subcontractors')
    .select('id, company_name')
    .eq('is_deleted', false)
    .order('company_name', { ascending: true });

  if (error) return [];
  return data ?? [];
}
