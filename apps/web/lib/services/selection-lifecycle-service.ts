import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { notify } from '@/lib/notify/notify';
import { getManagerNotifyRecipients } from '@/lib/notify/recipients';
import { applied } from '@/lib/services/mutation-result';

// ============================================================================
// Allowances & Selections — the LIFECYCLE. [S171, stage 4]
// Spec §5.3, §6; rulings Q4, Q7, Q8, Q9; analysis 2b.3, 2b.5.
//
//   draft / in_discussion ──offer──▶ awaiting_approval ──sign──▶ approved
//        ▲                               │                          │
//        └──────── deny / withdraw ──────┘           revise ────────┘ (→ in_discussion)
//
// THE SELECTION SIGNATURE IS THE BINDING INSTRUMENT (Q4). No change order is
// generated. S150's R21 said otherwise and is SUPERSEDED — the spec §1.2 says
// so and this file is where it is true in code.
//
// ONE WRITE PATH, ONE CALLER CONTEXT. `completeSelectionSignature` mirrors
// `completeCoSignature`: it takes the M9 caller-context parameter and there is
// no token-link arm because a selection is portal-only. A second
// implementation that "does the same thing" is the #129 divergence.
//
// SELL IS STAMPED, NOT DERIVED, AT TWO MOMENTS (analysis 2b.3): `offered_*` when
// the company sends it, `signed_*` (= offered) when the client signs. The client
// reads stamps, never a cost basis; and a cost edit after signing cannot move
// contract value (stage 5 sums signed_variance) without a new signature.
//
// WHAT THIS FILE DOES NOT DO: touch project_budget_items, change any 7B/7D/7H
// derivation, or create a CO. Stage 5 owns the money downstream.
// ============================================================================

type Db = SupabaseClient<Database>;
export type SelectionSignatureCaller = { kind: 'portal_session'; profileId: string };

