/**
 * S122 Part 6 — who is told when a Critical Path change moves dates.
 * Migration 20262129000000 + lib/critical-path/notify.ts (called by the recompute).
 *
 * [Josh, ruling 11 revised] Per line, per assignee: an account → IN-APP; no
 * account, an email → EMAIL; neither → REPORTED to the saver. [6-A] The client
 * is emailed when the finish moves, if the box was ticked.
 *
 *   T(3) from Mon 4 Jan 2027. On T, each with notify_changes = true unless said:
 *     crew member   (a login)          → 1 in-app row
 *     an email-only member (a sub)     → 1 email_logs row 'schedule_change'
 *     an unreachable member            → named in the outcome + the saver's report row
 *     the PM, notify FALSE             → nothing (the control)
 *     the Owner = the SAVER, notify on → nothing about their own change
 *   The client (notify_client on)      → 1 email_logs row 'schedule_change_client'
 *   TIME passing (cause 'time')        → nothing to anyone
 *
 * ⚠️ EMAIL_SEND_ENABLED is forced to 'false' here: no real mailbox is ever
 * reached from a test. The send gate refuses, and the row is logged as FAILED
 * with the gate's reason — which is what proves the send was ATTEMPTED.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { ensureScheduleFresh, recomputeProject } from '@/lib/critical-path/recompute';
import { applyCriticalPathSave, untoldOf } from '@/lib/critical-path/save';
import { decideScheduleEdit } from '@/lib/critical-path/held';
import { admin, assertRebuildTest, deleteProjects, sessionFor, sweepProjectsNamed, upsertContact } from './live-session';

process.env.EMAIL_SEND_ENABLED = 'false';

const MARKER = 'S122CPN';
const OWNER = 'josh+test50@worthprop.com';
const CREW = 'josh+crew@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const START = new Date().toISOString();
/** Taken just before the Owner's change: counts below are THAT change's. (The
 *  first computation also tells opted-in assignees — it writes their dates.) */
let CHANGE_AT = START;

const db = admin as unknown as SupabaseClient<Database>;
let owner: SupabaseClient;
let companyId = '';
let projectId = '';
let taskT = '';
let contactEmail = '';
const m = { owner: '', crew: '', pm: '', emailOnly: '', unreachable: '' };
const prof = { owner: '', crew: '', pm: '' };
let emailOnlyAddress = '';
let unreachableName = '';
let outcome: Awaited<ReturnType<typeof applyCriticalPathSave>> | null = null;

const must = (label: string, error: { message: string } | null) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};

async function memberOf(email: string): Promise<{ member: string; profile: string }> {
  const { data: p } = await admin.from('profiles').select('id').eq('email', email).single();
  const { data: mm } = await admin.from('company_members').select('id').eq('profile_id', p!.id).eq('is_deleted', false).single();
  return { member: mm!.id as string, profile: p!.id as string };
}

async function purge(id: string) {
  const { data: ts } = await admin.from('tasks').select('id').eq('project_id', id);
  const ids = (ts ?? []).map((r) => r.id as string);
  await admin.from('notifications').delete().eq('project_id', id);
  await admin.from('task_schedule_edits').delete().eq('project_id', id);
  await admin.from('project_finish_history').delete().eq('project_id', id);
  await admin.from('project_schedule_settings').delete().eq('project_id', id);
  if (ids.length) {
    await admin.from('task_assignees').delete().in('task_id', ids);
    await admin.from('tasks').delete().in('id', ids);
  }
  await admin.from('project_assignments').delete().eq('project_id', id);
  await deleteProjects(admin, [id]);
}

async function inApp(profileId: string, titleLike: string) {
  const { count } = await admin
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_profile_id', profileId)
    .eq('project_id', projectId)
    .eq('type', 'schedule_changed')
    .like('title', titleLike);
  return count ?? 0;
}
async function emailLogs(type: 'schedule_change' | 'schedule_change_client', to: string) {
  const { data } = await admin
    .from('email_logs')
    .select('status, subject, metadata')
    .eq('email_type', type)
    .eq('recipient_email', to)
    .gte('created_at', CHANGE_AT);
  return (data ?? []) as { status: string; subject: string; metadata: Record<string, unknown> }[];
}

