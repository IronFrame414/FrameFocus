import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { notify } from '@/lib/notify/notify';
import { getManagerNotifyRecipients } from '@/lib/notify/recipients';
import { applied } from '@/lib/services/mutation-result';
import { optionSell } from '@/lib/selections/option-sell';

// ============================================================================
// Allowances & Selections — the LIFECYCLE. [S171, stage 4]
// Spec §5.3, §6; rulings Q4, Q7, Q8, Q9; analysis 2b.3, 2b.5.
//
//   draft / in_discussion ──offer──▶ awaiting_approval ──sign──▶ approved
//        ▲                          │          │                    │
//        │◀──── withdraw (company) ─┘          └─ deny (client) ─▶ DENIED
//        │                                                          │
//        └──────────────────── reopen (company) ◀───────────────────┘      revise: approved → in_discussion
//
// [S172, Josh] DENIED IS A RESTING STATE. Stage 4 returned a denial straight
// to draft; Josh: "it should be flagged as denied. A user can choose to
// re-open it, which moves to draft." Withdraw (company-initiated) still lands
// in draft directly — the company is already acting.
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
// [S173, Josh] "CHOSEN" IS THE CLIENT'S ACT. _Superseded model, quoted not
// deleted: the company ticked `is_chosen` on the sheet and the offer stamped
// `offered_*` = Σ chosen sells — "SELL IS STAMPED, NOT DERIVED, AT TWO MOMENTS
// (analysis 2b.3): offered_* when the company sends it, signed_* (= offered)
// when the client signs."_ Josh: "this is supposed to be a list to send to the
// client for the client to pick and sign off on" — if the company pre-picks,
// there is nothing left for the client to choose.
//
// AS RULED: the company ASSEMBLES priced options and releases them; the CLIENT
// picks (writing `is_chosen`, stage 7's portal page) and signs. So the offer
// stamps NOTHING — `offered_*` stays NULL (legal: the four travel together) —
// and the figures are computed ONCE, at the SIGNATURE, from the client's
// chosen set, then stamped into `signed_*`. Q7 (sum-then-compare) governs
// WITHIN the selection at that moment; `allow_multiple` decides one-of or
// several-of. A cost edit after signing still cannot move contract value
// (stage 5 sums signed_variance) without a new signature.
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

/**
 * The ALLOWANCE's sell: its budgeted cost × (1 + its effective markup).
 *
 * ⚠️ [S174 #2] THE MARKUP CHAIN NO LONGER LIVES HERE. It was ~40 lines of
 * TypeScript walking project_budget_items → change_order_line_rows /
 * estimate_line_rows → change_orders / estimates → companies. The SAME walk was
 * then needed to stamp `selection_amounts.inherited_markup_percent` from a
 * trigger, where TypeScript cannot run — and writing it twice is the #129
 * divergence in its purest form: two implementations that agree today, in a
 * form that looks like agreement.
 *
 * So there is ONE implementation, `allowance_effective_markup_percent()` in
 * 20261030000000, and this calls it. _Superseded: the inline chain, whose rungs
 * are reproduced rung-for-rung in that function's body and commented there._
 *
 * The RPC goes through the ADMIN client on purpose: the function is REVOKEd
 * from `authenticated` because a markup percent is a floored figure, and an RPC
 * that returned one to any signed-in caller would defeat the side tables it
 * exists to populate. The caller here has already been gated by an RLS write.
 */
async function allowanceSellFor(admin: Db, budgetItemId: string): Promise<number> {
  const { data: amt } = await admin
    .from('project_budget_amounts')
    .select('budgeted_amount')
    .eq('budget_item_id', budgetItemId)
    .maybeSingle();
  const cost = Number(amt?.budgeted_amount ?? 0);
  const { data: markup } = await admin.rpc('allowance_effective_markup_percent', {
    p_budget_item_id: budgetItemId,
  });
  // NULL means the budget item does not exist — the old code returned 0 for
  // that case before ever reaching the markup, and so does this.
  if (markup === null || markup === undefined) return 0;
  return r2(cost * (1 + Number(markup) / 100));
}

/**
 * Sum-then-compare (Q7): Σ CHOSEN options' sell − allowance sell (or − 0, Q8).
 * [S173] `is_chosen` is the CLIENT's pick, so this runs at the SIGNATURE, not
 * the offer. `allow_multiple` is enforced here — one-of or several-of.
 */
