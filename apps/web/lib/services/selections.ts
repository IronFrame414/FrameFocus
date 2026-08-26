import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { SIGNED_URL_TTL_SECONDS } from '@/lib/services/signed-url-ttl';
import type { Database } from '@framefocus/shared/types/database';

// ============================================================================
// Allowances & Selections — SERVER reads. [S171, stage 2]
// Spec: docs/specs/allowances-selections-spec.md §3, §4, §5.
//
// Every function takes (or makes) a per-request client so RLS decides what the
// caller sees. There is deliberately NO service-role read here: the whole point
// of the two side-table floors (selection_option_amounts, selection_notes) is
// that a reader who may not see money gets NO ROW, and a service-role read
// would hand it to them. Functions that embed amounts return `null` for the
// money when RLS filtered it — the caller renders a dash, never a zero.
// ============================================================================

type Tables = Database['public']['Tables'];
export type SelectionAreaRow = Tables['selection_areas']['Row'];
export type SelectionOptionRow = Tables['selection_options']['Row'];
export type SelectionOptionAmountsRow = Tables['selection_option_amounts']['Row'];
export type SelectionAmountsRow = Tables['selection_amounts']['Row'];
export type SelectionNotesRow = Tables['selection_notes']['Row'];
export type SelectionSigningSessionRow = Tables['selection_signing_sessions']['Row'];
export type SelectionMessageRow = Tables['selection_messages']['Row'];

export type SelectionMode = 'options' | 'discussion';
export type SelectionStatus = 'draft' | 'in_discussion' | 'awaiting_approval' | 'approved' | 'denied';
export type SelectionOptionSource = 'scratch' | 'catalog' | 'budget';

/** `selections` with its CHECK'd columns re-narrowed (CLAUDE.md Generated Types). */
export type SelectionRow = Omit<Tables['selections']['Row'], 'mode' | 'status'> & {
  mode: SelectionMode;
  status: SelectionStatus;
};

export interface SelectionOption extends Omit<SelectionOptionRow, 'source'> {
  source: SelectionOptionSource;
  /** NULL when RLS hid the side table from this caller — NOT zero. */
  amounts: Pick<SelectionOptionAmountsRow, 'quantity' | 'unit_cost' | 'markup_percent'> | null;
}

export interface Selection extends SelectionRow {
  area: Pick<SelectionAreaRow, 'id' | 'name' | 'sort_order'> | null;
  options: SelectionOption[];
  /**
   * [S174 #2] The markup an option with a NULL `markup_percent` inherits —
   * SNAPSHOTTED when the allowance was set (20261030000000), never re-derived
   * on read. NULL when RLS hid `selection_amounts` from this caller (foreman,
   * crew, sub, client) — NOT zero. Such a reader also gets no
   * `option.amounts`, so nothing is priced for them anyway.
   */
  inherited_markup_percent: number | null;
  /** NULL when RLS hid selection_notes from this caller (sub, crew, client). */
  notes: string | null;
  /** The linked allowance budget line, if any. Budgeted cost is on
   *  project_budget_amounts (Owner/Admin) and is NOT fetched here. */
  allowance: { id: string; description: string; row_type: string | null } | null;
}

export interface SelectionArea {
  id: string;
  name: string;
  sort_order: number;
  selections: Selection[];
}

const SELECTION_COLUMNS =
  'id, company_id, created_at, updated_at, created_by, updated_by, is_deleted, deleted_at, ' +
  'project_id, area_id, name, description, due_date, allowance_budget_item_id, mode, ' +
  'allow_multiple, show_differences, client_supplied, status, ' +
  'offered_sell_amount, offered_allowance_deduction, offered_variance, offered_at, ' +
  'signed_sell_amount, signed_allowance_deduction, signed_variance, signed_at, signed_session_id';

/**
 * Every live selection on a project, grouped by area, with options and (for
 * readers the floors admit) amounts and notes. Areas are returned in
 * sort_order then name; an area with no selections still appears so the sheet
 * can offer it in the dropdown.
 */
