import { createClient } from '@/lib/supabase-browser';
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
