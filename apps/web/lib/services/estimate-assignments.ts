import { createClient } from '@/lib/supabase-server';

// S119 D-2 — which Project Executive an estimate is assigned to [Josh, 2026-09-29]:
// "I want to be able to assign an estimate to a PE and that is the only one that
// PE can view." One live assignment per estimate (partial unique index); the
// table's RLS lets Owner/Admin read every row and a PE only its own, so these
// reads are scoped by the database, not here.

export interface EstimatePeAccess {
  /** The live assignment's member, or null when no PE is assigned. */
  assignedMemberId: string | null;
  /** Every live Project Executive of the company, for the Owner/Admin picker. */
  executives: { memberId: string; name: string }[];
}

/** Owner/Admin: the current assignment and the PEs it can point at. */
export async function getEstimatePeAccess(estimateId: string): Promise<EstimatePeAccess> {
  const supabase = await createClient();
  const [{ data: live }, { data: pes }] = await Promise.all([
    supabase
      .from('estimate_assignments')
      .select('member_id')
      .eq('estimate_id', estimateId)
      .eq('is_deleted', false)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('id, first_name, last_name, email')
      .eq('role', 'project_executive')
      .eq('is_deleted', false)
      .order('last_name', { ascending: true }),
  ]);
  const profiles = pes ?? [];
  const executives: { memberId: string; name: string }[] = [];
  if (profiles.length > 0) {
    const { data: members } = await supabase
      .from('company_members')
      .select('id, profile_id')
      .in(
        'profile_id',
        profiles.map((p) => p.id)
      )
      .eq('is_deleted', false);
    for (const p of profiles) {
      const m = (members ?? []).find((x) => x.profile_id === p.id);
      if (!m) continue;
      const name =
        `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || (p.email ?? 'Project Executive');
      executives.push({ memberId: m.id, name });
    }
  }
  return { assignedMemberId: live?.member_id ?? null, executives };
}

/** A PE: is this estimate assigned to me? (Decided by pe_assigned_estimate().) */
export async function isEstimateAssignedToMe(estimateId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('pe_assigned_estimate', { p_estimate_id: estimateId });
  if (error) return false;
  return data === true;
}