export async function getProjectSelections(
  projectId: string,
  supabase?: SupabaseClient<Database>
): Promise<SelectionArea[]> {
  const db = supabase ?? (await createClient());

  const [{ data: areas }, { data: selections }] = await Promise.all([
    db
      .from('selection_areas')
      .select('id, name, sort_order')
      .eq('project_id', projectId)
      .eq('is_deleted', false)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    db
      .from('selections')
      .select(SELECTION_COLUMNS)
      .eq('project_id', projectId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true }),
  ]);

  const rows = (selections ?? []) as unknown as SelectionRow[];
  const ids = rows.map((s) => s.id);
  const allowanceIds = rows
    .map((s) => s.allowance_budget_item_id)
    .filter((v): v is string => typeof v === 'string');

  const [{ data: options }, { data: amounts }, { data: notes }, { data: allowances }, { data: selAmounts }] =
    await Promise.all([
      ids.length
        ? db
            .from('selection_options')
            .select('*')
            .in('selection_id', ids)
            .eq('is_deleted', false)
            .order('sort_order', { ascending: true })
        : Promise.resolve({ data: [] as SelectionOptionRow[] }),
      // Floored: a reader outside owner/admin/PM gets [] here — by policy, not
      // by this code. Read it as "not permitted", never "$0".
      ids.length
        ? db.from('selection_option_amounts').select('option_id, quantity, unit_cost, markup_percent')
        : Promise.resolve({ data: [] as Pick<SelectionOptionAmountsRow, 'option_id' | 'quantity' | 'unit_cost' | 'markup_percent'>[] }),
      ids.length
        ? db.from('selection_notes').select('selection_id, internal_notes').in('selection_id', ids)
        : Promise.resolve({ data: [] as Pick<SelectionNotesRow, 'selection_id' | 'internal_notes'>[] }),
      allowanceIds.length
        ? db.from('project_budget_items').select('id, description, row_type').in('id', allowanceIds)
        : Promise.resolve({ data: [] as { id: string; description: string; row_type: string | null }[] }),
      // Floored owner/admin/PM, exactly as selection_option_amounts above: a
      // reader outside the floor gets [] here BY POLICY. Read it as "not
      // permitted", never as "no markup".
      ids.length
        ? db.from('selection_amounts').select('selection_id, inherited_markup_percent').in('selection_id', ids)
        : Promise.resolve({ data: [] as Pick<SelectionAmountsRow, 'selection_id' | 'inherited_markup_percent'>[] }),
    ]);

  const amountsByOption = new Map((amounts ?? []).map((a) => [a.option_id, a]));
  const notesBySelection = new Map((notes ?? []).map((n) => [n.selection_id, n.internal_notes]));
  const allowanceById = new Map((allowances ?? []).map((a) => [a.id, a]));
  const markupBySelection = new Map(
    (selAmounts ?? []).map((a) => [a.selection_id, a.inherited_markup_percent])
  );
  const areaById = new Map((areas ?? []).map((a) => [a.id, a]));

  const optionsBySelection = new Map<string, SelectionOption[]>();
  for (const o of (options ?? []) as SelectionOptionRow[]) {
    const a = amountsByOption.get(o.id);
    const list = optionsBySelection.get(o.selection_id) ?? [];
    list.push({
      ...(o as Omit<SelectionOptionRow, 'source'>),
      source: o.source as SelectionOptionSource,
      amounts: a ? { quantity: a.quantity, unit_cost: a.unit_cost, markup_percent: a.markup_percent } : null,
    });
    optionsBySelection.set(o.selection_id, list);
  }

  const enriched: Selection[] = rows.map((s) => ({
    ...s,
    area: s.area_id ? (areaById.get(s.area_id) ?? null) : null,
    options: optionsBySelection.get(s.id) ?? [],
    notes: notesBySelection.get(s.id) ?? null,
    inherited_markup_percent: markupBySelection.get(s.id) ?? null,
    allowance: s.allowance_budget_item_id
      ? (allowanceById.get(s.allowance_budget_item_id) ?? null)
      : null,
  }));

  const grouped = new Map<string, SelectionArea>();
  for (const a of areas ?? []) grouped.set(a.id, { ...a, selections: [] });
  const UNASSIGNED = '__unassigned__';
  for (const s of enriched) {
    const key = s.area_id && grouped.has(s.area_id) ? s.area_id : UNASSIGNED;
    if (!grouped.has(key)) {
      grouped.set(key, { id: UNASSIGNED, name: 'Unassigned', sort_order: Number.MAX_SAFE_INTEGER, selections: [] });
    }
    grouped.get(key)!.selections.push(s);
  }
  return [...grouped.values()].sort(
    (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
  );
}

