import { createClient } from '@/lib/supabase-browser';
import { uploadFile } from '@/lib/services/files-client';
import {
  boxKindNeedsParty,
  canManageContracts,
  canVoidContract,
  isKeyValidForKind,
  type ContractBoxKind,
  type ContractDocumentStatus,
  type ContractParty,
  type DocumentKind,
} from '@/lib/services/contracts-shared';
import type { Database } from '@framefocus/shared/types/database';
import type {
  ClientContract,
  ContractStatus,
  SubcontractorContract,
} from '@/lib/services/contracts';
export type { ClientContract, ContractStatus, SubcontractorContract };

// ─────────────────────────────────────────────────────────────────────────────
// #1-s146 — the two halves of the fix, applied to every write below.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The caller's role, resolved SERVER-SIDE.
 *
 * ⚠️ A FUNCTION THAT ASKS THE CALLER WHO THEY ARE IS NOT A CHECK. Until S146
 * `voidContractDocument()` took `role` as a PARAMETER, so a project_manager
 * passing `role: 'owner'` cleared `canVoidContract()` outright and the only
 * thing that saved the data was the database refusing the write.
 *
 * `get_my_role()` is the SAME SECURITY DEFINER function every RLS policy calls,
 * which is the reason to use it over a `profiles` read: the service check and
 * the database gate cannot disagree about who the caller is, because they ask
 * the same question of the same source.
 *
 * Precedent: `time-tracking-client.ts:107`.
 */
async function myRole(supabase: ReturnType<typeof createClient>): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_my_role');
  if (error) return null;
  return (data as string | null) ?? null;
}

/**
 * A write that RLS discarded, reported as the failure it is.
 *
 * ⚠️ ZERO AFFECTED ROWS IS NOT AN ERROR IN POSTGRES. When a policy matches
 * nothing, the UPDATE is valid and changes nothing — PostgREST returns no error,
 * so every caller below used to return `{ success: true }` over a row it had not
 * touched. On a contract that means reporting a legal document as voided while
 * it is still live.
 *
 * ⚠️ AND THE SAME CODE BEHAVED TWO DIFFERENT WAYS DEPENDING ON THE TABLE, which
 * is what makes this worth a helper rather than a one-line fix:
 *
 *   `client_contracts` — an assigned PM HOLDS an UPDATE policy, so the row is
 *     visible, `enforce_contract_void_authority` fires, and Postgres RAISES.
 *     The caller got a real error.
 *   `contract_documents` — `contract_documents_update_owner_admin` admits only
 *     owner/admin, so a PM matches NO ROWS. No policy match, no trigger, no
 *     error — and the identical lie returned success.
 *
 * Same function, same call, opposite outcomes. Proved by
 * `s146-contract-services.live.ts` S146-C4.
 *
 * The message names no cause it has not verified (CLAUDE.md): an empty result
 * cannot distinguish "policy refused you" from "the row is gone", so it says
 * both. `.select('id')` is what makes the affected rows observable at all.
 */
const DISCARDED =
  'That change was not applied. You may not have permission to make it, or the record no longer exists.';

/**
 * ⚠️ DO NOT apply this to a DELETE whose empty result is legitimate — see
 * `saveContractBoxMap`, where clearing a template that has no boxes yet
 * correctly affects zero rows.
 */
function applied(rows: unknown[] | null): boolean {
  return Array.isArray(rows) && rows.length > 0;
}

export async function createClientContract(contract: {
  project_id: string;
  status?: ContractStatus;
  contract_value?: number | null;
  executed_date?: string | null;
  notes?: string | null;
  signed_proposal_file_id?: string | null;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('client_contracts')
    .insert(contract)
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, id: data.id };
}

export async function updateClientContract(
  id: string,
  updates: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  // BEFORE UPDATE trigger `client_contracts_set_updated_by` handles updated_by.
  // updated_at is handled by the existing updated_at trigger.
  const { data, error } = await supabase
    .from('client_contracts')
    .update(updates)
    .eq('id', id)
    .select('id');

  if (error) return { success: false, error: error.message };
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}

