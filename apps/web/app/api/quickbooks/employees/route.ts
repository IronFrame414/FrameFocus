import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { qboQuery } from '@/lib/quickbooks/client';
import { getAccessToken } from '@/lib/quickbooks/tokens';

/**
 * S124 Part 1 — match crew members to QuickBooks Employees.
 *
 * ⚠️ [Josh, RULED Q2 = A] AN EXPLICIT MATCH, CHOSEN BY A PERSON. Anyone
 * unmatched is held and never sent. THIS ROUTE NEVER CREATES AN EMPLOYEE —
 * "auto-creating payroll records is far outside what this build is authorised
 * to do." It lists what QuickBooks already holds and stores the Owner's choice.
 *
 * ⚠️ OWNER ONLY [Josh, RULED Q4 = A]. The match is written through the user's
 * OWN session, so `qb_employee_map`'s owner-only INSERT/UPDATE policies judge
 * the real caller; the check below is the second layer. One member per
 * Employee is a unique index — two people on one Employee would pay one for
 * the other's hours.
 */

export const dynamic = 'force-dynamic';

async function requireOwner() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id, role')
    .eq('user_id', user.id)
    .single();

  if (!profile || profile.role !== 'owner') {
    console.error(`[qb-employees] denied: user=${user.id} role=${profile?.role ?? 'none'}.`);
    return {
      error: NextResponse.json(
        { error: 'Only the Owner can match people to QuickBooks employees.' },
        { status: 403 }
      ),
    };
  }
  return { supabase, companyId: profile.company_id as string };
}

/** List ACTIVE QuickBooks Employees. Costs one metered read. */
export async function GET() {
  const gate = await requireOwner();
  if ('error' in gate) return gate.error;

  const admin = getSupabaseAdmin();
  const conn = await getAccessToken(admin, gate.companyId);
  if (!conn) {
    return NextResponse.json(
      { error: 'QuickBooks is not connected, or needs to be reconnected.' },
      { status: 409 }
    );
  }
  const result = (await qboQuery(
    admin,
    conn,
    'select * from Employee where Active = true maxresults 1000'
  )) as { QueryResponse?: { Employee?: Array<{ Id: string; DisplayName?: string }> } };
  const employees = (result.QueryResponse?.Employee ?? [])
    .map((e) => ({ id: e.Id, name: e.DisplayName ?? `Employee ${e.Id}` }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return NextResponse.json({ employees });
}

/** Store (or clear, with qbEmployeeId null) one member's match in the connected realm. */
export async function POST(request: NextRequest) {
  const gate = await requireOwner();
  if ('error' in gate) return gate.error;

  let body: { memberId?: unknown; qbEmployeeId?: unknown; qbEmployeeName?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  }
  const memberId = typeof body.memberId === 'string' ? body.memberId : null;
  const qbEmployeeId = typeof body.qbEmployeeId === 'string' && body.qbEmployeeId ? body.qbEmployeeId : null;
  const qbEmployeeName = typeof body.qbEmployeeName === 'string' ? body.qbEmployeeName.trim() : '';
  if (!memberId || (qbEmployeeId && !qbEmployeeName)) {
    return NextResponse.json({ error: 'A member, and an employee id with its name, are required.' }, { status: 400 });
  }

  const { supabase, companyId } = gate;
  const { data: company } = await supabase
    .from('companies')
    .select('qb_realm_id, qb_connection_state')
    .eq('id', companyId)
    .single();
  if (!company?.qb_realm_id || company.qb_connection_state !== 'connected') {
    return NextResponse.json({ error: 'Connect QuickBooks first.' }, { status: 409 });
  }
  const realmId = company.qb_realm_id as string;

  // Retire the member's current match (soft delete), then add the new one.
  const { error: retireError } = await supabase
    .from('qb_employee_map')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('realm_id', realmId)
    .eq('member_id', memberId)
    .eq('is_deleted', false);
  if (retireError) {
    console.error(`[qb-employees] retire failed company=${companyId} member=${memberId}:`, retireError.message);
    return NextResponse.json({ error: 'The match could not be changed.' }, { status: 500 });
  }
  if (!qbEmployeeId) return NextResponse.json({ ok: true, matched: false });

  const { error } = await supabase.from('qb_employee_map').insert({
    company_id: companyId,
    realm_id: realmId,
    member_id: memberId,
    qb_employee_id: qbEmployeeId,
    qb_employee_name: qbEmployeeName,
  });
  if (error) {
    console.error(`[qb-employees] match failed company=${companyId} member=${memberId} code=${error.code}:`, error.message);
    if (error.code === '23505') {
      return NextResponse.json(
        { error: `${qbEmployeeName} is already matched to another person. Clear that match first.` },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: 'The match could not be saved.' }, { status: 500 });
  }

  // Wake any day parked on "not matched", so it goes on the next drain.
  await getSupabaseAdmin()
    .from('qb_sync_queue')
    .update({ next_attempt_at: null })
    .eq('company_id', companyId)
    .eq('entity_type', 'time_activity')
    .eq('status', 'queued')
    .eq('is_deleted', false);

  return NextResponse.json({ ok: true, matched: true });
}
