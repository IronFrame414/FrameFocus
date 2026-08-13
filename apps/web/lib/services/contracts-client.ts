import { createClient } from '@/lib/supabase-browser';
import { uploadFile } from '@/lib/services/files-client';
import {
  canVoidContract,
  isKeyValidForKind,
  type ContractBoxKind,
  type ContractDocumentStatus,
  type DocumentKind,
} from '@/lib/services/contracts-shared';
import type { Database } from '@framefocus/shared/types/database';
import type {
  ClientContract,
  ContractStatus,
  SubcontractorContract,
} from '@/lib/services/contracts';
export type { ClientContract, ContractStatus, SubcontractorContract };

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
  const { error } = await supabase.from('client_contracts').update(updates).eq('id', id);

  if (error) return { success: false, error: error.message };
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
  const { error } = await supabase.from('subcontractor_contracts').update(updates).eq('id', id);

  if (error) return { success: false, error: error.message };
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
    return 'A value box needs a field, and a custom box needs a label.';
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
  const { error } = await supabase.from('contract_templates').update(updates).eq('id', id);
  if (error) return { success: false, error: friendlyContract(error.message) };
  return { success: true };
}

export async function softDeleteContractTemplate(id: string): Promise<ContractResult> {
  const supabase = createClient();
  const { error } = await supabase
    .from('contract_templates')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { success: false, error: friendlyContract(error.message) };
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
  }

  const supabase = createClient();
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
 */
export async function voidContractDocument(
  id: string,
  role: string,
  status: ContractDocumentStatus,
  reason: string
): Promise<ContractResult> {
  const decision = canVoidContract(role, status, reason);
  if (!decision.allowed) return { success: false, error: decision.reason };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  // The void-shape CHECK requires all three together, so they are written
  // together — a partial void is refused by the database, not by this code.
  const { error } = await supabase
    .from('contract_documents')
    .update({
      status: 'voided',
      void_reason: reason,
      voided_by: user.id,
      voided_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) return { success: false, error: friendlyContract(error.message) };
  return { success: true };
}

/**
 * §5.2 — the per-proposal half of the toggle.
 *
 * The master lives in Company Settings and is written through
 * `updateCompany()`; this is the estimate-level choice the user makes when
 * sending a proposal.
 */
export async function setEstimateContractToggle(
  estimateId: string,
  include: boolean
): Promise<ContractResult> {
  const supabase = createClient();
  const { error } = await supabase
    .from('estimates')
    .update({ include_client_contract: include })
    .eq('id', estimateId);
  if (error) return { success: false, error: friendlyContract(error.message) };
  return { success: true };
}