export async function createSubcontractorContract(contract: {
  project_id: string;
  member_id: string;
  scope_of_work?: string | null;
  contract_value?: number | null;
  status?: ContractStatus;
  executed_date?: string | null;
  notes?: string | null;
  signed_doc_file_id?: string | null;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('subcontractor_contracts')
    .insert(contract)
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, id: data.id };
}

export async function updateSubcontractorContract(
  id: string,
  updates: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  // BEFORE UPDATE trigger handles updated_by; updated_at trigger handles updated_at.
  const { data, error } = await supabase
    .from('subcontractor_contracts')
    .update(updates)
    .eq('id', id)
    .select('id');

  if (error) return { success: false, error: error.message };
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Module 7I — the contract DOCUMENT layer, client writes [S145]
// ─────────────────────────────────────────────────────────────────────────────
//
// Owner/Admin by RLS on all four 7I tables; these return friendly errors on
// top (the 7C/7D/7E/7F precedent).
//
// ⚠️ TYPE-ONLY IMPORTS FROM `contracts-shared`, never a value import from
// `contracts.ts`. That pulls `next/headers` into the client bundle and tsc does
// not catch it (§11.1) — the reason the third leg of the triple exists.

type ContractTemplateInsert = Database['public']['Tables']['contract_templates']['Insert'];
type ContractTemplateUpdate = Database['public']['Tables']['contract_templates']['Update'];
type ContractBoxInsert = Database['public']['Tables']['contract_template_boxes']['Insert'];

type ContractResult = { success: boolean; error?: string };
type ContractCreateResult = { success: boolean; id?: string; error?: string };

function friendlyContract(message: string): string {
  if (/row-level security|violates row-level/i.test(message)) {
    return 'Contracts are Owner/Admin only.';
  }
  if (/Voiding a contract is Owner\/Admin only/i.test(message)) {
    return 'Voiding a contract is Owner/Admin only.';
  }
  if (/contract_documents_subject_check/i.test(message)) {
    return 'A contract document belongs to an estimate or a subcontract, never both.';
  }
  if (/contract_documents_void_shape_check/i.test(message)) {
    return 'A void needs a reason, and a live contract cannot carry one.';
  }
  if (/contract_template_boxes_bounds_check/i.test(message)) {
    return 'That box falls outside the page.';
  }
  if (/contract_template_boxes_payload_check/i.test(message)) {
    return 'A value box needs a field, a custom box needs a label, and a signature or initials box needs to say who signs it.';
  }
  if (/contract_template_boxes_party_check/i.test(message)) {
    return 'A signature is either ours or the other party’s — nothing else.';
  }
  if (/contract_templates_one_default_per_kind/i.test(message)) {
    // Should be unreachable: the BEFORE trigger clears the previous default in
    // the same transaction. If a user ever sees this, the trigger is missing.
    return 'Only one form of each kind can be the default.';
  }
  return message;
}

// ── Templates ───────────────────────────────────────────────────────────────

export async function createContractTemplate(input: {
  name: string;
  document_kind: DocumentKind;
}): Promise<ContractCreateResult> {
  const supabase = createClient();
  const row: ContractTemplateInsert = {
    name: input.name,
    document_kind: input.document_kind,
  };
  const { data, error } = await supabase
    .from('contract_templates')
    .insert(row)
    .select('id')
    .single();
  if (error) return { success: false, error: friendlyContract(error.message) };
  return { success: true, id: data.id };
}

export async function updateContractTemplate(
  id: string,
  updates: ContractTemplateUpdate
): Promise<ContractResult> {
  const supabase = createClient();
  // Triggers handle updated_at / updated_by; never set them here.
  const { data, error } = await supabase
    .from('contract_templates')
    .update(updates)
    .eq('id', id)
    .select('id');
  if (error) return { success: false, error: friendlyContract(error.message) };
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}

export async function softDeleteContractTemplate(id: string): Promise<ContractResult> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('contract_templates')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id)
    .select('id');
  if (error) return { success: false, error: friendlyContract(error.message) };
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}

/**
 * Upload the company's own contract form.
 *
 * Category `'contracts'` — a company-scoped file with no project, so only the
 * Owner/Admin arm of `files_insert_non_client` admits it. That arm is what 7C's
 * compliance upload and 7F's templates both rely on.
 */
