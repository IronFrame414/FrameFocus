import { createClient } from '@/lib/supabase-server';
import {
  clientContractApplies,
  subContractBadge,
  type ContractBoxKind,
  type ContractDocumentStatus,
  type ContractParty,
  type DeliveryMode,
  type DocumentKind,
  type SubContractBadge,
} from '@/lib/services/contracts-shared';
import type { Database } from '@framefocus/shared/types/database';

export type ContractStatus = 'draft' | 'sent' | 'signed' | 'void';

type ClientContractRow = Database['public']['Tables']['client_contracts']['Row'];
export type ClientContract = Omit<ClientContractRow, 'status'> & {
  status: ContractStatus;
  /** From `client_contract_amounts` (Owner/Admin + client-of-project RLS).
   *  `null` means floored for this caller OR the contract has no value —
   *  render nothing, never a zero. */
  contract_value: number | null;
};

type SubContractRow = Database['public']['Tables']['subcontractor_contracts']['Row'];
export type SubcontractorContract = Omit<SubContractRow, 'status'> & {
  status: ContractStatus;
  member: { id: string; display_name: string } | null;
};

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  signed: 'Signed',
  void: 'Void',
};

/**
 * Client contracts for a project, most recent first. Re-issued/amended
 * contracts are new rows; the most recent signed row is the active contract
 * (Q-N9 rationale — no unique constraint on project_id).
 */
export async function getClientContracts(projectId: string): Promise<ClientContract[]> {
  const supabase = await createClient();

  // The money lives on client_contract_amounts (Owner/Admin + client arms).
  // For a PM/foreman the embed comes back null — the row renders, the figure
  // doesn't. The UNIQUE FK makes this a to-one embed (object, not array).
  const { data, error } = await supabase
    .from('client_contracts')
    .select('*, amounts:client_contract_amounts(contract_value)')
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .order('executed_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) return [];
  return (data ?? []).map((row) => {
    const { amounts, ...contract } = row as typeof row & {
      amounts: { contract_value: number | string | null } | { contract_value: number | string | null }[] | null;
    };
    const amount = Array.isArray(amounts) ? (amounts[0] ?? null) : amounts;
    return {
      ...contract,
      contract_value: amount?.contract_value == null ? null : Number(amount.contract_value),
    } as ClientContract;
  });
}

export async function getSubcontractorContracts(
  projectId: string
): Promise<SubcontractorContract[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('subcontractor_contracts')
    .select('*, member:company_members(id, display_name)')
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });

  if (error) return [];
  return (data ?? []) as unknown as SubcontractorContract[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Module 7I — the contract DOCUMENT layer [S145]
// ─────────────────────────────────────────────────────────────────────────────
//
// Everything above this line is Module 5A's contract RECORDS and is not
// rebuilt (§4, §11.1 — "7I extends these. It does not create them.").
//
// Owner/Admin by RLS on all four 7I tables, SELECT included (§8, reasoning
// rewritten at S145). No service-role bypass on any read here.

export type ContractTemplate = Omit<
  Database['public']['Tables']['contract_templates']['Row'],
  'document_kind'
> & { document_kind: DocumentKind };

export type ContractDocument = Omit<
  Database['public']['Tables']['contract_documents']['Row'],
  'document_kind' | 'status' | 'delivery_mode'
> & {
  document_kind: DocumentKind;
  status: ContractDocumentStatus;
  delivery_mode: DeliveryMode;
};

// `party` is CHECK-constrained and the generator emits loose `string`; the
// union is restored here per CLAUDE.md rather than widened at the call sites.
export type ContractTemplateBox = Omit<
  Database['public']['Tables']['contract_template_boxes']['Row'],
  'kind' | 'party'
> & { kind: ContractBoxKind; party: ContractParty | null };

export async function getContractTemplates(
  kind?: DocumentKind
): Promise<ContractTemplate[]> {
  const supabase = await createClient();
  let query = supabase
    .from('contract_templates')
    .select('*')
    .eq('is_deleted', false)
    .order('name', { ascending: true });
  if (kind) query = query.eq('document_kind', kind);
  const { data } = await query;
  return (data ?? []) as ContractTemplate[];
}

export async function getContractTemplateBoxes(
  templateId: string
): Promise<ContractTemplateBox[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('contract_template_boxes')
    .select('*')
    .eq('template_id', templateId)
    .eq('is_deleted', false)
    .order('page', { ascending: true });
  return (data ?? []) as ContractTemplateBox[];
}

/**
 * Box maps for MANY templates in one query, grouped by template_id — the
 * batched form of getContractTemplateBoxes, so the settings page (which reads a
 * box map per template, for BOTH document_kind families) runs one `.in(...)`
 * per family instead of one per template. Same `page`-asc order preserved
 * within each group; a box has one template_id so nothing is duplicated; a
 * template with no boxes is absent — callers default to []. Empty ids → empty
 * map.
 */
export async function getContractTemplateBoxesByTemplate(
  templateIds: string[]
): Promise<Map<string, ContractTemplateBox[]>> {
  const grouped = new Map<string, ContractTemplateBox[]>();
  if (templateIds.length === 0) return grouped;

  const supabase = await createClient();
  const { data } = await supabase
    .from('contract_template_boxes')
    .select('*')
    .in('template_id', templateIds)
    .eq('is_deleted', false)
    .order('page', { ascending: true });

  for (const row of (data ?? []) as ContractTemplateBox[]) {
    const key = row.template_id as string;
    const bucket = grouped.get(key);
    if (bucket) bucket.push(row);
    else grouped.set(key, [row]);
  }
  return grouped;
}

/** §5 — the client contract documents on an estimate. */
export async function getContractDocumentsForEstimate(
  estimateId: string
): Promise<ContractDocument[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('contract_documents')
    .select('*')
    .eq('estimate_id', estimateId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });
  return (data ?? []) as ContractDocument[];
}