/** One selection, fully loaded. Returns null when unreadable (RLS) or deleted. */
export async function getSelection(
  selectionId: string,
  supabase?: SupabaseClient<Database>
): Promise<Selection | null> {
  const db = supabase ?? (await createClient());
  const { data } = await db.from('selections').select('project_id').eq('id', selectionId).maybeSingle();
  if (!data) return null;
  const areas = await getProjectSelections(data.project_id, db);
  for (const a of areas) {
    const hit = a.selections.find((s) => s.id === selectionId);
    if (hit) return hit;
  }
  return null;
}

/**
 * The allowance dropdown's source (§9.1): the project's `row_type = 'allowance'`
 * budget lines, by description. Budget lines are insert-only and never
 * soft-deleted in practice, but the filter is kept for the trash-bin rule.
 * Readable by every role that can view the project (project_budget_items has
 * no role floor — CLAUDE.md, deliberately); the AMOUNT is not read here.
 */
export async function getAllowanceBudgetLines(
  projectId: string,
  supabase?: SupabaseClient<Database>
): Promise<{ id: string; description: string; source_change_order_id: string | null }[]> {
  const db = supabase ?? (await createClient());
  const { data } = await db
    .from('project_budget_items')
    .select('id, description, source_change_order_id')
    .eq('project_id', projectId)
    .eq('row_type', 'allowance')
    .eq('is_deleted', false)
    .order('description', { ascending: true });
  return data ?? [];
}

/** The selection's thread (one per selection), with messages and photo ids. */
export async function getSelectionThread(
  selectionId: string,
  supabase?: SupabaseClient<Database>
): Promise<{
  threadId: string | null;
  messages: (SelectionMessageRow & { photo_file_ids: string[]; author_name: string })[];
}> {
  const db = supabase ?? (await createClient());
  const { data: thread } = await db
    .from('selection_threads')
    .select('id')
    .eq('selection_id', selectionId)
    .maybeSingle();
  if (!thread) return { threadId: null, messages: [] };

  const { data: messages } = await db
    .from('selection_messages')
    .select('*')
    .eq('thread_id', thread.id)
    .order('created_at', { ascending: true });
  const msgs = messages ?? [];
  const msgIds = msgs.map((m) => m.id);
  const authorIds = [...new Set(msgs.map((m) => m.author_profile_id))];

  const [{ data: photos }, { data: authors }] = await Promise.all([
    msgIds.length
      ? db.from('selection_message_photos').select('message_id, file_id, sort_order').in('message_id', msgIds).order('sort_order')
      : Promise.resolve({ data: [] as { message_id: string; file_id: string; sort_order: number }[] }),
    authorIds.length
      ? db.from('profiles').select('id, first_name, last_name').in('id', authorIds)
      : Promise.resolve({ data: [] as { id: string; first_name: string | null; last_name: string | null }[] }),
  ]);
  const photosByMsg = new Map<string, string[]>();
  for (const p of photos ?? []) {
    const l = photosByMsg.get(p.message_id) ?? [];
    l.push(p.file_id);
    photosByMsg.set(p.message_id, l);
  }
  // Own row is always readable; other authors may be floored (Roster Floor) —
  // a name the reader may not see renders as the role-neutral fallback.
  const nameById = new Map(
    (authors ?? []).map((a) => [a.id, [a.first_name, a.last_name].filter(Boolean).join(' ') || 'Team member'])
  );
  return {
    threadId: thread.id,
    messages: msgs.map((m) => ({
      ...m,
      photo_file_ids: photosByMsg.get(m.id) ?? [],
      author_name: nameById.get(m.author_profile_id) ?? 'Team member',
    })),
  };
}

/** Signing sessions for a selection, newest first (owner/admin/PM; client: own). */
export async function getSelectionSigningSessions(
  selectionId: string,
  supabase?: SupabaseClient<Database>
): Promise<SelectionSigningSessionRow[]> {
  const db = supabase ?? (await createClient());
  const { data } = await db
    .from('selection_signing_sessions')
    .select('*')
    .eq('selection_id', selectionId)
    .order('created_at', { ascending: false });
  return data ?? [];
}

/**
 * Signed URLs for a selection's option images — the SECURITY DEFINER read
 * [S172, Josh]. `selection_option_images()` returns paths ONLY if the CALLER
 * can see the selection (it restates the staff and client arms inside the
 * function, because RLS does not run in a definer). The storage signing is
 * then done with the ADMIN client, because storage RLS keys on
 * files.client_visible and that flag is deliberately NOT involved here: "if
 * you can see the selection, you can see its option images." The general
 * client_visible mechanism stays exactly as it is for documents and photos.
 */