export async function uploadContractTemplatePdf(
  file: File,
  templateId: string
): Promise<ContractResult> {
  if (file.type !== 'application/pdf') {
    return { success: false, error: 'The contract form must be a PDF.' };
  }
  const uploaded = await uploadFile(file, {
    project_id: null,
    path_segment: `contracts/templates/${templateId}`,
    category: 'contracts',
  });
  if (!uploaded.success || !uploaded.id) {
    return { success: false, error: uploaded.error ?? 'Upload failed.' };
  }
  return updateContractTemplate(templateId, { pdf_file_id: uploaded.id });
}

// ── Box map ─────────────────────────────────────────────────────────────────

export interface ContractBoxInput {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  kind: ContractBoxKind;
  value_key?: string | null;
  custom_label?: string | null;
  /** R4/R5 — required on `signature` and `initial`, forbidden on the others. */
  party?: ContractParty | null;
}

/**
 * Replace a template's whole box map — REPLACE, never merge.
 *
 * The placement UI owns the entire map while open; a merge would silently
 * resurrect a box the user just deleted. 7F's `saveBoxMap` and 7A's
 * `approve_expense` reconciliation are the precedents.
 *
 * ⚠️ Value keys are validated against the template's OWN `document_kind`
 * before the write. A client-only key on a subcontract template would place a
 * box that can never fill — a permanently blank field on a legal document,
 * which looks like an oversight by whoever signed it rather than by us.
 */
export async function saveContractBoxMap(
  templateId: string,
  kind: DocumentKind,
  boxes: ContractBoxInput[]
): Promise<ContractResult> {
  for (const b of boxes) {
    if (b.kind === 'value') {
      if (!b.value_key) return { success: false, error: 'Every value box needs a field.' };
      if (!isKeyValidForKind(b.value_key, kind)) {
        return {
          success: false,
          error: `"${b.value_key}" is not available on a ${
            kind === 'client_contract' ? 'client contract' : 'subcontract'
          } and would never fill.`,
        };
      }
    }
    if (b.kind === 'custom' && !b.custom_label?.trim()) {
      return { success: false, error: 'Every custom box needs a label.' };
    }
    // R4/R5 — a signature box with no party stamps nothing. Refused here for a
    // sentence the user can act on; `contract_template_boxes_payload_check`
    // refuses it again in the database, which is the gate that actually binds.
    if (boxKindNeedsParty(b.kind) && !b.party) {
      return {
        success: false,
        error: `Every ${b.kind === 'initial' ? 'initials' : 'signature'} box needs to say who signs it.`,
      };
    }
  }

  const supabase = createClient();

  // #1-s146 — THE ROLE GATE IS LOAD-BEARING HERE, not defence in depth.
  //
  // The row-count fix used below cannot reach this function's empty case: a
  // caller passing `[]` runs the clear and returns at the early exit, and a
  // clear that RLS discarded is indistinguishable from a clear that had nothing
  // to remove. Without this, a project_manager calling
  // `saveContractBoxMap(id, kind, [])` was told the map was emptied when it was
  // untouched. Resolving the role server-side closes it before the write.
  const role = await myRole(supabase);
  if (!role || !canManageContracts(role)) {
    return { success: false, error: 'Contracts are Owner/Admin only.' };
  }

  // ⚠️ NO ROW-COUNT CHECK ON THIS DELETE, DELIBERATELY. Clearing a template that
  // has no boxes yet legitimately affects zero rows — that is the first save of
  // every template. `applied()` here would refuse the commonest case. The
  // unauthorised caller is already gone at the gate above, and an authorised
  // caller's discarded delete is caught by the INSERT below, which errors.
  const { error: clearError } = await supabase
    .from('contract_template_boxes')
    .delete()
    .eq('template_id', templateId);
  if (clearError) return { success: false, error: friendlyContract(clearError.message) };

  if (boxes.length === 0) return { success: true };

  const rows: ContractBoxInsert[] = boxes.map((b) => ({
    template_id: templateId,
    page: b.page,
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    kind: b.kind,
    value_key: b.kind === 'value' ? (b.value_key ?? null) : null,
    custom_label: b.kind === 'custom' ? (b.custom_label ?? null) : null,
    // Nulled rather than passed through, so a party left over from a box the
    // user switched away from `signature` cannot reach the payload CHECK.
    party: boxKindNeedsParty(b.kind) ? (b.party ?? null) : null,
  }));

  const { error } = await supabase.from('contract_template_boxes').insert(rows);
  if (error) return { success: false, error: friendlyContract(error.message) };
  return { success: true };
}

