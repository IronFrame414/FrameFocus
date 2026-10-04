import { createClient } from '@/lib/supabase-browser';
import type { Database } from '@framefocus/shared/types/database';
import { normalizeCostCode } from '@framefocus/shared/utils/cost-codes';
import { applied } from '@/lib/services/mutation-result';

// S128 Part H — DIVISION BUDGETING, the browser client's reads and writes.
// ⚠️ PART H IS REBUILD-TEST ONLY. NOT MERGED.
//
// Every read and write goes through RLS (20262138100000): Owner, Admin and the estimate's
// assigned Project Executive read; the same write while the estimate is a draft. Any other role
// gets ZERO rows — the money is not in its payload (H-14). Writes return rows only so a refused
// write can be told from an applied one (`applied`), never to trust what came back.
//
// H-2: every cost code goes through normalizeCostCode on the way in — text, zero-padded, refused
// if it is not a MasterFormat 1995 section code. Nothing here ever stores a code as a number.

type Tables = Database['public']['Tables'];
export type EstimateDivision = Tables['estimate_divisions']['Row'];
export type DivisionSection = Tables['estimate_division_sections']['Row'];
export type DivisionLine = Tables['estimate_division_lines']['Row'];
export type BottomLine = Omit<Tables['estimate_bottom_lines']['Row'], 'charge_mode' | 'kind'> & {
  charge_mode: 'amount' | 'base' | 'total';
  kind: 'flat' | 'percent' | 'contingency' | 'allowance' | 'bond';
};
export type CompanyCostCode = Pick<Tables['company_cost_codes']['Row'], 'code' | 'title' | 'division_code'>;
export type CompanyDivision = Pick<Tables['company_divisions']['Row'], 'code' | 'name' | 'sort_order'>;

type Result<T = undefined> = { success: true; data?: T } | { success: false; error: string };

const REFUSED = 'The change was not saved (you may not have permission, or the estimate is no longer a draft).';

export interface DivisionBudgetData {
  divisions: EstimateDivision[];
  sections: DivisionSection[];
  lines: DivisionLine[];
  bottom: BottomLine[];
  codes: CompanyCostCode[];
  companyDivisions: CompanyDivision[];
}

export async function loadDivisionBudget(estimateId: string): Promise<Result<DivisionBudgetData>> {
  const supabase = createClient();
  const [d, s, l, b, c, cd] = await Promise.all([
    supabase.from('estimate_divisions').select('*').eq('estimate_id', estimateId).eq('is_deleted', false).order('sort_order').order('code'),
    supabase.from('estimate_division_sections').select('*').eq('estimate_id', estimateId).eq('is_deleted', false).order('sort_order').order('created_at'),
    supabase.from('estimate_division_lines').select('*').eq('estimate_id', estimateId).eq('is_deleted', false).order('sort_order').order('created_at'),
    supabase.from('estimate_bottom_lines').select('*').eq('estimate_id', estimateId).eq('is_deleted', false).order('sort_order').order('created_at'),
    supabase.from('company_cost_codes').select('code, title, division_code').eq('is_deleted', false).order('code'),
    supabase.from('company_divisions').select('code, name, sort_order').eq('is_deleted', false).order('sort_order'),
  ]);
  const err = d.error ?? s.error ?? l.error ?? b.error ?? c.error ?? cd.error;
  if (err) return { success: false, error: err.message };
  return {
    success: true,
    data: {
      divisions: d.data ?? [],
      sections: s.data ?? [],
      lines: l.data ?? [],
      bottom: (b.data ?? []) as BottomLine[],
      codes: c.data ?? [],
      companyDivisions: cd.data ?? [],
    },
  };
}

/** H-12: seeds the company once, then SNAPSHOTS its divisions and bottom block into the estimate. */
export async function enableDivisionBudget(estimateId: string): Promise<Result> {
  const { error } = await createClient().rpc('enable_division_budget', { p_estimate_id: estimateId });
  return error ? { success: false, error: error.message } : { success: true };
}

/** Back to line items. The division snapshot is kept; turning divisions on again reuses it. */
export async function useLineItemBudget(estimateId: string): Promise<Result> {
  const { data, error } = await createClient()
    .from('estimates')
    .update({ budget_format: 'line_item' })
    .eq('id', estimateId)
    .select('id');
  if (error) return { success: false, error: error.message };
  return applied(data) ? { success: true } : { success: false, error: REFUSED };
}

