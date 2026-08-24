import { createClient } from '@/lib/supabase-browser';
import type { Database } from '@framefocus/shared/types/database';
import { applied, DISCARDED } from '@/lib/services/mutation-result';
import type {
  Selection,
  SelectionArea,
  SelectionMode,
  SelectionOption,
  SelectionOptionSource,
  SelectionStatus,
} from '@/lib/services/selections';

export type { Selection, SelectionArea, SelectionMode, SelectionOption, SelectionOptionSource, SelectionStatus };

/** Signed URLs for a selection's option images, via the definer read (S172). */
export async function fetchSelectionOptionImages(
  selectionId: string
): Promise<Record<string, { image?: string; link_thumbnail?: string }>> {
  try {
    const res = await fetch(`/api/selections/${selectionId}/images`, { cache: 'no-store' });
    if (!res.ok) return {};
    return (await res.json()) as Record<string, { image?: string; link_thumbnail?: string }>;
  } catch {
    return {};
  }
}

// ============================================================================
// Allowances & Selections — CLIENT writes. [S171, stage 2]
//
// Plain table writes under the caller's session; RLS (20261026000000) is the
// rule. Every UPDATE-shaped write ends `.select('id')` and goes through
// `applied()` — mutation-result.ts is the reason. Lifecycle transitions (offer,
// sign, deny, revise) are NOT here: they stamp money and write signing
// sessions, and live in the stage-4 service behind a route.
// ============================================================================

type Tables = Database['public']['Tables'];
type Result = { success: boolean; error?: string };
type CreateResult = { success: boolean; id?: string; error?: string };

// ── Areas ───────────────────────────────────────────────────────────────────

export async function createSelectionArea(input: {
  project_id: string;
  name: string;
  sort_order?: number;
}): Promise<CreateResult> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('selection_areas')
    .insert({ project_id: input.project_id, name: input.name.trim(), sort_order: input.sort_order ?? 0 })
    .select('id')
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, id: data.id };
}

export async function renameSelectionArea(id: string, name: string): Promise<Result> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('selection_areas')
    .update({ name: name.trim() })
    .eq('id', id)
    .select('id');
  if (error) return { success: false, error: error.message };
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}

// ── Selections ──────────────────────────────────────────────────────────────

export interface CreateSelectionInput {
  project_id: string;
  name: string;
  area_id?: string | null;
  description?: string | null;
  due_date?: string | null;
  allowance_budget_item_id?: string | null;
  mode?: SelectionMode;
  allow_multiple?: boolean;
  show_differences?: boolean;
  client_supplied?: boolean;
}

export async function createSelection(input: CreateSelectionInput): Promise<CreateResult> {
  const supabase = createClient();
  const payload: Tables['selections']['Insert'] = {
    project_id: input.project_id,
    name: input.name.trim(),
    area_id: input.area_id ?? null,
    description: input.description ?? null,
    due_date: input.due_date ?? null,
    allowance_budget_item_id: input.allowance_budget_item_id ?? null,
    mode: input.mode ?? 'options',
    allow_multiple: input.allow_multiple ?? false,
    show_differences: input.show_differences ?? true,
    client_supplied: input.client_supplied ?? false,
  };
  const { data, error } = await supabase.from('selections').insert(payload).select('id').single();
  if (error) return { success: false, error: error.message };
  // A discussion-mode selection opens its thread on creation (§3.6).
  if ((input.mode ?? 'options') === 'discussion') {
    await supabase.from('selection_threads').insert({ selection_id: data.id });
  }
  return { success: true, id: data.id };
}

/** Editable fields while the selection is draft / in_discussion. Status and
 *  stamps are NOT here — the stage-4 service owns transitions. */
export type UpdateSelectionInput = Partial<
  Pick<
    CreateSelectionInput,
    'name' | 'area_id' | 'description' | 'due_date' | 'allowance_budget_item_id' | 'mode' | 'allow_multiple' | 'show_differences' | 'client_supplied'
  >
>;

export async function updateSelection(id: string, input: UpdateSelectionInput): Promise<Result> {
  const supabase = createClient();
  const updates: Tables['selections']['Update'] = { ...input };
  if (typeof updates.name === 'string') updates.name = updates.name.trim();
  // BEFORE UPDATE trigger `selections_set_updated_by` handles updated_by.
  // updated_at is handled by the existing updated_at trigger.
  const { data, error } = await supabase.from('selections').update(updates).eq('id', id).select('id');
  if (error) return { success: false, error: error.message };
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}

export async function softDeleteSelection(id: string): Promise<Result> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('selections')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id)
    .select('id');
  if (error) return { success: false, error: error.message };
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}

// ── Internal notes (floored: owner/admin/PM/foreman) ────────────────────────

export async function saveSelectionNotes(selectionId: string, internalNotes: string): Promise<Result> {
  const supabase = createClient();
  // UPSERT on the UNIQUE selection_id. An RLS refusal on either arm errors.
  const { data, error } = await supabase
    .from('selection_notes')
    .upsert({ selection_id: selectionId, internal_notes: internalNotes }, { onConflict: 'selection_id' })
    .select('id');
  if (error) return { success: false, error: error.message };
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}