export async function signSelectionOptionImages(
  selectionId: string,
  supabase?: SupabaseClient<Database>
): Promise<Record<string, { image?: string; link_thumbnail?: string }>> {
  const db = supabase ?? (await createClient());
  const { data, error } = await db.rpc('selection_option_images', { p_selection_id: selectionId });
  if (error || !data?.length) return {};
  const admin = getSupabaseAdmin() as SupabaseClient<Database>;
  const out: Record<string, { image?: string; link_thumbnail?: string }> = {};
  await Promise.all(
    (data as { option_id: string; kind: string; file_path: string }[]).map(async (row) => {
      const { data: signed } = await admin.storage
        .from('project-files')
        .createSignedUrl(row.file_path, SIGNED_URL_TTL_SECONDS);
      if (!signed?.signedUrl) return;
      const slot = (out[row.option_id] ??= {});
      if (row.kind === 'image') slot.image = signed.signedUrl;
      else slot.link_thumbnail = signed.signedUrl;
    })
  );
  return out;
}

// ============================================================================
// STAGE 7 — THE CLIENT'S VIEW OF A PROJECT'S SELECTIONS. [S175 item 5]
// Spec §9.3. Rulings Q5.1 (the sell read) and Q5.3 (read-only after signing).
// ============================================================================
//
// ⚠️ THIS IS THE SAME READER, NARROWED — NOT A SECOND ONE. It calls
// `getProjectSelections()` above, exactly as `spec-sheet-data.ts` does, for the
// reason that file states: a second "does the same thing" query over the same
// tables is the #129 divergence written as agreement. Four of that function's
// queries come back EMPTY for a client (`selection_option_amounts`,
// `selection_notes`, `selection_amounts`, `project_budget_items` are all floored
// away from her), and that is the floor working rather than waste to optimise
// out — a narrower hand-written query would be a second place for the draft
// filter and the area grouping to drift.
//
// ⚠️ AND THE DRAFT FILTER IS RLS'S, NOT THIS FILE'S. `selections_select_client`
// carries `status <> 'draft'`, so a draft never reaches her through PostgREST
// either. Nothing here re-states it: a TypeScript copy of a policy is the copy
// an attacker does not run.
//
// WHERE THE FIGURES COME FROM, AND WHY NONE OF THEM IS COMPUTED HERE:
//   * per-option SELL — `selection_client_option_sell()` (20261037000000). She
//     cannot read `selection_option_amounts`, by design.
//   * the ALLOWANCE DEDUCTION — `selection_client_allowance_deduction()`. She
//     cannot read `project_budget_amounts` either.
//   * option IMAGES — `selection_option_images()`, the S172 definer read, NOT
//     `files.client_visible`. A PM-uploaded option image is not client-visible
//     and the flag would be one more thing to forget.
//   * the APPROVAL DATE — `selections.signed_at`, falling back to her completed
//     signing session. See `approvedAt` below; this is item 4's finding, and
//     re-introducing the bug one surface over is exactly what the fallback is
//     here to prevent.

/** One option as the client sees it: what it is, and what it costs HER. */
export interface PortalSelectionOption {
  id: string;
  name: string;
  description: string | null;
  spec_detail: string | null;
  link_url: string | null;
  is_chosen: boolean;
  sort_order: number;
  /**
   * The SNAPSHOT sell (S174), through the definer read. NULL means there is no
   * price to show — a client-supplied selection, or an option the company has
   * not priced — and renders as nothing, never as $0.
   */
  sell: number | null;
  imageUrl: string | null;
  linkThumbnailUrl: string | null;
}

export interface PortalSelection {
  id: string;
  name: string;
  description: string | null;
  status: SelectionStatus;
  mode: SelectionMode;
  allowMultiple: boolean;
  clientSupplied: boolean;
  dueDate: string | null;
  options: PortalSelectionOption[];
  /**
   * The allowance this selection draws on, at SELL. 0 when unlinked (Q8:
   * variance is the full sell).
   *
   * ⚠️ NULL ON A CLIENT-SUPPLIED SELECTION, AND THE DEDUCTION IS NOT FETCHED
   * FOR ONE. Spec §5.4: client-supplied selections are *"EXCLUDED from the
   * join — joining at zero would show a phantom full underage"*. A client who
   * bought her own tile must not be shown a screen implying she saved the whole
   * allowance.
   */
  allowanceDeduction: number | null;
  /** Stamped at the signature and read-only afterwards (Q5.3). */
  signed: { sellAmount: number; allowanceDeduction: number; variance: number } | null;
  /**
   * When she approved it.
   *
   * ⚠️ NOT ALWAYS `selections.signed_at` — item 4's finding, and it belongs
   * here too. A client-supplied selection is signed like any other, but the
   * CHECK nulls ALL FOUR `signed_*` columns on it, `signed_at` included. The
   * fallback is the completed, un-superseded signing session — which she can
   * read, because `selection_signing_sessions_select_own` admits the sessions
   * she signed.
   */
  approvedAt: string | null;
}

