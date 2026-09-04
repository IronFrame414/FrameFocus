'use client';

// Estimates redesign — service #6: scope-library CRUD.
// Spec: docs/specs/estimates-redesign-spec.md §2 16b; Q8.
//
// The saved scope sections (16b). ⚠️ The library holds TEMPLATES; 16b's *Insert*
// COPIES a row's {title, bullets, kind} into estimates.scope_sections (a
// separate updateEstimate write, in the Scope tab UI) — it never links the
// inserted copy back to the library row, so editing the estimate's copy leaves
// the library entry unchanged. Rows (this table), not JSONB on the estimate, is
// what makes that structural (Q8).
//
// Trash-bin pattern (CLAUDE.md): list() filters is_deleted=false; delete is a
// soft delete. RLS floors writes to Owner/Admin/PM (migration 20261160000000).

import { createClient } from '@/lib/supabase-browser';
import type { Database } from '@framefocus/shared/types/database';

export type ScopeSectionKind = 'included' | 'excluded';

// select('*') on a CHECK-constrained column → re-narrow section_kind from the
// generator's loose `string` (CLAUDE.md generated-types rule).
export type ScopeLibraryItem = Omit<
  Database['public']['Tables']['scope_library']['Row'],
  'section_kind'
> & { section_kind: ScopeSectionKind };

export interface ScopeLibraryInput {
  title: string;
  bullets: string[];
  section_kind?: ScopeSectionKind;
  sort_order?: number;
}

type Result = { success: boolean; error?: string };
type CreateResult = Result & { id?: string };

/** Active library entries, ordered as authored. */
export async function listScopeLibrary(): Promise<ScopeLibraryItem[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('scope_library')
    .select('*')
    .eq('is_deleted', false)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true }); // deterministic tiebreak (CLAUDE.md .limit/order rule)
  return (data ?? []) as ScopeLibraryItem[];
}

export async function createScopeSection(input: ScopeLibraryInput): Promise<CreateResult> {
  const supabase = createClient();
  // company_id/created_by/updated_by are DB defaults (migration 20261160000000).
  const { data, error } = await supabase
    .from('scope_library')
    .insert({
      title: input.title,
      bullets: input.bullets,
      section_kind: input.section_kind ?? 'included',
      sort_order: input.sort_order ?? 0,
    })
    .select('id')
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, id: data.id };
}

export async function updateScopeSection(
  id: string,
  patch: Partial<ScopeLibraryInput>
): Promise<Result> {
  const supabase = createClient();
  // BEFORE UPDATE triggers handle updated_at/updated_by (migration 20261160000000).
  const { error } = await supabase.from('scope_library').update(patch).eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Soft delete (trash-bin) — never a hard delete. */
export async function deleteScopeSection(id: string): Promise<Result> {
  const supabase = createClient();
  const { error } = await supabase
    .from('scope_library')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