beforeAll(async () => {
  assertRebuildTest();
  const { data: stale } = await admin.from('projects').select('id').like('name', `${MARKER}%`);
  for (const r of stale ?? []) await purge(r.id as string);
  await sweepProjectsNamed(MARKER);
  const o = await memberOf(OWNER);
  const c = await memberOf(CREW);
  const p = await memberOf(PM);
  m.owner = o.member;
  m.crew = c.member;
  m.pm = p.member;
  prof.owner = o.profile;
  prof.crew = c.profile;
  prof.pm = p.profile;
  const { data: op } = await admin.from('profiles').select('company_id').eq('id', prof.owner).single();
  companyId = op!.company_id as string;

  // One member in each remaining reachability state, picked in a stable order.
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
  m.emailOnly = eo![0].id as string;
  const sub = (eo![0] as unknown as { sub: { email: string }[] | { email: string } }).sub;
  emailOnlyAddress = (Array.isArray(sub) ? sub[0] : sub).email;

  const { data: candidates } = await admin
    .from('company_members')
    .select('id, display_name')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .is('profile_id', null)
    .order('id', { ascending: true })
    .limit(50);
  for (const cand of candidates ?? []) {
    const { data: s } = await admin.from('subcontractors').select('email').eq('member_id', cand.id).eq('is_deleted', false).not('email', 'is', null);
    if (!s || s.length === 0) {
      m.unreachable = cand.id as string;
      unreachableName = cand.display_name as string;
      break;
    }
  }
  expect(m.unreachable, 'an unreachable member exists').not.toBe('');

  contactEmail = `${MARKER.toLowerCase()}@example.invalid`;
  const contactId = (await upsertContact({ company_id: companyId, contact_type: 'client', first_name: MARKER, last_name: 'Client', email: contactEmail })).id;
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
      contact_id: contactId,
      name: `${MARKER} notify`,
      status: 'active',
      project_number: `PRJ-${MARKER}`,
      project_internal_seq: (seqRow!.project_internal_seq as number) + 9400,
      start_date: '2027-01-04',
    })
    .select('id')
    .single();
  must('project', error);
  projectId = proj!.id as string;
  for (const mid of [m.owner, m.crew, m.pm]) {
    must('assign', (await admin.from('project_assignments').insert({ company_id: companyId, project_id: projectId, member_id: mid })).error);
  }
  const { data: t, error: tErr } = await admin
    .from('tasks')
    .insert({ company_id: companyId, project_id: projectId, title: `${MARKER} T`, duration_days: 3 })
    .select('id')
    .single();
  must('task', tErr);
  taskT = t!.id as string;
  for (const [mid, on] of [
    [m.crew, true],
    [m.emailOnly, true],
    [m.unreachable, true],
    [m.pm, false],
    [m.owner, true],
  ] as const) {
    must('assignee', (await admin.from('task_assignees').insert({ company_id: companyId, task_id: taskT, member_id: mid, notify_changes: on })).error);
  }
  must(
    'cp on',
    (await admin.from('project_schedule_settings').insert({ company_id: companyId, project_id: projectId, critical_path_enabled: true, notify_client: true })).error
  );
  owner = await sessionFor(OWNER);
}, 300_000);

afterAll(async () => {
  if (projectId) await purge(projectId);
  const { count } = await admin.from('projects').select('id', { count: 'exact', head: true }).like('name', `${MARKER}%`);
  expect(count ?? 0).toBe(0);
}, 300_000);

describe('the first computation tells the client nothing (there was no previous finish)', () => {
  it('turned on: finish Wed 6 Jan; 0 client emails', async () => {
    const r = await recomputeProject(db, projectId, { cause: { kind: 'enabled' }, now: new Date('2026-10-05T16:00:00Z') });
    expect(r).toMatchObject({ status: 'computed', projectedFinish: '2027-01-06' });
    expect((await emailLogs('schedule_change_client', contactEmail)).length).toBe(0);
  });
});

