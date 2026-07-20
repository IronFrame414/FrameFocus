import { createClient } from '@/lib/supabase-browser';
import type { MemberPayRate } from '@/lib/services/pay-rates';
export type { MemberPayRate };

// Effective-dated member pay rates (S85) — client writes for the Owner/Admin
// rate manager. RLS (member_pay_rates_*_admin) is the enforcement; these
// return friendly errors. Untyped-narrowed table access until migration
// 20260721040000 applies and types regenerate (see pay-rates.ts).

type UntypedResult = { data: unknown; error: { message: string; code?: string } | null };
interface UntypedBuilder extends PromiseLike<UntypedResult> {
  insert(values: Record<string, unknown>): UntypedBuilder;
  update(values: Record<string, unknown>): UntypedBuilder;
  eq(column: string, value: unknown): UntypedBuilder;
}
function untypedFrom(client: unknown, table: string): UntypedBuilder {
  return (client as { from: (t: string) => UntypedBuilder }).from(table);
}

type Result = { success: boolean; error?: string };

/**
 * Add an effective-dated rate. The rate applies from effective_date FORWARD;
 * it reprices only unapproved/future sessions — approved sessions keep their
 * frozen snapshot (migration 20260721040000).
 */
export async function addMemberRate(
  memberId: string,
  hourlyRate: number,
  effectiveDate: string // YYYY-MM-DD
): Promise<Result> {
  if (!(hourlyRate >= 0)) return { success: false, error: 'Rate must be zero or more.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
    return { success: false, error: 'Effective date must be a calendar date.' };
  }
  const supabase = createClient();
  const { error } = await untypedFrom(supabase, 'member_pay_rates').insert({
    member_id: memberId,
    hourly_rate: hourlyRate,
    effective_date: effectiveDate,
  });
  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'A rate already exists for that effective date.' };
    }
    return { success: false, error: error.message };
  }
  return { success: true };
}

/** Soft-delete a rate row (trash-bin pattern). Affects only unapproved/future
 *  pricing — approved sessions stay frozen at their snapshots. */
export async function deleteMemberRate(id: string): Promise<Result> {
  const supabase = createClient();
  const { error } = await untypedFrom(supabase, 'member_pay_rates')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
