import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, assertRebuildTest } from './live-session';

// ============================================================================
// S124 Part 1 — the enqueue trigger on rebuild-test. NOTHING HERE CALLS
// QUICKBOOKS: the trigger only writes qb_sync_queue, and rebuild-test has no
// worker cron. Queue rows are counted with the service role.
//
//   1. switch OFF (the default) → an approval queues NOTHING;
//   2. switch ON → an approval queues exactly ONE time_activity:create;
//   3. ⚠️ NO BACKFILL: a day approved while the switch was off stays unqueued
//      after it goes on (stop rule 10);
//   4. a re-approval of a day that carries qb_time_activity_id queues an
//      UPDATE, never a create (stop rule 5);
//   5. an approval that is not a transition (approved → approved) queues nothing.
// Every fixture is removed in afterAll; the switch is left OFF and read back.
// ============================================================================

const SABAL = '03bb903f-1084-4ab4-afb8-03192cb58d30';
let memberId = '';
const made: string[] = [];

async function setSwitch(on: boolean) {
  const { error } = await admin.from('companies').update({ qb_time_export_enabled: on }).eq('id', SABAL);
  if (error) throw new Error(`switch ${on} failed: ${error.message}`);
}

async function newSession(dayOffset: number): Promise<string> {
  const start = new Date(Date.UTC(2026, 6, 1 + dayOffset, 12, 0, 0));
  const { data, error } = await admin
    .from('time_clock_sessions')
    .insert({
      company_id: SABAL,
      member_id: memberId,
      clock_in: start.toISOString(),
      clock_out: new Date(start.getTime() + 8 * 3_600_000).toISOString(),
      status: 'pending',
    })
    .select('id')
    .single();
  if (error) throw new Error(`seed session failed: ${error.message}`);
  made.push(data!.id as string);
  return data!.id as string;
}

async function approve(id: string) {
  const { error } = await admin
    .from('time_clock_sessions')
    .update({ status: 'approved', approved_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`approve failed: ${error.message}`);
}

async function queueOf(id: string): Promise<string[]> {
  const { data, error } = await admin
    .from('qb_sync_queue')
    .select('entity_type, operation, status')
    .eq('company_id', SABAL)
    .eq('entity_id', id);
  if (error) throw new Error(`queue read failed: ${error.message}`);
  return (data ?? []).map((r) => `${r.entity_type}:${r.operation}:${r.status}`).sort();
}

beforeAll(async () => {
  assertRebuildTest();
  const { data } = await admin
    .from('company_members')
    .select('id')
    .eq('company_id', SABAL)
    .eq('display_name', 'Casey Crew')
    .eq('is_deleted', false)
    .single();
  memberId = data!.id as string;
  await setSwitch(false);
});

afterAll(async () => {
  await setSwitch(false);
  if (made.length) {
    await admin.from('qb_sync_queue').delete().in('entity_id', made);
    await admin
      .from('time_clock_sessions')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .in('id', made);
  }
  const { data } = await admin.from('companies').select('qb_time_export_enabled').eq('id', SABAL).single();
  expect(data?.qb_time_export_enabled).toBe(false);
  const { count } = await admin
    .from('qb_sync_queue')
    .select('id', { count: 'exact', head: true })
    .in('entity_id', made.length ? made : ['00000000-0000-0000-0000-000000000000']);
  expect(count).toBe(0);
});

describe('S124 Part 1 — approvals → qb_sync_queue, gated', () => {
  let approvedWhileOff = '';

  it('switch OFF: an approval queues NOTHING', async () => {
    approvedWhileOff = await newSession(0);
    await approve(approvedWhileOff);
    expect(await queueOf(approvedWhileOff)).toEqual([]);
  });

  it('switch ON: an approval queues exactly one time_activity:create', async () => {
    await setSwitch(true);
    const id = await newSession(1);
    await approve(id);
    expect(await queueOf(id)).toEqual(['time_activity:create:queued']);
  });

  it('⚠️ NO BACKFILL: the day approved while OFF is still unqueued after the switch went ON', async () => {
    expect(await queueOf(approvedWhileOff)).toEqual([]);
  });

  it('re-approval of a day that carries a QuickBooks id queues an UPDATE, never a create', async () => {
    const id = await newSession(2);
    // As the connector would have left it after a push.
    await admin
      .from('time_clock_sessions')
      .update({ qb_time_activity_id: 'QB-777', qb_push_status: 'pushed', qb_synced_at: new Date().toISOString() })
      .eq('id', id);
    await approve(id);
    expect(await queueOf(id)).toEqual(['time_activity:update:queued']);
  });

  it('an update that is not a transition into approved queues nothing more', async () => {
    const id = await newSession(3);
    await approve(id);
    expect(await queueOf(id)).toEqual(['time_activity:create:queued']);
    await admin.from('time_clock_sessions').update({ status: 'approved' }).eq('id', id);
    expect(await queueOf(id)).toEqual(['time_activity:create:queued']);
  });
});
