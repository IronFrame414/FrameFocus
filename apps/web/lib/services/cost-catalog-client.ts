import { createClient } from '@/lib/supabase-browser';
import type { Database } from '@framefocus/shared/types/database';

// CHECK-constrained columns come back as loose `string` from the type
// generator; re-narrow them to the literal unions per CLAUDE.md.
export type CatalogCategory =
  | 'lumber'
  | 'fasteners'
  | 'electrical'
  | 'plumbing'
  | 'finishes'
  | 'concrete'
  | 'drywall'
  | 'roofing'
  | 'paint'
  | 'hardware'
  | 'insulation'
  | 'other';

export type CatalogUnitOfMeasure =
  | 'each'
  | 'sq_ft'
  | 'linear_ft'
  | 'box'
  | 'bundle'
  | 'bag'
  | 'gallon'
  | 'pair'
  | 'set'
  | 'other';

type CostCatalogRow = Database['public']['Tables']['cost_catalog']['Row'];
type CostCatalogInsert = Database['public']['Tables']['cost_catalog']['Insert'];

// PO module §4.1 — the sheet's left-rail source types. 'equipment' is a
// CATALOG notion only: the estimate row_type enum is not extended, and an
// equipment item lands as an 'other' row (the mapping lives in
// catalogRowTypeFor below — one place).
export type CatalogItemType = 'material' | 'labor' | 'subcontractor' | 'equipment' | 'other';

export type CostCatalogItem = Omit<CostCatalogRow, 'category' | 'unit_of_measure' | 'item_type'> & {
  category: CatalogCategory;
  unit_of_measure: CatalogUnitOfMeasure;
  item_type: CatalogItemType;
};

export type CreateCatalogItemInput = Omit<
  Pick<
    CostCatalogInsert,
    | 'name'
    | 'category'
    | 'unit_of_measure'
    | 'unit_cost'
    | 'default_vendor_id'
    | 'product_url'
    | 'last_verified_at'
    | 'notes'
    | 'cost_code'
    | 'is_favorite'
  >,
  'category' | 'unit_of_measure'
> & {
  category: CatalogCategory;
  unit_of_measure: CatalogUnitOfMeasure;
  item_type?: CatalogItemType; // defaults 'material' at the DB
};

/** The item_type → estimate row_type mapping (spec §4.1). ONE place. */
export function catalogRowTypeFor(
  itemType: CatalogItemType
): 'material' | 'labor' | 'subcontractor' | 'other' {
  switch (itemType) {
    case 'material':
      return 'material';
    case 'labor':
      return 'labor';
    case 'subcontractor':
      return 'subcontractor';
    case 'equipment':
    case 'other':
      return 'other';
  }
}

/** Company-wide favorite star (R-Q6). Writes ride the catalog UPDATE policy
 *  (Owner/Admin/PM — the same set that reaches the sheet). */
export async function setCatalogFavorite(
  id: string,
  isFavorite: boolean
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('cost_catalog')
    .update({ is_favorite: isFavorite })
    .eq('id', id)
    .select('id');
  if (error) return { success: false, error: error.message };
  if (!data?.length) return { success: false, error: 'Favorite was not applied.' };
  return { success: true };
}

export type UpdateCatalogItemInput = Partial<CreateCatalogItemInput>;

export interface ListCatalogFilters {
  category?: CatalogCategory;
  search?: string;
}

export async function listCatalog(filters?: ListCatalogFilters): Promise<CostCatalogItem[]> {
  const supabase = createClient();

  let query = supabase
    .from('cost_catalog')
    .select('*')
    .eq('is_deleted', false)
    .order('category', { ascending: true })
    .order('name', { ascending: true });

  if (filters?.category) {
    query = query.eq('category', filters.category);
  }
  if (filters?.search) {
    // B1: simple ILIKE on name for v1; revisit pg_trgm only if proven slow.
    query = query.ilike('name', `%${filters.search}%`);
  }

  const { data, error } = await query;
  if (error) return [];
  return (data ?? []) as CostCatalogItem[];
}

export async function getCatalogItem(id: string): Promise<CostCatalogItem | null> {
  const supabase = createClient();

  // No is_deleted filter: single-row fetch must return soft-deleted rows
  // so a restore flow can read them by id (CLAUDE.md trash-bin pattern).
  const { data } = await supabase.from('cost_catalog').select('*').eq('id', id).single();

  return (data as CostCatalogItem | null) ?? null;
}

export async function createCatalogItem(
  input: CreateCatalogItemInput
): Promise<{ success: boolean; id?: string; error?: string }> {
  const supabase = createClient();

  // Postgres defaults fill in company_id, created_by, updated_by, created_at, updated_at.
  const { data, error } = await supabase
    .from('cost_catalog')
    .insert(input)
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, id: data.id };
}

export async function updateCatalogItem(
  id: string,
  input: UpdateCatalogItemInput
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  // BEFORE UPDATE trigger `cost_catalog_set_updated_by` handles updated_by.
  // updated_at is handled by the existing updated_at trigger.
  const { error } = await supabase.from('cost_catalog').update(input).eq('id', id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function softDeleteCatalogItem(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  // BEFORE UPDATE trigger handles updated_by.
  const { error } = await supabase
    .from('cost_catalog')
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}