/** Parse a cost code typed or pasted by a person. Blank = no code. */
export function parseCostCodeInput(raw: string | null): { ok: true; code: string | null } | { ok: false; error: string } {
  if (raw == null || raw.trim() === '') return { ok: true, code: null };
  const r = normalizeCostCode(raw);
  return r.ok ? { ok: true, code: r.code } : { ok: false, error: r.error };
}

async function insertOne(table: 'estimate_divisions' | 'estimate_division_sections' | 'estimate_division_lines' | 'estimate_bottom_lines', row: Record<string, unknown>): Promise<Result<string>> {
  const { data, error } = await createClient().from(table).insert(row as never).select('id');
  if (error) return { success: false, error: error.message };
  if (!applied(data)) return { success: false, error: REFUSED };
  return { success: true, data: (data as { id: string }[])[0].id };
}

async function updateOne(table: 'estimate_divisions' | 'estimate_division_sections' | 'estimate_division_lines' | 'estimate_bottom_lines', id: string, patch: Record<string, unknown>): Promise<Result> {
  const { data, error } = await createClient().from(table).update(patch as never).eq('id', id).select('id');
  if (error) return { success: false, error: error.message };
  return applied(data) ? { success: true } : { success: false, error: REFUSED };
}

async function deleteOne(table: 'estimate_divisions' | 'estimate_division_sections' | 'estimate_division_lines' | 'estimate_bottom_lines', id: string): Promise<Result> {
  const { data, error } = await createClient().from(table).delete().eq('id', id).select('id');
  if (error) return { success: false, error: error.message };
  return applied(data) ? { success: true } : { success: false, error: REFUSED };
}

export const addDivision = (estimateId: string, code: string, name: string, sortOrder: number) =>
  insertOne('estimate_divisions', { estimate_id: estimateId, code, name, sort_order: sortOrder });
export const updateDivision = (id: string, patch: Partial<Pick<EstimateDivision, 'name' | 'sort_order'>>) =>
  updateOne('estimate_divisions', id, patch);
export const removeDivision = (id: string) => deleteOne('estimate_divisions', id);

export const addSection = (estimateId: string, divisionId: string, name: string, sortOrder: number) =>
  insertOne('estimate_division_sections', { estimate_id: estimateId, division_id: divisionId, name, sort_order: sortOrder });
export const updateSection = (id: string, patch: Partial<Pick<DivisionSection, 'name' | 'cost_code' | 'sort_order'>>) =>
  updateOne('estimate_division_sections', id, patch);
export const removeSection = (id: string) => deleteOne('estimate_division_sections', id);

export type DivisionLinePatch = Partial<
  Pick<DivisionLine, 'name' | 'quantity' | 'cost' | 'description' | 'internal_notes' | 'cost_code' | 'out_to_bid' | 'alternate_kind' | 'sort_order'>
>;
export const addDivisionLine = (
  estimateId: string,
  divisionId: string,
  sectionId: string | null,
  fields: DivisionLinePatch & { name: string }
) => insertOne('estimate_division_lines', { estimate_id: estimateId, division_id: divisionId, section_id: sectionId, ...fields });
export const updateDivisionLine = (id: string, patch: DivisionLinePatch) => updateOne('estimate_division_lines', id, patch);
export const removeDivisionLine = (id: string) => deleteOne('estimate_division_lines', id);

export type BottomLinePatch = Partial<
  Pick<BottomLine, 'name' | 'kind' | 'charge_mode' | 'rate' | 'amount' | 'base_division_ids' | 'base_excluded_ids' | 'sort_order'>
>;
export const addBottomLine = (estimateId: string, fields: BottomLinePatch & { name: string }) =>
  insertOne('estimate_bottom_lines', { estimate_id: estimateId, kind: 'percent', charge_mode: 'base', ...fields });
export const updateBottomLine = (id: string, patch: BottomLinePatch) => updateOne('estimate_bottom_lines', id, patch);
export const removeBottomLine = (id: string) => deleteOne('estimate_bottom_lines', id);

/** H-8a: a drag writes the new order, one sort_order per line, in the order shown. */
export async function reorderBottomLines(idsInOrder: string[]): Promise<Result> {
  for (let i = 0; i < idsInOrder.length; i++) {
    const r = await updateBottomLine(idsInOrder[i], { sort_order: i });
    if (!r.success) return r;
  }
  return { success: true };
}
