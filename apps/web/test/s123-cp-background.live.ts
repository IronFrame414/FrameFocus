/**
 * S123 D-3 — NOTIFICATIONS AFTER THE RESPONSE; THE UNREACHABLE LIST NEVER LOST.
 * lib/critical-path/{notify,recompute,background}.ts. [Josh, RULED 2026-10-02]
 *
 * The mail send is replaced by a GATE this test opens and closes (vi.mock of
 * sendEmail only — nothing here can reach a real mailbox, and the real send
 * gate is never consulted). With the gate SHUT, a send hangs:
 *
 *   ⚠️ P1  the save RETURNS while the email is still unsent — and at that moment
 *          the unreachable member is already named (the popup's `untold`) AND
 *          the saver's "Not everyone could be told" row already EXISTS (D-3a:
 *          the durable path is written inside the save). 0 email_logs rows yet.
 *          Open the gate → the email is logged 'sent'.
 *   ⚠️ P2  THE TIME LIMIT: with the deadline 3 s away (< the 5 s margin) the
 *          email is NOT started and a 'failed' row says why; with it 6 s away and
 *          the send hanging, the send is abandoned at deadline − 2 s and a
 *          'failed' row says it may still have gone. Never no row.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';

const gate = vi.hoisted(() => {
  const g = {
    shut: false,
    calls: 0,
    waiting: [] as (() => void)[],
    open() {
      g.shut = false;
      for (const w of g.waiting.splice(0)) w();
    },
  };
  return g;
});
vi.mock('@/lib/services/email-service', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/services/email-service')>();
  return {
    ...real,
    sendEmail: async () => {
      gate.calls += 1;
      if (gate.shut) await new Promise<void>((res) => gate.waiting.push(res));
      return { messageId: `s123-test-${gate.calls}`, error: null };
    },
  };
});

import { recomputeProject } from '@/lib/critical-path/recompute';
import { applyCriticalPathSave, untoldOf } from '@/lib/critical-path/save';
import { settleBackground } from '@/lib/critical-path/background';
import { DEADLINE_MARGIN_MS, deliverScheduleNotify, planScheduleNotify } from '@/lib/critical-path/notify';
import { admin, assertRebuildTest, deleteProjects, sessionFor, sweepProjectsNamed } from './live-session';

const MARKER = 'S123CPB';
const OWNER = 'josh+test50@worthprop.com';
const db = admin as unknown as SupabaseClient<Database>;
let owner: SupabaseClient<Database>;
let companyId = '';
let projectId = '';
let taskT = '';
let ownerMember = '';
let ownerProfile = '';
let emailOnly = '';
let emailOnlyAddress = '';
let unreachable = '';
let unreachableName = '';

const must = (label: string, error: { message: string } | null) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};

async function purge(id: string) {
  const { data: ts } = await admin.from('tasks').select('id').eq('project_id', id);
  const ids = (ts ?? []).map((r) => r.id as string);
  await admin.from('notifications').delete().eq('project_id', id);
  await admin.from('project_finish_history').delete().eq('project_id', id);
  await admin.from('project_schedule_settings').delete().eq('project_id', id);
  if (ids.length) {
    await admin.from('task_assignees').delete().in('task_id', ids);
    await admin.from('tasks').delete().in('id', ids);
  }
  await admin.from('project_assignments').delete().eq('project_id', id);
  await deleteProjects(admin, [id]);
}

/** This project's email_logs rows to the email-only member, newest last. */
async function subLogs(since: string) {
  const { data } = await admin
    .from('email_logs')
    .select('status, resend_message_id, metadata')
    .eq('email_type', 'schedule_change')
    .eq('recipient_email', emailOnlyAddress)
    .gte('created_at', since)
    .order('created_at', { ascending: true });
  return ((data ?? []) as { status: string; resend_message_id: string | null; metadata: Record<string, unknown> }[]).filter(
    (r) => r.metadata.project_id === projectId
  );
}
async function reportRows() {
  const { count } = await admin
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .eq('recipient_profile_id', ownerProfile)
    .eq('title', 'Not everyone could be told about your schedule change');
  return count ?? 0;
}