export interface PortalSelectionArea {
  id: string;
  name: string;
  sort_order: number;
  selections: PortalSelection[];
}

/**
 * Every selection on the project that this CLIENT may see, grouped by area,
 * with the sell figures and images she is entitled to and nothing else.
 *
 * Called with her own session, so a caller who is not the project's client gets
 * an empty result from the policies rather than a branch in this file.
 */
export async function getPortalProjectSelections(
  projectId: string,
  supabase?: SupabaseClient<Database>
): Promise<PortalSelectionArea[]> {
  const db = supabase ?? (await createClient());
  const areas = await getProjectSelections(projectId, db);
  const flat = areas.flatMap((a) => a.selections);
  if (!flat.length) return [];

  // The approval-date fallback, batched. `superseded_at IS NULL` is the partial
  // unique index's own predicate (§3.7) — at most one current signature — so
  // this is deterministic without an ORDER BY and needs none.
  const needSession = flat.filter((s) => s.status === 'approved' && !s.signed_at).map((s) => s.id);
  const sessionSignedAt = new Map<string, string>();
  if (needSession.length) {
    const { data: sessions } = await db
      .from('selection_signing_sessions')
      .select('selection_id, signed_at')
      .in('selection_id', needSession)
      .eq('status', 'completed')
      .is('superseded_at', null);
    for (const row of sessions ?? []) {
      if (row.signed_at) sessionSignedAt.set(row.selection_id, row.signed_at);
    }
  }

  const perSelection = await Promise.all(
    flat.map(async (s) => {
      const [sell, images, deduction] = await Promise.all([
        db.rpc('selection_client_option_sell', { p_selection_id: s.id }),
        signSelectionOptionImages(s.id, db),
        // Not fetched at all for a client-supplied selection — see
        // `allowanceDeduction` above.
        s.client_supplied
          ? Promise.resolve({ data: null })
          : db.rpc('selection_client_allowance_deduction', { p_selection_id: s.id }),
      ]);
      const sellByOption = new Map<string, number>(
        ((sell.data ?? []) as { option_id: string; sell: number | string }[]).map((r) => [
          r.option_id,
          Number(r.sell),
        ])
      );
      return { id: s.id, sellByOption, images, deduction: deduction.data };
    })
  );
  const bySelection = new Map(perSelection.map((p) => [p.id, p]));

  return areas
    .map((area) => ({
      id: area.id,
      name: area.name,
      sort_order: area.sort_order,
      selections: area.selections.map((s): PortalSelection => {
        const extra = bySelection.get(s.id);
        return {
          id: s.id,
          name: s.name,
          description: s.description,
          status: s.status,
          mode: s.mode,
          allowMultiple: s.allow_multiple,
          clientSupplied: s.client_supplied,
          dueDate: s.due_date,
          options: s.options.map((o) => ({
            id: o.id,
            name: o.name,
            description: o.description,
            spec_detail: o.spec_detail,
            link_url: o.link_url,
            is_chosen: o.is_chosen,
            sort_order: o.sort_order,
            sell: extra?.sellByOption.get(o.id) ?? null,
            imageUrl: extra?.images[o.id]?.image ?? null,
            linkThumbnailUrl: extra?.images[o.id]?.link_thumbnail ?? null,
          })),
          allowanceDeduction:
            s.client_supplied || extra?.deduction === null || extra?.deduction === undefined
              ? null
              : Number(extra.deduction),
          signed:
            s.signed_sell_amount === null || s.signed_variance === null
              ? null
              : {
                  sellAmount: Number(s.signed_sell_amount),
                  allowanceDeduction: Number(s.signed_allowance_deduction ?? 0),
                  variance: Number(s.signed_variance),
                },
          approvedAt: s.signed_at ?? sessionSignedAt.get(s.id) ?? null,
        };
      }),
    }))
    .filter((a) => a.selections.length > 0);
}