describe('an applied change: the Owner extends T 3 → 5 (T Mon04–Fri08, finish 6 → 8 Jan)', () => {
  beforeAll(async () => {
    // Clear the first computation's assignee traffic so every count below is this change's.
    await admin.from('notifications').delete().eq('project_id', projectId);
    CHANGE_AT = new Date().toISOString();
    outcome = await applyCriticalPathSave(
      owner as SupabaseClient<Database>,
      db,
      { projectId, taskId: taskT, companyId, userId: '', savedByMemberId: m.owner },
      { duration_days: 5 }
    );
  }, 120_000);

  it('the change landed and the dates moved', async () => {
    expect(outcome).toMatchObject({ ok: true, held: false });
    const { data } = await admin.from('tasks').select('start_date, due_date').eq('id', taskT).single();
    expect(data).toEqual({ start_date: '2027-01-04', due_date: '2027-01-08' });
  });

  it('the crew member (a login, notify on) gets ONE in-app row naming the new dates', async () => {
    expect(await inApp(prof.crew, 'Schedule changed on %')).toBe(1);
    const { data } = await admin
      .from('notifications')
      .select('body')
      .eq('recipient_profile_id', prof.crew)
      .eq('project_id', projectId)
      .single();
    expect(data!.body).toBe(`${MARKER} T: Mon 4 Jan – Fri 8 Jan 2027`);
  });

  it('the email-only member gets ONE email attempt (logged FAILED by the forced send gate)', async () => {
    const rows = await emailLogs('schedule_change', emailOnlyAddress);
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe('failed');
    expect(String(rows[0].metadata.error)).toContain('send gate refused');
    expect(rows[0].metadata.member_id).toBe(m.emailOnly);
  });

  it('the unreachable member is NAMED back, and the saver gets a report row', async () => {
    if (!outcome || !outcome.ok || !outcome.recompute || outcome.recompute.status !== 'computed') throw new Error('no outcome');
    expect(outcome.recompute.notified.unreachable).toEqual([unreachableName]);
    expect(outcome.recompute.notified).toMatchObject({ inApp: 1, emailed: 0, clientEmailed: false, clientUnreachable: false });
    expect(await inApp(prof.owner, 'Not everyone could be told%')).toBe(1);
    // [PARITY] What every route returns for the saver to be SHOWN at save time.
    expect(untoldOf(outcome.recompute)).toEqual({ names: [unreachableName], client: false });
  });

  it('CONTROL: the PM (notify OFF) gets nothing; the Owner gets nothing about their own change', async () => {
    expect(await inApp(prof.pm, '%')).toBe(0);
    expect(await inApp(prof.owner, 'Schedule changed on %')).toBe(0);
  });

  it('the client gets ONE email: the finish and the disclaimer', async () => {
    const rows = await emailLogs('schedule_change_client', contactEmail);
    expect(rows.length).toBe(1);
    expect(rows[0].subject).toBe(`${MARKER} notify: projected finish Fri 8 Jan 2027`);
  });
});

describe('an APPROVAL applies the change, so the APPROVER is told who could not be', () => {
  it('crew holds T 5 → 6; the Owner approves: untold names the unreachable member; the Owner gets the report row', async () => {
    const crew = await sessionFor(CREW);
    const held = await applyCriticalPathSave(
      crew as SupabaseClient<Database>,
      db,
      { projectId, taskId: taskT, companyId, userId: '', savedByMemberId: m.crew },
      { duration_days: 6 }
    );
    expect(held).toMatchObject({ ok: true, held: true });
    const { data: edits } = await admin
      .from('task_schedule_edits')
      .select('id')
      .eq('task_id', taskT)
      .eq('status', 'pending')
      .eq('submitted_by_member_id', m.crew);
    expect(edits?.length ?? 0, 'exactly one pending edit, the crew member').toBe(1);
    await admin.from('notifications').delete().eq('project_id', projectId).eq('recipient_profile_id', prof.owner);
    const d = await decideScheduleEdit(
      owner as SupabaseClient<Database>,
      db,
      { projectId, editId: edits![0].id as string, userId: '', myMemberId: m.owner },
      'approve',
      null
    );
    expect(d).toEqual({ ok: true, untold: { names: [unreachableName], client: false } });
    const { data: t } = await admin.from('tasks').select('duration_days, due_date').eq('id', taskT).single();
    expect(t).toEqual({ duration_days: 6, due_date: '2027-01-11' });
    expect(await inApp(prof.owner, 'Not everyone could be told%')).toBe(1);
  }, 120_000);
});

describe('TIME passing tells nobody', () => {
  it('read a week later (cause time): the dates move, no new in-app row, no new email', async () => {
    const before = {
      crew: await inApp(prof.crew, '%'),
      sub: (await emailLogs('schedule_change', emailOnlyAddress)).length,
      client: (await emailLogs('schedule_change_client', contactEmail)).length,
    };
    const r = await ensureScheduleFresh(db, projectId, new Date('2027-01-11T16:00:00Z'));
    expect(r.status).toBe('computed');
    const { data } = await admin.from('tasks').select('start_date').eq('id', taskT).single();
    expect(data!.start_date, 'the dates DID move').toBe('2027-01-11');
    expect(await inApp(prof.crew, '%')).toBe(before.crew);
    expect((await emailLogs('schedule_change', emailOnlyAddress)).length).toBe(before.sub);
    expect((await emailLogs('schedule_change_client', contactEmail)).length).toBe(before.client);
  });
});