export async function computeChosenFigures(admin: Db, selectionId: string): Promise<OfferedFigures | { error: string }> {
  const { data: sel } = await admin
    .from('selections')
    .select('id, client_supplied, allowance_budget_item_id, mode, allow_multiple')
    .eq('id', selectionId)
    .maybeSingle();
  if (!sel) return { error: 'Selection not found.' };
  if (sel.client_supplied) return { error: 'A client-supplied selection has no price.' };
  const { data: opts } = await admin
    .from('selection_options')
    .select('id, name, is_chosen')
    .eq('selection_id', selectionId)
    .eq('is_deleted', false)
    .eq('is_chosen', true);
  if (!opts?.length) return { error: 'Choose at least one option before approving.' };
  if (!sel.allow_multiple && opts.length > 1) return { error: 'This selection allows only one choice.' };
  const { data: amts } = await admin
    .from('selection_option_amounts')
    .select('option_id, quantity, unit_cost, markup_percent')
    .in('option_id', opts.map((o) => o.id));
  // [S174 #2] The SNAPSHOT an option with a NULL `markup_percent` inherits —
  // read, never re-derived (Josh: "a snapshot at allowance-creation time, not a
  // live read of the estimate now"). `?? 0` used to stand where this read is,
  // which is how "inherit" came to mean "no markup" in the figure a client
  // would have SIGNED. Service-role read: the stamp is floored, and this runs
  // in a portal-session context where the client cannot see it.
  const { data: snap } = await admin
    .from('selection_amounts')
    .select('inherited_markup_percent')
    .eq('selection_id', selectionId)
    .maybeSingle();
  const inherited = snap?.inherited_markup_percent ?? null;

  const byId = new Map((amts ?? []).map((a) => [a.option_id, a]));
  const lines: OfferedFigures['lines'] = [];
  for (const o of opts) {
    const a = byId.get(o.id);
    if (!a) return { error: `Option "${o.name}" has no price.` };
    lines.push({ optionId: o.id, name: o.name, sell: optionSell(a, inherited) });
  }
  const sellAmount = r2(lines.reduce((n, l) => n + l.sell, 0));
  const allowanceDeduction = sel.allowance_budget_item_id ? await allowanceSellFor(admin, sel.allowance_budget_item_id) : 0;
  return { sellAmount, allowanceDeduction, variance: r2(sellAmount - allowanceDeduction), lines };
}

// ── Transitions ─────────────────────────────────────────────────────────────

/**
 * OFFER (S173: "release"): draft | in_discussion → awaiting_approval. Company
 * side (owner/admin/PM). Gated by the CALLER'S RLS UPDATE on `selections` — the
 * status write is done with the user's client, so a role the policy excludes
 * affects zero rows and we stop (mutation-result.ts).
 *
 * [S173] The gate is "at least one PRICED option exists", not "one has been
 * chosen" — choosing is the client's act. No figures are computed and nothing
 * is stamped here; `offered_*` stays NULL and the signature stamps `signed_*`
 * from the client's picks. The priced-option check reads service-role because
 * a PM may release but cannot read every amounts row context.
 */
export async function offerSelection(rls: Db, selectionId: string): Promise<{ success: boolean; error?: string }> {
  const admin = getSupabaseAdmin() as Db;
  const { data: sel } = await rls.from('selections').select('id, status, client_supplied, mode').eq('id', selectionId).maybeSingle();
  if (!sel) return { success: false, error: 'Selection not found.' };
  if (sel.status !== 'draft' && sel.status !== 'in_discussion') return { success: false, error: `A ${sel.status.replace('_', ' ')} selection cannot be sent for approval.` };

  if (!sel.client_supplied) {
    const { data: opts } = await admin
      .from('selection_options')
      .select('id')
      .eq('selection_id', selectionId)
      .eq('is_deleted', false);
    const ids = (opts ?? []).map((o) => o.id);
    const priced = ids.length
      ? ((await admin.from('selection_option_amounts').select('option_id').in('option_id', ids)).data ?? [])
      : [];
    if (!priced.length) return { success: false, error: 'Add at least one priced option before sending to the client.' };
  }
  const { data, error } = await rls
    .from('selections')
    .update({ status: 'awaiting_approval' })
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
  return { success: true };
}

/**
 * RELEASE SELECTIONS (S173 Job 3): the batch is a DELIVERY mechanism, not a
 * signing unit. N pending selections go out in one action; the client sees
 * them together in the portal and signs ONE SIGNATURE PER SELECTION — Josh,
 * deliberately: "1 signature per selection category and allow partial batch."
 * Partial batches are supported by construction: each selection keeps its own
 * lifecycle, so an unsigned one stays awaiting and blocks nothing.
 *
 * Why not one signature over the batch (the obvious design a later reader will
 * propose): each signature binds ONE selection against ONE allowance, so no
 * instrument ever spans several allowance lines and there is no cross-
 * allowance variance to reconcile. The batch existing only as delivery is what
 * RESOLVES that question rather than answering it.
 *
 * Not transactional on purpose — a refusal on one selection (unpriced, wrong
 * status, not yours) must not un-release the others. Per-id results go back.
 */
