import { createClient } from '@/lib/supabase-server';
import type { Database } from '@framefocus/shared/types/database';

export type ContractStatus = 'draft' | 'sent' | 'signed' | 'void';

type ClientContractRow = Database['public']['Tables']['client_contracts']['Row'];
export type ClientContract = Omit<ClientContractRow, 'status'> & {
  status: ContractStatus;
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

  const { data, error } = await supabase
    .from('client_contracts')
    .select('*')
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .order('executed_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) return [];
  return (data ?? []) as ClientContract[];
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
