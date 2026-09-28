import { createClient } from '@/lib/supabase-server';

// [S114 PART B, RULED Josh R3] — SERVER READS for the project's "Exclude from
// QuickBooks" control. Both run under the caller's session, so RLS decides:
// `project_qb_exclusions` is readable by Owner and Admin only; everyone else
// gets null here (and is never shown the control — qbExclusionAccess()).

export interface ProjectQbExclusion {
  excludedAt: string;
  excludedByName: string | null;
}

/** The project's LIVE exclusion, or null (none, or the caller may not see it). */
export async function getProjectQbExclusion(projectId: string): Promise<ProjectQbExclusion | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('project_qb_exclusions')
    .select('created_at, created_by')
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .maybeSingle();
  if (!data) return null;
  let name: string | null = null;
  if (data.created_by) {
    const { data: p } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('user_id', data.created_by)
      .maybeSingle();
    name = p ? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || null : null;
  }
  return { excludedAt: data.created_at as string, excludedByName: name };
}

/**
 * [Q17 c] How many of this project's records are ALREADY in QuickBooks — they
 * are left alone by an exclusion and so stop being updated there. Counted
 * from the link columns the worker writes. Payments are per client, so a
 * payment counts here if it is applied to any of this project's invoices.
 */
export async function countQbLinkedRecords(projectId: string): Promise<number> {
  const supabase = await createClient();
  const head = { count: 'exact' as const, head: true };
  const [inv, exp, ref, pay] = await Promise.all([
    supabase
      .from('invoices')
      .select('id', head)
      .eq('project_id', projectId)
      .not('qb_invoice_id', 'is', null),
    supabase
      .from('expenses')
      .select('id', head)
      .eq('project_id', projectId)
      .not('qb_purchase_id', 'is', null),
    supabase
      .from('client_refunds')
      .select('id', head)
      .eq('project_id', projectId)
      .not('qb_refund_id', 'is', null),
    supabase
      .from('client_payment_applications')
      .select(
        'payment_id, invoice:invoices!inner(project_id), payment:client_payments!inner(qb_payment_id)'
      )
      .eq('invoice.project_id', projectId)
      .not('payment.qb_payment_id', 'is', null)
      .eq('is_deleted', false),
  ]);
  const payments = new Set(((pay.data ?? []) as { payment_id: string }[]).map((r) => r.payment_id))
    .size;
  return (inv.count ?? 0) + (exp.count ?? 0) + (ref.count ?? 0) + payments;
}