// ── Documents ───────────────────────────────────────────────────────────────

/**
 * §8 / C5 — void a contract document.
 *
 * The decision is checked here for a friendly message and enforced by
 * `enforce_contract_void_authority` in the database, because
 * `client_contracts_update_authorized` admits an assigned PM and the shipped
 * contracts panel already exposes a void action. A UI gate alone is the
 * defect class S143 closed on invoices.
 *
 * ⚠️ `role` WAS A PARAMETER UNTIL S146 (#1-s146), and that made this check
 * decorative: a project_manager passing `role: 'owner'` cleared
 * `canVoidContract()` and reached the write. It is now resolved server-side
 * from `get_my_role()` — the same function the policies call — so the caller
 * cannot assert it. `status` is still supplied by the caller: it selects the
 * message ("already voided"), not the authority, and the void-shape CHECK plus
 * the void-authority trigger both hold regardless of what is passed.
 */
export async function voidContractDocument(
  id: string,
  status: ContractDocumentStatus,
  reason: string
): Promise<ContractResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const role = await myRole(supabase);
  if (!role) return { success: false, error: 'Not authenticated' };

  const decision = canVoidContract(role, status, reason);
  if (!decision.allowed) return { success: false, error: decision.reason };

  // The void-shape CHECK requires all three together, so they are written
  // together — a partial void is refused by the database, not by this code.
  const { data, error } = await supabase
    .from('contract_documents')
    .update({
      status: 'voided',
      void_reason: reason,
      voided_by: user.id,
      voided_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id');
  if (error) return { success: false, error: friendlyContract(error.message) };
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}

// ── The two-level toggle (§5.2) ─────────────────────────────────────────────
//
// Both halves live here so the pair cannot drift. `clientContractApplies()` in
// contracts-shared.ts is the only place they are combined.

/**
 * §5.2 — the MASTER half of the toggle, written from Company Settings.
 *
 * ⚠️ DELIBERATELY NOT `updateCompany()` [RULED S150, Q2], even though this is a
 * `companies` column and `updateCompany` is right there. That writer does not
 * `.select()`, so a write RLS discards returns `{ success: true }` — the exact
 * `#1-s146` failure every other write in this file was hardened against. It
 * also sets `updated_at` explicitly, which CLAUDE.md flags as the `companies`
 * holdover not to copy. Routing a contracts write through it would import both.
 *
 * `companies_update_owner_admin` (baseline `:3208`) is the database's opinion —
 * Owner/Admin, same floor as the four 7I tables. The check below is the
 * friendly message over that gate, not a substitute for it.
 *
 * §12.1 — OFF IS THE DEFAULT AND OFF MUST CHANGE NOTHING. Turning this off
 * cannot destroy a template or a placed box map; it only stops the send flow
 * from offering a contract. §5.2a keeps templates authorable either way.
 */
export async function setClientContractsEnabled(
  companyId: string,
  enabled: boolean
): Promise<ContractResult> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('companies')
    .update({ client_contracts_enabled: enabled })
    .eq('id', companyId)
    .select('id');
  if (error) return { success: false, error: friendlyContract(error.message) };
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}

/**
 * §5.2 — the per-proposal half of the toggle.
 *
 * The master is `setClientContractsEnabled()` above; this is the estimate-level
 * choice the user makes when sending a proposal. Both must be on.
 */
export async function setEstimateContractToggle(
  estimateId: string,
  include: boolean
): Promise<ContractResult> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('estimates')
    .update({ include_client_contract: include })
    .eq('id', estimateId)
    .select('id');
  if (error) return { success: false, error: friendlyContract(error.message) };
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}