// ── Options ─────────────────────────────────────────────────────────────────

export interface CreateOptionInput {
  selection_id: string;
  name: string;
  description?: string | null;
  spec_detail?: string | null;
  source?: SelectionOptionSource;
  catalog_item_id?: string | null;
  source_budget_item_id?: string | null;
  image_file_id?: string | null;
  link_url?: string | null;
  link_thumbnail_file_id?: string | null;
  sort_order?: number;
  /** Money — written to the FLOORED side table. Omit for a client-supplied
   *  selection; the caller owns that rule. */
  amounts?: { quantity: number; unit_cost: number; markup_percent: number | null } | null;
}

export async function createSelectionOption(input: CreateOptionInput): Promise<CreateResult> {
  const supabase = createClient();
  const source: SelectionOptionSource = input.source ?? 'scratch';
  const { data, error } = await supabase
    .from('selection_options')
    .insert({
      selection_id: input.selection_id,
      name: input.name.trim(),
      description: input.description ?? null,
      spec_detail: input.spec_detail ?? null,
      source,
      catalog_item_id: source === 'catalog' ? (input.catalog_item_id ?? null) : null,
      source_budget_item_id: source === 'budget' ? (input.source_budget_item_id ?? null) : null,
      image_file_id: input.image_file_id ?? null,
      link_url: input.link_url ?? null,
      link_thumbnail_file_id: input.link_thumbnail_file_id ?? null,
      sort_order: input.sort_order ?? 0,
    })
    .select('id')
    .single();
  if (error) return { success: false, error: error.message };
  if (input.amounts) {
    const { error: aErr } = await supabase.from('selection_option_amounts').insert({
      option_id: data.id,
      quantity: input.amounts.quantity,
      unit_cost: input.amounts.unit_cost,
      markup_percent: input.amounts.markup_percent,
    });
    // The option exists without its money — say so rather than pretend.
    if (aErr) return { success: false, id: data.id, error: `Option saved, but its price was refused: ${aErr.message}` };
  }
  return { success: true, id: data.id };
}

export async function updateSelectionOption(
  id: string,
  input: Partial<Pick<CreateOptionInput, 'name' | 'description' | 'spec_detail' | 'image_file_id' | 'link_url' | 'link_thumbnail_file_id' | 'sort_order'>>
): Promise<Result> {
  const supabase = createClient();
  const updates: Tables['selection_options']['Update'] = { ...input };
  if (typeof updates.name === 'string') updates.name = updates.name.trim();
  const { data, error } = await supabase.from('selection_options').update(updates).eq('id', id).select('id');
  if (error) return { success: false, error: error.message };
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}

export async function saveSelectionOptionAmounts(
  optionId: string,
  amounts: { quantity: number; unit_cost: number; markup_percent: number | null }
): Promise<Result> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('selection_option_amounts')
    .upsert({ option_id: optionId, ...amounts }, { onConflict: 'option_id' })
    .select('id');
  if (error) return { success: false, error: error.message };
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}

export async function deleteSelectionOption(id: string): Promise<Result> {
  const supabase = createClient();
  // Hard delete is policy-gated to draft / in_discussion selections; the
  // amounts row cascades. An empty result here means the policy refused.
  const { data, error } = await supabase.from('selection_options').delete().eq('id', id).select('id');
  if (error) return { success: false, error: error.message };
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}

// [S173, Josh] `setChosenOptions` is REMOVED, not moved: "chosen" is the
// CLIENT's act, made in the portal (stage 7's write path), and the company
// sheet no longer offers a way to make it. The company assembles and releases;
// the client picks and signs.

// ── Thread ──────────────────────────────────────────────────────────────────

export async function ensureSelectionThread(selectionId: string): Promise<CreateResult> {
  const supabase = createClient();
  const { data: existing } = await supabase
    .from('selection_threads')
    .select('id')
    .eq('selection_id', selectionId)
    .maybeSingle();
  if (existing) return { success: true, id: existing.id };
  const { data, error } = await supabase
    .from('selection_threads')
    .insert({ selection_id: selectionId })
    .select('id')
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, id: data.id };
}

/** One message with N photos is ONE unit (9-spec §7.2): body + link + photo ids. */
export async function postSelectionMessage(input: {
  thread_id: string;
  author_profile_id: string;
  body: string;
  link_url?: string | null;
  photo_file_ids?: string[];
}): Promise<CreateResult> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('selection_messages')
    .insert({
      thread_id: input.thread_id,
      author_profile_id: input.author_profile_id,
      body: input.body,
      link_url: input.link_url ?? null,
    })
    .select('id')
    .single();
  if (error) return { success: false, error: error.message };
  const photos = input.photo_file_ids ?? [];
  if (photos.length) {
    const { error: pErr } = await supabase
      .from('selection_message_photos')
      .insert(photos.map((file_id, i) => ({ message_id: data.id, file_id, sort_order: i })));
    if (pErr) return { success: false, id: data.id, error: `Message posted, but its photos were refused: ${pErr.message}` };
  }
  return { success: true, id: data.id };
}
