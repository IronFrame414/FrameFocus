import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, assertRebuildTest } from './live-session';
import { assertSandbox, SANDBOX_COMPANY_ID } from './qb-sandbox-gate';
import { qboQuery, qboRead, qboWrite } from '@/lib/quickbooks/client';
import { newDrainContext } from '@/lib/quickbooks/entities';
import { handleTimeActivity } from '@/lib/quickbooks/time-activity';
import { memoMatches } from '@/lib/quickbooks/reconcile';
import type { QboConnection } from '@/lib/quickbooks/tokens';
import type { QbQueueRow } from '@/lib/quickbooks/queue';

// ============================================================================
// S124 Part 3 — THE SANDBOX PROOF. Every case, against Intuit's sandbox.
//
// ⚠️ STOP RULE 3: `assertSandbox()` runs in beforeAll and THROWS unless (1) the
// app resolves the sandbox host, (2) the realm is Sandbox Company US cc64's,
// (3) the sandbox host answers 200 "Sandbox Company…", and (4) the production
// host refuses the same token. Nothing below runs otherwise.
//
// The duplicate count is read FROM QUICKBOOKS: how many TimeActivity entries
// carry this session's marker. It must be exactly 1 after every case.
// Everything created in the sandbox is deleted in afterAll.
// ============================================================================

let conn: QboConnection;
let memberId = '';
let qbEmployeeId = '';
let sessionId = '';
const madeSessions: string[] = [];
const madeEntries = new Set<string>();

const row = (op: 'create' | 'update'): QbQueueRow => ({
  id: '00000000-0000-4000-8000-0000000000aa',
  company_id: SANDBOX_COMPANY_ID,
  realm_id: '9341457813274121',
  entity_type: 'time_activity',
  entity_id: sessionId,
  operation: op,
  depends_on_id: null,
  status: 'in_flight',
  attempts: 0,
  next_attempt_at: null,
  last_error: null,
  created_at: null,
});

async function ours(): Promise<Array<{ Id: string; Hours: number; Minutes: number; SyncToken: string }>> {
  const r = (await qboQuery(
    admin,
    conn,
    "select * from TimeActivity where TxnDate >= '2026-06-24' and TxnDate <= '2026-07-08' maxresults 1000"
  )) as { QueryResponse?: { TimeActivity?: Array<{ Id: string; Description?: string; Hours: number; Minutes: number; SyncToken: string }> } };
  const list = (r.QueryResponse?.TimeActivity ?? []).filter((e) => memoMatches(e.Description, sessionId));
  list.forEach((e) => madeEntries.add(e.Id));
  return list;
}

async function sessionRow() {
  const { data } = await admin
    .from('time_clock_sessions')
    .select('qb_time_activity_id, qb_push_status')
    .eq('id', sessionId)
    .single();
  return data!;
}