export async function releaseSelections(
  rls: Db,
  selectionIds: string[]
): Promise<{ results: { id: string; success: boolean; error?: string }[] }> {
  const results: { id: string; success: boolean; error?: string }[] = [];
  for (const id of selectionIds) {
    const r = await offerSelection(rls, id);
    results.push({ id, success: r.success, ...(r.error ? { error: r.error } : {}) });
  }
  return { results };
}

/** WITHDRAW (company): awaiting_approval → draft; pending session invalidated.
 *  The offered-stamp clears are LEGACY hygiene — since S173 the offer stamps
 *  nothing, so on new rows they null out nulls. */
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
    .select('id, company_id, project_id, name, status, client_supplied, allow_multiple')
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

/**
 * SIGN (Q4): awaiting_approval → approved. The one write path.
 * [S173] The figures are computed HERE, from the client's chosen set (Q7,
 * `allow_multiple` enforced), and stamped into `signed_*`. `offered_*` is not
 * read and not written — the offer stamps nothing under the client-choice
 * model. The consent text and the stamps come from the SAME computation.
 */
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

  let figures: OfferedFigures | null = null;
  if (!sel.client_supplied) {
    const f = await computeChosenFigures(admin, selectionId);
    if ('error' in f) return { success: false, error: f.error };
    figures = f;
  }

  const { data: opts } = await admin
    .from('selection_options')
    .select('id, name, spec_detail, is_chosen, link_url')
    .eq('selection_id', selectionId)
    .eq('is_deleted', false)
    .eq('is_chosen', true);
  const consentText = selectionConsentTextFor({
    clientSupplied: sel.client_supplied,
    sellAmount: figures?.sellAmount ?? null,
    allowanceDeduction: figures?.allowanceDeduction ?? null,
    variance: figures?.variance ?? null,
  });
  const signedAt = new Date().toISOString();
  const snapshot = {
    selection: { id: sel.id, name: sel.name, client_supplied: sel.client_supplied, allow_multiple: sel.allow_multiple },
    chosen_options: opts ?? [],
    // [S173] key renamed from `offered` — these are the figures AGREED at the
    // signature, computed from the client's picks a moment ago.
    agreed: figures
      ? { sell_amount: figures.sellAmount, allowance_deduction: figures.allowanceDeduction, variance: figures.variance }
      : { sell_amount: null, allowance_deduction: null, variance: null },
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
      sel.client_supplied || !figures
        ? { status: 'approved', signed_session_id: null }
        : {
            status: 'approved',
            signed_sell_amount: figures.sellAmount,
            signed_allowance_deduction: figures.allowanceDeduction,
            signed_variance: figures.variance,
            signed_at: signedAt,
            signed_session_id: pending.id,
          }
    )
    .eq('id', selectionId)
    .eq('status', 'awaiting_approval')
    .select('id');
  if (uErr) return { success: false, error: uErr.message };
  if (!applied(uRows)) return { success: false, error: 'The selection was no longer awaiting approval.' };

  await notifyManagers(admin, sel.company_id, sel.project_id, selectionId, 'selection_approved', `Selection approved: ${sel.name}`, figures == null ? null : figures.variance, params.signerName);
  return { success: true };
}

/** DENY (Q9 as amended S172): awaiting_approval → DENIED, a RESTING state.
 *  The offered stamps are KEPT so the company can see what was refused;
 *  `reopenSelection` clears them on the way to draft. */
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
    .update({ status: 'denied' })
    .eq('id', selectionId)
    .eq('status', 'awaiting_approval')
    .select('id');
  if (error) return { success: false, error: error.message };
  if (!applied(data)) return { success: false, error: 'The selection was no longer awaiting approval.' };
  await notifyManagers(admin, sel.company_id, sel.project_id, selectionId, 'selection_denied', `Selection denied: ${sel.name}`, null, null, params.notes);
  return { success: true };
}

/** REOPEN (company, S172): DENIED → draft. Clears the offered stamps; the
 *  declined session stays on file. Gated by the caller's RLS UPDATE. */
export async function reopenSelection(rls: Db, selectionId: string): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await rls
    .from('selections')
    .update({ status: 'draft', offered_sell_amount: null, offered_allowance_deduction: null, offered_variance: null, offered_at: null })
    .eq('id', selectionId)
    .eq('status', 'denied')
    .select('id');
  if (error) return { success: false, error: error.message };
  if (!applied(data)) return { success: false, error: 'Only a denied selection can be reopened, and only by a manager.' };
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
              ? `Client note: ${notes} — reopen to revise.`
              : 'Sitting in Denied — reopen to revise.',
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