beforeAll(async () => {
  assertRebuildTest();
  const { data: stale } = await admin.from('projects').select('id').like('name', `${MARKER}%`);
  for (const r of stale ?? []) await purge(r.id as string);
  await sweepProjectsNamed(MARKER);
  owner = (await sessionFor(OWNER)) as SupabaseClient<Database>;
  const { data: p } = await admin.from('profiles').select('id, company_id').eq('email', OWNER).single();
  ownerProfile = (p as { id: string }).id;
  companyId = (p as { company_id: string }).company_id;
  const { data: om } = await admin.from('company_members').select('id').eq('profile_id', ownerProfile).eq('is_deleted', false).single();
  ownerMember = (om as { id: string }).id;

  // One email-only member and one unreachable member, in a stable order.
  const { data: eo } = await admin
    .from('company_members')
    .select('id, sub:subcontractors!subcontractors_member_id_fkey!inner(email, is_deleted)')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .is('profile_id', null)
    .not('sub.email', 'is', null)
    .eq('sub.is_deleted', false)
    .order('id', { ascending: true })
    .limit(1);
  expect(eo?.length ?? 0, 'an email-only member exists (a test on zero rows proves nothing)').toBe(1);
  emailOnly = eo![0].id as string;
  const sub = (eo![0] as unknown as { sub: { email: string }[] | { email: string } }).sub;
  emailOnlyAddress = (Array.isArray(sub) ? sub[0] : sub).email;
  const { data: cands } = await admin
    .from('company_members')
    .select('id, display_name')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .is('profile_id', null)
    .order('id', { ascending: true })
    .limit(50);
  for (const c of cands ?? []) {
    const { data: s } = await admin.from('subcontractors').select('email').eq('member_id', c.id).eq('is_deleted', false).not('email', 'is', null);
    if (!s || s.length === 0) {
      unreachable = c.id as string;
      unreachableName = c.display_name as string;
      break;
    }
  }
  expect(unreachable, 'an unreachable member exists').not.toBe('');

  const { data: ct } = await admin
    .from('contacts')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .single();
  const { data: seqRow } = await admin
    .from('projects')
    .select('project_internal_seq')
    .eq('company_id', companyId)
    .order('project_internal_seq', { ascending: false })
    .limit(1)
    .single();
  const { data: proj, error } = await admin
    .from('projects')
    .insert({
      company_id: companyId,
      contact_id: (ct as { id: string }).id,
      name: `${MARKER} background`,
      status: 'active',
      project_number: `PRJ-${MARKER}`,
      project_internal_seq: (seqRow!.project_internal_seq as number) + 9800,
      start_date: '2027-01-04',
    })
    .select('id')
    .single();
  must('project', error);
  projectId = proj!.id as string;
  must('assign', (await admin.from('project_assignments').insert({ company_id: companyId, project_id: projectId, member_id: ownerMember })).error);
  const { data: t, error: tErr } = await admin
    .from('tasks')
    .insert({ company_id: companyId, project_id: projectId, title: `${MARKER} T`, duration_days: 3 })
    .select('id')
    .single();
  must('task', tErr);
  taskT = t!.id as string;
  for (const mid of [emailOnly, unreachable]) {
    must('assignee', (await admin.from('task_assignees').insert({ company_id: companyId, task_id: taskT, member_id: mid, notify_changes: true })).error);
  }
  // The client box stays OFF: the email-only member is the one email in play.
  must('cp on', (await admin.from('project_schedule_settings').insert({ company_id: companyId, project_id: projectId, critical_path_enabled: true })).error);
  // The first computation, gate OPEN, then settled and cleared, so every count below is this file's.
  expect(await recomputeProject(db, projectId, { cause: { kind: 'enabled' } })).toMatchObject({ status: 'computed' });
  await settleBackground();
  await admin.from('notifications').delete().eq('project_id', projectId);
}, 300_000);

afterAll(async () => {
  gate.open();
  await settleBackground();
  if (projectId) await purge(projectId);
  const { count } = await admin.from('projects').select('id', { count: 'exact', head: true }).like('name', `${MARKER}%`);
  expect(count ?? 0).toBe(0);
}, 300_000);