/** §6 — the sub contract documents on a subcontract. */
export async function getContractDocumentsForSubContract(
  subContractId: string
): Promise<ContractDocument[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('contract_documents')
    .select('*')
    .eq('sub_contract_id', subContractId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });
  return (data ?? []) as ContractDocument[];
}

/**
 * §5.2 — does this estimate ship a client contract?
 *
 * BOTH levels of the toggle, resolved in one read so no caller re-derives it.
 * §5.2 makes this "the single trigger for everything conditional", and a
 * trigger evaluated in three places is three chances to disagree.
 */
export async function clientContractAppliesToEstimate(
  estimateId: string
): Promise<boolean> {
  const supabase = await createClient();

  // RLS scopes `companies` to the caller's own row.
  const { data: company } = await supabase
    .from('companies')
    .select('client_contracts_enabled')
    .maybeSingle();

  const { data: estimate } = await supabase
    .from('estimates')
    .select('include_client_contract')
    .eq('id', estimateId)
    .maybeSingle();

  return clientContractApplies(
    Boolean(company?.client_contracts_enabled),
    Boolean(estimate?.include_client_contract)
  );
}

/**
 * R16 / Q3.2 [S150] — does this project still owe a client-contract signature?
 *
 * ⚠️ THIS IS THE ONE 7I READ A PROJECT MANAGER CAN MAKE. Every
 * `contract_documents` policy is Owner/Admin on SELECT, deliberately: a contract
 * displays contract value, which the Financial Visibility Floor holds at
 * Owner/Admin on every surface. Widening that policy to show a warning was
 * refused. `project_has_unsigned_contract` is SECURITY DEFINER and returns a
 * bare boolean, so a PM learns that paperwork is outstanding and learns nothing
 * else — not the value, not the terms, not how many documents exist.
 *
 * Fails CLOSED. An error here returns false rather than warning on every
 * project, because a warning that appears on jobs which do not owe anything is
 * one users learn to ignore — and then it is not there when it matters.
 */
export async function projectHasUnsignedContract(projectId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('project_has_unsigned_contract', {
    p_project_id: projectId,
  });
  if (error) return false;
  return Boolean(data);
}

/**
 * §6.1 — the badge state for a subcontract.
 *
 * "Set up" means the stage schedule exists, because §6.3 prints that schedule
 * INSIDE the contract: sending before the stages are entered produces a
 * contract with an empty schedule block, which is worse than no contract
 * because it looks complete.
 */
export async function getSubContractBadge(
  subContractId: string
): Promise<SubContractBadge> {
  const supabase = await createClient();

  const { data: contract } = await supabase
    .from('subcontractor_contracts')
    .select('requires_formal_contract')
    .eq('id', subContractId)
    .maybeSingle();
  if (!contract) return 'none';

  // 7C writes a sub's stages as payable `expenses` rows carrying the contract.
  const { data: stages } = await supabase
    .from('expenses')
    .select('id')
    .eq('sub_contract_id', subContractId)
    .eq('is_deleted', false)
    .limit(1);

  const documents = await getContractDocumentsForSubContract(subContractId);
  const live = documents.find((d) => d.status !== 'voided');

  return subContractBadge({
    requiresFormalContract: Boolean(contract.requires_formal_contract),
    hasSchedule: (stages ?? []).length > 0,
    documentStatus: live?.status ?? null,
  });
}