beforeAll(async () => {
  assertRebuildTest();
  const proof = await assertSandbox(admin, SANDBOX_COMPANY_ID);
  conn = proof.conn;
  console.log(`[s124-sandbox] ${proof.companyName}: sandbox ${proof.sandboxStatus}, production ${proof.productionStatus}`);

  const emps = (await qboQuery(admin, conn, 'select * from Employee where Active = true maxresults 1')) as {
    QueryResponse?: { Employee?: Array<{ Id: string; DisplayName: string }> };
  };
  const emp = emps.QueryResponse?.Employee?.[0];
  if (!emp) throw new Error('The sandbox company has no active Employee to match.');
  qbEmployeeId = emp.Id;

  const { data: m } = await admin
    .from('company_members')
    .select('id')
    .eq('company_id', SANDBOX_COMPANY_ID)
    .eq('display_name', 'Casey Crew')
    .single();
  memberId = m!.id as string;
  await admin
    .from('qb_employee_map')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('company_id', SANDBOX_COMPANY_ID)
    .eq('member_id', memberId)
    .eq('is_deleted', false);
  const { error } = await admin.from('qb_employee_map').insert({
    company_id: SANDBOX_COMPANY_ID,
    realm_id: conn.realmId,
    member_id: memberId,
    qb_employee_id: qbEmployeeId,
    qb_employee_name: emp.DisplayName,
  });
  if (error) throw new Error(`match failed: ${error.message}`);

  await admin.from('companies').update({ qb_time_export_enabled: true }).eq('id', SANDBOX_COMPANY_ID);

  const { data: s, error: se } = await admin
    .from('time_clock_sessions')
    .insert({
      company_id: SANDBOX_COMPANY_ID,
      member_id: memberId,
      clock_in: '2026-07-01T12:00:00.000Z',
      clock_out: '2026-07-01T20:00:00.000Z',
      status: 'approved',
      approved_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (se) throw new Error(`seed session failed: ${se.message}`);
  sessionId = s!.id as string;
  madeSessions.push(sessionId);
});

afterAll(async () => {
  // Delete what this run put in the SANDBOX, then the local fixtures.
  for (const id of madeEntries) {
    try {
      const r = (await qboRead(admin, conn, `/timeactivity/${id}`)) as { TimeActivity?: { SyncToken: string } };
      if (r.TimeActivity) await qboWrite(conn, '/timeactivity?operation=delete', { Id: id, SyncToken: r.TimeActivity.SyncToken });
    } catch (err) {
      console.error(`[s124-sandbox] could not delete sandbox TimeActivity ${id}:`, (err as Error).message);
    }
  }
  await admin.from('companies').update({ qb_time_export_enabled: false }).eq('id', SANDBOX_COMPANY_ID);
  await admin.from('qb_sync_queue').delete().in('entity_id', madeSessions);
  await admin
    .from('time_clock_sessions')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .in('id', madeSessions);
  await admin
    .from('qb_employee_map')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('company_id', SANDBOX_COMPANY_ID)
    .eq('member_id', memberId)
    .eq('is_deleted', false);
});

describe('S124 Part 3 — the sandbox, every case', () => {
  it('CREATE: the first approval makes exactly ONE entry, 8h00m, and stores its id', async () => {
    const ctx = newDrainContext(admin, conn, SANDBOX_COMPANY_ID);
    expect(await handleTimeActivity(ctx, row('create'))).toEqual({ kind: 'pushed' });
    const list = await ours();
    expect(list.length).toBe(1);
    expect([list[0].Hours, list[0].Minutes]).toEqual([8, 0]);
    expect(await sessionRow()).toEqual({ qb_time_activity_id: list[0].Id, qb_push_status: 'pushed' });
  });

  it('EDIT → re-approval: an UPDATE of the same entry (count 1, hours change, SyncToken advances)', async () => {
    const before = (await ours())[0];
    await admin.from('time_clock_sessions').update({ clock_out: '2026-07-01T21:00:00.000Z' }).eq('id', sessionId);
    await admin.from('time_clock_sessions').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', sessionId);
    const ctx = newDrainContext(admin, conn, SANDBOX_COMPANY_ID);
    expect(await handleTimeActivity(ctx, row('update'))).toEqual({ kind: 'pushed' });
    const list = await ours();
    expect(list.length).toBe(1);
    expect(list[0].Id).toBe(before.Id);
    expect([list[0].Hours, list[0].Minutes]).toEqual([9, 0]);
    expect(Number(list[0].SyncToken)).toBeGreaterThan(Number(before.SyncToken));
  });

  it('SPLIT and ADD → re-approval: still ONE entry; an added 30-min break takes it to 8h30m', async () => {
    await admin.from('time_segments').insert({
      company_id: SANDBOX_COMPANY_ID,
      session_id: sessionId,
      segment_type: 'break',
      segment_start: '2026-07-01T16:00:00.000Z',
      segment_end: '2026-07-01T16:30:00.000Z',
    });
    await admin.from('time_clock_sessions').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', sessionId);
    const ctx = newDrainContext(admin, conn, SANDBOX_COMPANY_ID);
    expect(await handleTimeActivity(ctx, row('update'))).toEqual({ kind: 'pushed' });
    const list = await ours();
    expect(list.length).toBe(1);
    expect([list[0].Hours, list[0].Minutes]).toEqual([8, 30]);
  });

  it('⚠️ id NULL but the entry EXISTS in QuickBooks: the marker finds it — ONE entry, the id is re-adopted', async () => {
    const existing = (await ours())[0];
    await admin
      .from('time_clock_sessions')
      .update({ qb_time_activity_id: null, qb_push_status: 'not_pushed' })
      .eq('id', sessionId);
    const ctx = newDrainContext(admin, conn, SANDBOX_COMPANY_ID);
    expect(await handleTimeActivity(ctx, row('create'))).toEqual({ kind: 'pushed' });
    const list = await ours();
    expect(list.length).toBe(1);
    expect((await sessionRow()).qb_time_activity_id).toBe(existing.Id);
  });

  it('a push that never succeeded (queued/failed/terminal) re-runs the SAME decision: ONE entry', async () => {
    // The queue row's attempts and status do not steer the handler — the stored
    // id and the marker do. Re-running with attempts=8 must not create.
    const ctx = newDrainContext(admin, conn, SANDBOX_COMPANY_ID);
    expect(await handleTimeActivity(ctx, { ...row('create'), attempts: 8 })).toEqual({ kind: 'pushed' });
    expect((await ours()).length).toBe(1);
  });
});