describe('⚠️ P1 — the save returns BEFORE the email is sent; the unreachable list is already safe', () => {
  let since = '';
  let saved: Awaited<ReturnType<typeof applyCriticalPathSave>> | 'timed out' = 'timed out';
  let callsAtReturn = -1;
  let logsAtReturn = -1;
  let reportsAtReturn = -1;

  beforeAll(async () => {
    expect(await reportRows(), 'the control: no report row before the save').toBe(0);
    since = new Date().toISOString();
    gate.shut = true;
    const calls = gate.calls;
    // If the save waited for the send, it would never return while the gate is shut: 15 s says so.
    saved = await Promise.race([
      applyCriticalPathSave(owner, db, { projectId, taskId: taskT, companyId, userId: '', savedByMemberId: ownerMember }, { duration_days: 5 }),
      new Promise<'timed out'>((res) => setTimeout(() => res('timed out'), 15_000)),
    ]);
    // Read IMMEDIATELY, with the gate still shut.
    reportsAtReturn = await reportRows();
    logsAtReturn = (await subLogs(since)).length;
    // The send was STARTED in the background and is now held at the gate.
    await vi.waitFor(() => expect(gate.calls).toBe(calls + 1), { timeout: 10_000 });
    callsAtReturn = gate.calls - calls;
  }, 120_000);

  it('the save returned (it did not wait for the mail) and the change landed', async () => {
    expect(saved, 'the save waited for the email').not.toBe('timed out');
    expect(saved).toMatchObject({ ok: true, held: false });
    const { data } = await admin.from('tasks').select('duration_days, due_date').eq('id', taskT).single();
    expect(data).toEqual({ duration_days: 5, due_date: '2027-01-08' });
  });

  it('the popup fast path: the route-level `untold` names the unreachable member at once', () => {
    if (saved === 'timed out' || !saved.ok) throw new Error('no save');
    expect(untoldOf(saved.recompute)).toEqual({ names: [unreachableName], client: false });
  });

  it('⚠️ D-3a: the saver\'s report row EXISTED when the save returned (written inside it, not after)', () => {
    expect(reportsAtReturn).toBe(1);
  });

  it('⚠️ and the email had NOT been logged when the save returned (it was still at the gate)', () => {
    expect(callsAtReturn).toBe(1);
    expect(logsAtReturn).toBe(0);
  });

  it('the gate opens → the background finishes → ONE email_logs row, sent', async () => {
    gate.open();
    await settleBackground();
    const rows = await subLogs(since);
    expect(rows.map((r) => r.status)).toEqual(['sent']);
    expect(rows[0].resend_message_id).toMatch(/^s123-test-/);
  });
});

describe('⚠️ P2 — the function time limit never makes an email vanish', () => {
  async function planOnce() {
    const plan = await planScheduleNotify(db, {
      companyId,
      projectId,
      changedTaskIds: [taskT],
      savedByMemberId: ownerMember,
      previousFinish: null,
      newFinish: null,
      causeKind: 'task',
    });
    expect(plan?.email.map((e) => e.email), 'the plan holds the one email-only member').toEqual([emailOnlyAddress]);
    return plan!;
  }

  it(`deadline 3 s away (< the ${DEADLINE_MARGIN_MS / 1000} s margin): NOT started, and a 'failed' row says why`, async () => {
    const since = new Date().toISOString();
    const calls = gate.calls;
    const out = await deliverScheduleNotify(db, await planOnce(), { deadline: () => new Date(Date.now() + 3_000) });
    expect(out).toMatchObject({ emailed: 0, notSent: 1 });
    expect(gate.calls, 'no send was started').toBe(calls);
    const rows = await subLogs(since);
    expect(rows.map((r) => r.status)).toEqual(['failed']);
    expect(String(rows[0].metadata.error)).toMatch(/^not sent: the function time limit was \ds away$/);
  });

  it("deadline 6 s away and the send HANGS: abandoned at deadline − 2 s, and a 'failed' row says it may have gone", async () => {
    const since = new Date().toISOString();
    gate.shut = true;
    const t0 = Date.now();
    const out = await deliverScheduleNotify(db, await planOnce(), { deadline: () => new Date(t0 + 6_000) });
    const took = Date.now() - t0;
    gate.open();
    expect(out).toMatchObject({ emailed: 0, notSent: 0 });
    expect(took, 'it gave up before the deadline').toBeLessThan(6_000);
    const rows = await subLogs(since);
    expect(rows.map((r) => r.status)).toEqual(['failed']);
    expect(String(rows[0].metadata.error)).toBe('no answer from the mail service before the function time limit; it may still have been sent');
  }, 30_000);

  it('CONTROL: no deadline (off Vercel) and the gate open → sent', async () => {
    const since = new Date().toISOString();
    const out = await deliverScheduleNotify(db, await planOnce(), { deadline: () => undefined });
    expect(out).toMatchObject({ emailed: 1, notSent: 0 });
    expect((await subLogs(since)).map((r) => r.status)).toEqual(['sent']);
  });
});