export interface OfferedFigures {
  sellAmount: number;
  allowanceDeduction: number;
  variance: number;
  /** Per-option breakdown the client will see (names + sell only — no cost). */
  lines: { optionId: string; name: string; sell: number }[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The binding wording — Josh's requirement. Two variants: money, and the
 * client-supplied no-money variant (a "stated costs" clause over no stated
 * costs would be false). Stored verbatim in `consent_text` and in the snapshot.
 */
export function selectionConsentTextFor(input: {
  clientSupplied: boolean;
  sellAmount?: number | null;
  allowanceDeduction?: number | null;
  variance?: number | null;
}): string {
  if (input.clientSupplied) {
    return 'By signing, I confirm this selection. I am supplying this item myself; no charge applies. This signature is binding. I gave this signature while signed in to my client portal account.';
  }
  const f = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  const sell = input.sellAmount ?? 0;
  const ded = input.allowanceDeduction ?? 0;
  const v = input.variance ?? 0;
  const net = v >= 0 ? `an added price of ${f(v)}` : `a credit of ${f(Math.abs(v))}`;
  return `By signing, I confirm my selection and accept the stated price of ${f(sell)}, less my allowance of ${f(ded)}, for ${net}. This signature is binding and accepts the stated costs. I gave this signature while signed in to my client portal account.`;
}

// ── Pricing (§5.2, §5.3) ───────────────────────────────────────────────────

/** Markup chain for the ALLOWANCE's sell (Q3 as ruled): row markup → the
 *  instrument's material markup → company default material markup. Read
 *  service-role; the caller has already been gated by an RLS write. */
async function allowanceSellFor(admin: Db, budgetItemId: string): Promise<number> {
  const { data: item } = await admin
    .from('project_budget_items')
    .select('id, source_line_row_id, source_change_order_id, company_id')
    .eq('id', budgetItemId)
    .maybeSingle();
  if (!item) return 0;
  const { data: amt } = await admin
    .from('project_budget_amounts')
    .select('budgeted_amount')
    .eq('budget_item_id', budgetItemId)
    .maybeSingle();
  const cost = Number(amt?.budgeted_amount ?? 0);

  let markup: number | null = null;
  if (item.source_line_row_id) {
    if (item.source_change_order_id) {
      const { data: row } = await admin
        .from('change_order_line_rows')
        .select('markup_percent, line_item_id')
        .eq('id', item.source_line_row_id)
        .maybeSingle();
      markup = row?.markup_percent == null ? null : Number(row.markup_percent);
      if (markup == null) {
        const { data: co } = await admin
          .from('change_orders')
          .select('material_markup_percent')
          .eq('id', item.source_change_order_id)
          .maybeSingle();
        markup = co?.material_markup_percent == null ? null : Number(co.material_markup_percent);
      }
    } else {
      const { data: row } = await admin
        .from('estimate_line_rows')
        .select('markup_percent, line_item_id')
        .eq('id', item.source_line_row_id)
        .maybeSingle();
      markup = row?.markup_percent == null ? null : Number(row.markup_percent);
      if (markup == null && row?.line_item_id) {
        const { data: li } = await admin
          .from('estimate_line_items')
          .select('estimate_id')
          .eq('id', row.line_item_id)
          .maybeSingle();
        if (li?.estimate_id) {
          const { data: est } = await admin
            .from('estimates')
            .select('material_markup_percent')
            .eq('id', li.estimate_id)
            .maybeSingle();
          markup = est?.material_markup_percent == null ? null : Number(est.material_markup_percent);
        }
      }
    }
  }
  if (markup == null) {
    const { data: co } = await admin
      .from('companies')
      .select('default_material_markup_percent')
      .eq('id', item.company_id)
      .maybeSingle();
    markup = co?.default_material_markup_percent == null ? 0 : Number(co.default_material_markup_percent);
  }
  return r2(cost * (1 + markup / 100));
}

/** Sum-then-compare (Q7): Σ chosen options' sell − allowance sell (or − 0, Q8). */
export async function computeOfferedFigures(admin: Db, selectionId: string): Promise<OfferedFigures | { error: string }> {
  const { data: sel } = await admin
    .from('selections')
    .select('id, client_supplied, allowance_budget_item_id, mode')
    .eq('id', selectionId)
    .maybeSingle();
  if (!sel) return { error: 'Selection not found.' };
  if (sel.client_supplied) return { error: 'A client-supplied selection has no price to offer.' };
  const { data: opts } = await admin
    .from('selection_options')
    .select('id, name, is_chosen')
    .eq('selection_id', selectionId)
    .eq('is_deleted', false)
    .eq('is_chosen', true);
  if (!opts?.length) return { error: 'Choose at least one option before sending for approval.' };
  const { data: amts } = await admin
    .from('selection_option_amounts')
    .select('option_id, quantity, unit_cost, markup_percent')
    .in('option_id', opts.map((o) => o.id));
  const byId = new Map((amts ?? []).map((a) => [a.option_id, a]));
  const lines: OfferedFigures['lines'] = [];
  for (const o of opts) {
    const a = byId.get(o.id);
    if (!a) return { error: `Option "${o.name}" has no price.` };
    lines.push({ optionId: o.id, name: o.name, sell: r2(Number(a.quantity) * Number(a.unit_cost) * (1 + Number(a.markup_percent ?? 0) / 100)) });
  }
  const sellAmount = r2(lines.reduce((n, l) => n + l.sell, 0));
  const allowanceDeduction = sel.allowance_budget_item_id ? await allowanceSellFor(admin, sel.allowance_budget_item_id) : 0;
  return { sellAmount, allowanceDeduction, variance: r2(sellAmount - allowanceDeduction), lines };
}

// ── Transitions ─────────────────────────────────────────────────────────────

/**
 * OFFER: draft | in_discussion → awaiting_approval. Company side (owner/admin/PM).
 * Gated by the CALLER'S RLS UPDATE on `selections` — the stamping write itself
 * is done with the user's client, so a role the policy excludes affects zero
 * rows and we stop (mutation-result.ts). Money is then read service-role only
 * because a PM may offer but cannot read project_budget_amounts.
 */
export async function offerSelection(rls: Db, selectionId: string): Promise<{ success: boolean; error?: string; figures?: OfferedFigures | null }> {
  const admin = getSupabaseAdmin() as Db;
  const { data: sel } = await rls.from('selections').select('id, status, client_supplied, mode').eq('id', selectionId).maybeSingle();
  if (!sel) return { success: false, error: 'Selection not found.' };
  if (sel.status !== 'draft' && sel.status !== 'in_discussion') return { success: false, error: `A ${sel.status.replace('_', ' ')} selection cannot be sent for approval.` };

  let figures: OfferedFigures | null = null;
  if (!sel.client_supplied) {
    const f = await computeOfferedFigures(admin, selectionId);
    if ('error' in f) return { success: false, error: f.error };
    figures = f;
  }
  const now = new Date().toISOString();
  const { data, error } = await rls
    .from('selections')
    .update(
      figures
        ? { status: 'awaiting_approval', offered_sell_amount: figures.sellAmount, offered_allowance_deduction: figures.allowanceDeduction, offered_variance: figures.variance, offered_at: now }
        : { status: 'awaiting_approval' }
    )
    .eq('id', selectionId)
    .in('status', ['draft', 'in_discussion'])
    .select('id');
  if (error) return { success: false, error: error.message };
  if (!applied(data)) return { success: false, error: 'You may not send this selection for approval.' };

  // One live pending session; any older pending one is invalidated, never deleted.
  const { data: company } = await admin.from('selections').select('company_id').eq('id', selectionId).single();
  await admin.from('selection_signing_sessions').update({ status: 'invalidated' }).eq('selection_id', selectionId).eq('status', 'pending');
  const { error: sErr } = await admin.from('selection_signing_sessions').insert({ company_id: company!.company_id, selection_id: selectionId, status: 'pending' });
  if (sErr) return { success: false, error: `Offered, but the signing session could not be opened: ${sErr.message}` };
  return { success: true, figures };
}

/** WITHDRAW (company): awaiting_approval → draft; pending session invalidated; stamps cleared. */
export async function withdrawSelectionOffer(rls: Db, selectionId: string): Promise<{ success: boolean; error?: string }> {
  const admin = getSupabaseAdmin() as Db;
  const { data, error } = await rls
    .from('selections')
    .update({ status: 'draft', offered_sell_amount: null, offered_allowance_deduction: null, offered_variance: null, offered_at: null })
    .eq('id', selectionId)
    .eq('status', 'awaiting_approval')
    .select('id');
  if (error) return { success: false, error: error.message };
  if (!applied(data)) return { success: false, error: 'Only a selection awaiting approval can be withdrawn, and only by a manager.' };
  await admin.from('selection_signing_sessions').update({ status: 'invalidated' }).eq('selection_id', selectionId).eq('status', 'pending');
  return { success: true };
}

/**
 * REVISE (Q9): approved → in_discussion. The current completed session is
 * SUPERSEDED — never deleted, never invalidated (it was a real signature) — and
 * the signed stamps are cleared so stage 5's sum drops the old variance at once.
 */
export async function reviseSelection(rls: Db, selectionId: string): Promise<{ success: boolean; error?: string }> {
  const admin = getSupabaseAdmin() as Db;
  // The CHECK `approved_is_signed` means the status and the stamps must move in ONE statement.
  const { data, error } = await rls
    .from('selections')
    .update({ status: 'in_discussion', signed_sell_amount: null, signed_allowance_deduction: null, signed_variance: null, signed_at: null, signed_session_id: null })
    .eq('id', selectionId)
    .eq('status', 'approved')
    .select('id');
  if (error) return { success: false, error: error.message };
  if (!applied(data)) return { success: false, error: 'Only an approved selection can be revised, and only by a manager.' };
  const { data: s } = await admin
    .from('selection_signing_sessions')
    .update({ superseded_at: new Date().toISOString() })
    .eq('selection_id', selectionId)
    .eq('status', 'completed')
    .is('superseded_at', null)
    .select('id');
  if (!applied(s)) return { success: false, error: 'Revised, but no current signature was found to supersede — check the audit trail.' };
  return { success: true };
}

// ── The client's two acts — portal only ──────────────────────────────────────

async function readAwaitingSelectionAsClient(rls: Db, selectionId: string) {
  // The client's RLS arm admits only non-draft selections on HER projects; a
  // CONTROL client gets no row here, which is the gate.
  const { data } = await rls
    .from('selections')
    .select('id, company_id, project_id, name, status, client_supplied, offered_sell_amount, offered_allowance_deduction, offered_variance, allow_multiple')
    .eq('id', selectionId)
    .maybeSingle();
  return data;
}

export interface CompleteSelectionSignatureParams {
  signatureType: 'draw' | 'type';
  signatureData: string;
  signerName: string;
  signerIp: string | null;
  signerUserAgent: string | null;
  /** REQUIRED and not defaulted — the same reason as CompleteCoSignatureParams. */
  caller: SelectionSignatureCaller;
}

/** SIGN (Q4): awaiting_approval → approved. The one write path. */
export async function completeSelectionSignature(
  rls: Db,
  selectionId: string,
  params: CompleteSelectionSignatureParams
): Promise<{ success: boolean; error?: string }> {
  const admin = getSupabaseAdmin() as Db;
  const sel = await readAwaitingSelectionAsClient(rls, selectionId);
  if (!sel) return { success: false, error: 'Selection not found.' };
  if (sel.status !== 'awaiting_approval') return { success: false, error: 'This selection is not awaiting your approval.' };

  const { data: pending } = await admin
    .from('selection_signing_sessions')
    .select('id')
    .eq('selection_id', selectionId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!pending) return { success: false, error: 'No signing session is open for this selection.' };

  const { data: opts } = await admin
    .from('selection_options')
    .select('id, name, spec_detail, is_chosen, link_url')
    .eq('selection_id', selectionId)
    .eq('is_deleted', false)
    .eq('is_chosen', true);
  const consentText = selectionConsentTextFor({
    clientSupplied: sel.client_supplied,
    sellAmount: sel.offered_sell_amount == null ? null : Number(sel.offered_sell_amount),
    allowanceDeduction: sel.offered_allowance_deduction == null ? null : Number(sel.offered_allowance_deduction),
    variance: sel.offered_variance == null ? null : Number(sel.offered_variance),
  });
  const signedAt = new Date().toISOString();
  const snapshot = {
    selection: { id: sel.id, name: sel.name, client_supplied: sel.client_supplied, allow_multiple: sel.allow_multiple },
    chosen_options: opts ?? [],
    offered: { sell_amount: sel.offered_sell_amount, allowance_deduction: sel.offered_allowance_deduction, variance: sel.offered_variance },
    consent_text: consentText,
    signed_at: signedAt,
    signer_channel: params.caller.kind,
  };

  const { data: sRows, error: sErr } = await admin
    .from('selection_signing_sessions')
    .update({
      status: 'completed',
      signed_at: signedAt,
      signature_type: params.signatureType,
      signature_data: params.signatureData,
      signer_name: params.signerName,
      signer_ip: params.signerIp,
      signer_user_agent: params.signerUserAgent,
      signer_channel: params.caller.kind,
      signer_profile_id: params.caller.profileId,
      consent_given: true,
      consent_text: consentText,
      snapshot,
    })
    .eq('id', pending.id)
    .eq('status', 'pending')
    .select('id');
  if (sErr) return { success: false, error: sErr.message };
  if (!applied(sRows)) return { success: false, error: 'The signing session was no longer pending.' };

  const { data: uRows, error: uErr } = await admin
    .from('selections')
    .update(
      sel.client_supplied
        ? { status: 'approved', signed_session_id: null }
        : {
            status: 'approved',
            signed_sell_amount: sel.offered_sell_amount,
            signed_allowance_deduction: sel.offered_allowance_deduction,
            signed_variance: sel.offered_variance,
            signed_at: signedAt,
            signed_session_id: pending.id,
          }
    )
    .eq('id', selectionId)
    .eq('status', 'awaiting_approval')
    .select('id');
  if (uErr) return { success: false, error: uErr.message };
  if (!applied(uRows)) return { success: false, error: 'The selection was no longer awaiting approval.' };

  await notifyManagers(admin, sel.company_id, sel.project_id, selectionId, 'selection_approved', `Selection approved: ${sel.name}`, sel.offered_variance == null ? null : Number(sel.offered_variance), params.signerName);
  return { success: true };
}

/** DENY (Q9): awaiting_approval → DRAFT. A return, not a terminus. */
export async function declineSelection(
  rls: Db,
  selectionId: string,
  params: { caller: SelectionSignatureCaller; notes: string | null }
): Promise<{ success: boolean; error?: string }> {
  const admin = getSupabaseAdmin() as Db;
  const sel = await readAwaitingSelectionAsClient(rls, selectionId);
  if (!sel) return { success: false, error: 'Selection not found.' };
  if (sel.status !== 'awaiting_approval') return { success: false, error: 'This selection is not awaiting your approval.' };
  const now = new Date().toISOString();
  await admin
    .from('selection_signing_sessions')
    .update({ status: 'declined', declined_at: now, decline_notes: params.notes, signer_profile_id: params.caller.profileId })
    .eq('selection_id', selectionId)
    .eq('status', 'pending');
  const { data, error } = await admin
    .from('selections')
    .update({ status: 'draft', offered_sell_amount: null, offered_allowance_deduction: null, offered_variance: null, offered_at: null })
    .eq('id', selectionId)
    .eq('status', 'awaiting_approval')
    .select('id');
  if (error) return { success: false, error: error.message };
  if (!applied(data)) return { success: false, error: 'The selection was no longer awaiting approval.' };
  await notifyManagers(admin, sel.company_id, sel.project_id, selectionId, 'selection_denied', `Selection declined: ${sel.name}`, null, null, params.notes);
  return { success: true };
}

async function notifyManagers(
  admin: Db,
  companyId: string,
  projectId: string,
  selectionId: string,
  type: 'selection_approved' | 'selection_denied',
  title: string,
  variance: number | null,
  signer: string | null,
  notes?: string | null
): Promise<void> {
  try {
    const recipients = await getManagerNotifyRecipients(admin, companyId);
    if (!recipients.length) return;
    const f = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    await notify({
      admin,
      companyId,
      type,
      recipients,
      // Owner/Admin only, so the money may be in the stored bytes (R7).
      render: () => ({
        title,
        body:
          type === 'selection_approved'
            ? `${signer ? `Signed by ${signer}. ` : ''}${variance == null ? 'Client-supplied — no charge.' : variance >= 0 ? `Added price ${f(variance)}.` : `Credit owed ${f(Math.abs(variance))}.`}`
            : notes
              ? `Client note: ${notes}`
              : 'Returned to draft for the team to revise.',
      }),
      linkKey: 'selection',
      linkParams: { id: selectionId, projectId },
      projectId,
      source: { table: 'selections', id: selectionId },
      tag: `${type}-${selectionId}`,
    });
  } catch (e) {
    // notify() must never break the signature; log and go on.
    console.error('[selection-lifecycle] notify failed', type, selectionId, (e as Error).message);
  }
}
