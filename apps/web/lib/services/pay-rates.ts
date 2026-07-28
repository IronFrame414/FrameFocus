import { createClient } from '@/lib/supabase-server';

// ============================================================================
// Effective-dated member pay rates (S85) — server reads.
// RLS: member_pay_rates and time_session_rate_snapshots are Owner/Admin-only
// (Financial Visibility Floor); for any other role these reads return [] and
// pricing simply doesn't happen.
//
// NOTE: both tables are absent from the generated Database types until
// migration 20260721040000 applies and `npm run db:push` regenerates them —
// calls go through an unknown-narrowed builder (no `any`, per repo
// convention; same pattern as the approve_member_week RPC). Swap to typed
// calls after regen.
// ============================================================================

type UntypedResult = { data: unknown; error: { message: string } | null };
interface UntypedBuilder extends PromiseLike<UntypedResult> {
  select(columns?: string): UntypedBuilder;
  eq(column: string, value: unknown): UntypedBuilder;
  in(column: string, values: unknown[]): UntypedBuilder;
  order(column: string, opts?: { ascending?: boolean }): UntypedBuilder;
}
function untypedFrom(client: unknown, table: string): UntypedBuilder {
  return (client as { from: (t: string) => UntypedBuilder }).from(table);
}

export interface MemberPayRate {
  id: string;
  member_id: string;
  hourly_rate: number;
  effective_date: string; // YYYY-MM-DD, company-tz calendar date
  created_at: string;
}

const RATE_COLUMNS = 'id, member_id, hourly_rate, effective_date, created_at';

/** One member's rate history, newest effective_date first. */
export async function getMemberRates(memberId: string): Promise<MemberPayRate[]> {
  const supabase = await createClient();
  const { data, error } = await untypedFrom(supabase, 'member_pay_rates')
    .select(RATE_COLUMNS)
    .eq('member_id', memberId)
    .eq('is_deleted', false)
    .order('effective_date', { ascending: false });
  if (error || !data) return [];
  return data as MemberPayRate[];
}

/** Every live rate row in the company (the KPI's pricing input). */
export async function getCompanyRates(): Promise<MemberPayRate[]> {
  const supabase = await createClient();
  const { data, error } = await untypedFrom(supabase, 'member_pay_rates')
    .select(RATE_COLUMNS)
    .eq('is_deleted', false)
    .order('effective_date', { ascending: false });
  if (error || !data) return [];
  return data as MemberPayRate[];
}

/**
 * Frozen approval-time rates for a set of sessions. Missing key = session has
 * no snapshot (approved before the pay-rate migration) — treated exactly like
 * a frozen NULL rate: unpriceable, never repriced (decision 5).
 */
export async function getSessionRateSnapshots(
  sessionIds: string[]
): Promise<Record<string, number | null>> {
  if (sessionIds.length === 0) return {};
  const supabase = await createClient();
  const { data, error } = await untypedFrom(supabase, 'time_session_rate_snapshots')
    .select('session_id, hourly_rate')
    .in('session_id', sessionIds);
  if (error || !data) return {};
  const out: Record<string, number | null> = {};
  for (const row of data as { session_id: string; hourly_rate: number | null }[]) {
    out[row.session_id] = row.hourly_rate === null ? null : Number(row.hourly_rate);
  }
  return out;
}

/**
 * Pure lookup: the rate effective for a member on a company-tz calendar date
 * (latest effective_date <= the date). Mirrors the SQL in the snapshot
 * trigger.
 */
export function rateEffectiveOn(
  rates: MemberPayRate[],
  memberId: string,
  ymd: string
): number | null {
  let best: MemberPayRate | null = null;
  for (const r of rates) {
    if (r.member_id !== memberId || r.effective_date > ymd) continue;
    if (!best || r.effective_date > best.effective_date) best = r;
  }
  return best ? Number(best.hourly_rate) : null;
}

// ----------------------------------------------------------------------------
// 7A labor burden (7A-spec §2.6) — same floor as rates: member_burden_settings
// is Owner/Admin-only RLS; other roles read []. Burden is FROZEN into the
// approval snapshot (forward-only) — these live settings price only FUTURE
// approvals. Typed calls: the table is in the regenerated database.ts.
// ----------------------------------------------------------------------------

export type BurdenSource = 'member_multiplier' | 'company_fixed';

export interface MemberBurdenSettings {
  id: string;
  member_id: string;
  burden_multiplier: number;
  burden_source: BurdenSource;
}

/** One member's burden row (null = no row yet = pass-through pricing). */
export async function getMemberBurden(memberId: string): Promise<MemberBurdenSettings | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('member_burden_settings')
    .select('id, member_id, burden_multiplier, burden_source')
    .eq('member_id', memberId)
    .eq('is_deleted', false)
    .maybeSingle();
  if (error || !data) return null;
  return data as MemberBurdenSettings;
}

/** Every live burden row in the company (the burden manager's list input). */
export async function getCompanyBurdenSettings(): Promise<MemberBurdenSettings[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('member_burden_settings')
    .select('id, member_id, burden_multiplier, burden_source')
    .eq('is_deleted', false);
  if (error || !data) return [];
  return data as MemberBurdenSettings[];
}
