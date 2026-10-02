import 'server-only';
import { createClient } from '@/lib/supabase-server';
import { timeEntryFlag } from '@/lib/quickbooks/time-entry-flag';

/**
 * S124 — server reads for the QuickBooks time-export card (Settings →
 * Accounting, both surfaces). Read through the USER'S session: RLS decides
 * (qb_employee_map is Owner/Admin to read; time_clock_sessions as ever).
 */

export interface EmployeeMatchRow {
  memberId: string;
  memberName: string;
  /** The live match in the CONNECTED realm, or null — unmatched days are held. */
  match: { qbEmployeeId: string; qbEmployeeName: string } | null;
}

export interface TimeEntryFlagRow {
  sessionId: string;
  memberName: string;
  clockIn: string;
  message: string;
}

export async function getEmployeeMatches(realmId: string | null): Promise<EmployeeMatchRow[]> {
  if (!realmId) return [];
  const supabase = await createClient();
  const [{ data: members }, { data: matches }] = await Promise.all([
    supabase
      .from('company_members')
      .select('id, display_name')
      .eq('is_deleted', false)
      .order('display_name', { ascending: true }),
    supabase
      .from('qb_employee_map')
      .select('member_id, qb_employee_id, qb_employee_name')
      .eq('realm_id', realmId)
      .eq('is_deleted', false),
  ]);
  const byMember = new Map(
    (matches ?? []).map((m) => [
      m.member_id as string,
      { qbEmployeeId: m.qb_employee_id as string, qbEmployeeName: m.qb_employee_name as string },
    ])
  );
  return (members ?? []).map((m) => ({
    memberId: m.id as string,
    memberName: m.display_name as string,
    match: byMember.get(m.id as string) ?? null,
  }));
}

/** Days changed after they were sent [Josh, RULED Q6 = B]. */
export async function getTimeEntryFlags(): Promise<TimeEntryFlagRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('time_clock_sessions')
    .select(
      'id, clock_in, status, is_deleted, approved_at, qb_time_activity_id, qb_synced_at, ' +
        'member:company_members!time_clock_sessions_member_id_fkey(display_name)'
    )
    .not('qb_time_activity_id', 'is', null)
    .order('clock_in', { ascending: false });
  const out: TimeEntryFlagRow[] = [];
  for (const raw of (data ?? []) as unknown as Array<{
    id: string;
    clock_in: string;
    status: string | null;
    is_deleted: boolean | null;
    approved_at: string | null;
    qb_time_activity_id: string | null;
    qb_synced_at: string | null;
    member: { display_name: string } | null;
  }>) {
    const flag = timeEntryFlag(raw);
    if (flag) {
      out.push({
        sessionId: raw.id,
        memberName: raw.member?.display_name ?? 'Member',
        clockIn: raw.clock_in,
        message: flag.message,
      });
    }
  }
  return out;
}
