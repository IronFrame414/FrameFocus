/**
 * S121 Part 4 — timesheet edits from the week sheet. ⚠️ PAYROLL.
 * Migration 20262119000000. [RULED Josh 2026-09-30: ASK-8/9/10/11/23/29, 4-D.]
 *
 *   AUTHORITY  edit_time_segment / add_time_segment / split_time_segment are
 *              Owner/Admin — TOTAL MAP over every role, refusals judged by the
 *              service role (the segment count and the original's end), the
 *              writes return no rows to the caller.
 *   SPLIT      two contiguous halves summing to the original TO THE SECOND;
 *              the second half carries its own task + outcome.
 *   GATE       the completion gate is KEPT: a closed task-bound half/segment
 *              without an outcome is refused — and a refused split changes
 *              NOTHING (one transaction).
 *   OVERLAP    refused; a GAP is allowed; touching end-to-start is allowed.
 *   REOPEN     an edit to an APPROVED day returns it to pending (approved_by
 *              and approved_at cleared); a pending day stays pending.
 *   AUDIT      every edit lands in time_edit_logs with its action; an
 *              Owner/Admin editing their OWN time through the functions is
 *              logged; ordinary self-updates stay unlogged (control).
 *
 * Disposable fixture: project `S121TE …`, sessions on 2020-01-06 (a date no
 * real time sits on), swept before and after.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CompanyRole } from '@framefocus/shared/types/roles';
import { forEveryRole } from '@/test-support/role-matrix';
import { admin, assertRebuildTest, deleteProjects, sessionFor } from './live-session';

const MARKER = 'S121TE';
const IDENTITY: Record<CompanyRole, string> = {
  owner: 'josh+test50@worthprop.com',
  admin: 'josh+qa-admin@worthprop.com',
  project_executive: 'josh+qa-pe@worthprop.com',
  project_manager: 'josh+pm@worthprop.com',
  foreman: 'josh+qa-foreman@worthprop.com',
  crew_member: 'josh+crew@worthprop.com',
  client: 'josh+qa-client@worthprop.com',
  subcontractor: 'josh+qa-sub@worthprop.com',
};
const EDIT: Record<CompanyRole, boolean> = {
  owner: true,
  admin: true,
  project_executive: false,
  project_manager: false,
  foreman: false,
  crew_member: false,
  client: false,
  subcontractor: false,
};

const session = {} as Record<CompanyRole, SupabaseClient>;
let companyId = '';
let contactId = '';
let projectId = '';
let taskA = '';
let taskB = '';
let crewMember = '';
let ownerMember = '';
const T = (hhmm: string, day = '2020-01-06') => `${day}T${hhmm}:00.000Z`;

async function sweep() {
  const { data: ps } = await admin.from('projects').select('id').like('name', `${MARKER} %`);
  const ids = (ps ?? []).map((p) => p.id as string);
  // Sessions on the fixture day for the two fixture members.
  const members = [crewMember, ownerMember].filter(Boolean);
  if (members.length) {
    const { data: ss } = await admin
      .from('time_clock_sessions')
      .select('id')
      .in('member_id', members)
      .gte('clock_in', '2020-01-01T00:00:00Z')
      .lt('clock_in', '2020-02-01T00:00:00Z');
    const sIds = (ss ?? []).map((s) => s.id as string);
    if (sIds.length) {
      await admin.from('time_edit_logs').delete().in('session_id', sIds);
      await admin.from('time_segments').delete().in('session_id', sIds);
      await admin.from('time_session_rate_snapshots').delete().in('session_id', sIds);
      await admin.from('time_clock_sessions').delete().in('id', sIds);
    }
  }
  if (ids.length) {
    await admin.from('tasks').delete().in('project_id', ids);
    await admin.from('project_assignments').delete().in('project_id', ids);
    await deleteProjects(admin, ids);
  }
  const { data: cs } = await admin.from('contacts').select('id').eq('last_name', `${MARKER} Client`);
  const cIds = (cs ?? []).map((c) => c.id as string);
  if (cIds.length) {
    await admin.from('qb_sync_queue').delete().in('entity_id', cIds);
    await admin.from('contacts').delete().in('id', cIds);
  }
}

async function memberOf(email: string): Promise<string> {
  const { data: p } = await admin.from('profiles').select('id').eq('email', email).single();
  const { data: m } = await admin.from('company_members').select('id').eq('profile_id', p!.id).single();
  return m!.id as string;
}

/** A pending session 08:00–16:00 for `member` on `day`, with the standard
 *  chain: work 08–12 (task A, complete), break 12–12:30, work 12:30–16:00. */
async function fixture(member: string, day = '2020-01-06', clockOut = '16:00') {
  const { data: s, error } = await admin
    .from('time_clock_sessions')
    .insert({
      company_id: companyId,
      member_id: member,
      clock_in: T('08:00', day),
      clock_out: T(clockOut, day),
      status: 'pending',
    })
    .select('id')
    .single();
  if (error) throw new Error(`session: ${error.message}`);
  const sid = s!.id as string;
  const rows = [
    { segment_type: 'work', project_id: projectId, task_id: taskA, completion: 'complete', note: 'framing', segment_start: T('08:00', day), segment_end: T('12:00', day) },
    { segment_type: 'break', project_id: null, task_id: null, completion: null, note: null, segment_start: T('12:00', day), segment_end: T('12:30', day) },
    { segment_type: 'work', project_id: projectId, task_id: null, completion: null, note: 'cleanup', segment_start: T('12:30', day), segment_end: T('16:00', day) },
  ];
  const { data: segs, error: sErr } = await admin
    .from('time_segments')
    .insert(rows.map((r) => ({ ...r, company_id: companyId, session_id: sid })))
    .select('id, segment_start');
  if (sErr) throw new Error(`segments: ${sErr.message}`);
  const byStart = new Map((segs ?? []).map((r) => [new Date(r.segment_start as string).toISOString(), r.id as string]));
  return {
    sid,
    morning: byStart.get(T('08:00', day))!,
    breakSeg: byStart.get(T('12:00', day))!,
    afternoon: byStart.get(T('12:30', day))!,
  };
}

async function segmentsOf(sid: string) {
  const { data } = await admin
    .from('time_segments')
    .select('id, segment_type, project_id, task_id, completion, note, segment_start, segment_end')
    .eq('session_id', sid)
    .eq('is_deleted', false)
    .order('segment_start', { ascending: true });
  return (data ?? []) as {
    id: string;
    segment_type: string;
    project_id: string | null;
    task_id: string | null;
    completion: string | null;
    note: string | null;
    segment_start: string;
    segment_end: string | null;
  }[];
}
async function sessionRow(sid: string) {
  const { data } = await admin
    .from('time_clock_sessions')
    .select('status, approved_by, approved_at')
    .eq('id', sid)
    .single();
  return data as { status: string | null; approved_by: string | null; approved_at: string | null };
}
async function approve(sid: string) {
  const { error } = await admin
    .from('time_clock_sessions')
    .update({ status: 'approved', approved_by: ownerMember, approved_at: new Date().toISOString() })
    .eq('id', sid);
  if (error) throw new Error(`approve: ${error.message}`);
}
const secs = (a: string, b: string | null) => (new Date(b!).getTime() - new Date(a).getTime()) / 1000;

function split(role: CompanyRole, segId: string, at: string, task: string | null, completion: string | null, note = 'switched') {
  return session[role].rpc('split_time_segment', {
    p_segment_id: segId,
    p_at: at,
    p_second_task_id: task ?? undefined,
    p_second_completion: completion ?? undefined,
    p_second_note: note,
  });
}
function add(role: CompanyRole, sid: string, start: string, end: string, extra: { task?: string; completion?: string } = {}) {
  return session[role].rpc('add_time_segment', {
    p_session_id: sid,
    p_segment_type: 'work',
    p_project_id: projectId,
    p_task_id: extra.task ?? undefined,
    p_completion: extra.completion ?? undefined,
    p_note: 'added',
    p_start: start,
    p_end: end,
  });
}
function edit(role: CompanyRole, segId: string, start: string, end: string, note = 'edited') {
  return session[role].rpc('edit_time_segment', {
    p_segment_id: segId,
    p_segment_type: 'work',
    p_project_id: projectId,
    p_task_id: undefined,
    p_completion: undefined,
    p_note: note,
    p_start: start,
    p_end: end,
  });
}

beforeAll(async () => {
  assertRebuildTest();
  const { data: prof } = await admin.from('profiles').select('company_id').eq('email', IDENTITY.owner).single();
  companyId = prof!.company_id as string;
  crewMember = await memberOf(IDENTITY.crew_member);
  ownerMember = await memberOf(IDENTITY.owner);
  await sweep();
  const { data: c, error: cErr } = await admin
    .from('contacts')
    .insert({ company_id: companyId, first_name: 'Time', last_name: `${MARKER} Client`, contact_type: 'client' })
    .select('id')
    .single();
  if (cErr) throw new Error(`contact: ${cErr.message}`);
  contactId = c!.id as string;
  const { data: seqRow } = await admin
    .from('projects')
    .select('project_internal_seq')
    .eq('company_id', companyId)
    .order('project_internal_seq', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: pr, error: pErr } = await admin
    .from('projects')
    .insert({
      company_id: companyId,
      contact_id: contactId,
      project_number: `PRJ-${MARKER}`,
      name: `${MARKER} project`,
      status: 'active',
      project_internal_seq: (seqRow?.project_internal_seq ?? 0) + 8300,
    })
    .select('id')
    .single();
  if (pErr) throw new Error(`project: ${pErr.message}`);
  projectId = pr!.id as string;
  const { data: tasks, error: tErr } = await admin
    .from('tasks')
    .insert([
      { company_id: companyId, project_id: projectId, title: `${MARKER} task A` },
      { company_id: companyId, project_id: projectId, title: `${MARKER} task B` },
    ])
    .select('id, title');
  if (tErr) throw new Error(`tasks: ${tErr.message}`);
  taskA = tasks!.find((t) => (t.title as string).endsWith('A'))!.id as string;
  taskB = tasks!.find((t) => (t.title as string).endsWith('B'))!.id as string;
  for (const role of Object.keys(IDENTITY) as CompanyRole[]) session[role] = await sessionFor(IDENTITY[role]);
}, 240_000);

afterAll(async () => {
  await sweep();
  const { count } = await admin
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .like('name', `${MARKER} %`);
  expect(count ?? 0).toBe(0);
}, 180_000);

// Each test starts from no fixture sessions (sweep keeps the project).
beforeEach(async () => {
  const { data: ss } = await admin
    .from('time_clock_sessions')
    .select('id')
    .in('member_id', [crewMember, ownerMember])
    .gte('clock_in', '2020-01-01T00:00:00Z')
    .lt('clock_in', '2020-02-01T00:00:00Z');
  const sIds = (ss ?? []).map((s) => s.id as string);
  if (sIds.length) {
    await admin.from('time_edit_logs').delete().in('session_id', sIds);
    await admin.from('time_segments').delete().in('session_id', sIds);
    await admin.from('time_session_rate_snapshots').delete().in('session_id', sIds);
    await admin.from('time_clock_sessions').delete().in('id', sIds);
  }
});

describe('AUTHORITY — Owner/Admin only, TOTAL MAP, each of the three functions', () => {
  forEveryRole(EDIT, (role, may) => {
    it(`${role}: split → ${may ? 'two halves' : 'refused, unchanged'}`, async () => {
      const f = await fixture(crewMember);
      await split(role, f.afternoon, T('14:00'), null, null);
      const segs = await segmentsOf(f.sid);
      expect(segs, role).toHaveLength(may ? 4 : 3);
      const pm = segs.find((s) => s.id === f.afternoon)!;
      expect(pm.segment_end, role).toBe(new Date(may ? T('14:00') : T('16:00')).toISOString().replace('.000Z', '+00:00'));
    });

    it(`${role}: add → ${may ? 'added' : 'refused'}`, async () => {
      const f = await fixture(crewMember, '2020-01-07', '17:00');
      await add(role, f.sid, T('16:15', '2020-01-07'), T('17:00', '2020-01-07'));
      expect((await segmentsOf(f.sid)).length, role).toBe(may ? 4 : 3);
    });

    it(`${role}: edit → ${may ? 'edited' : 'refused, note unchanged'}`, async () => {
      const f = await fixture(crewMember);
      await edit(role, f.afternoon, T('12:30'), T('16:00'), `by-${role}`);
      const pm = (await segmentsOf(f.sid)).find((s) => s.id === f.afternoon)!;
      expect(pm.note, role).toBe(may ? `by-${role}` : 'cleanup');
    });
  });

  it('control: the supervisor path is NOT widened — a foreman still cannot move a crew segment end directly', async () => {
    const f = await fixture(crewMember);
    await session.foreman.from('time_segments').update({ segment_end: T('15:00') }).eq('id', f.afternoon);
    const pm = (await segmentsOf(f.sid)).find((s) => s.id === f.afternoon)!;
    expect(new Date(pm.segment_end!).toISOString()).toBe(T('16:00'));
  });
});

describe('SPLIT — the total cannot change, to the second', () => {
  it('a 3h30m segment split at 14:07:13 → 1h37m13s + 1h52m47s = 3h30m, exactly', async () => {
    const f = await fixture(crewMember);
    const before = await segmentsOf(f.sid);
    const orig = before.find((s) => s.id === f.afternoon)!;
    const origSecs = secs(orig.segment_start, orig.segment_end);
    const totalBefore = before.reduce((n, s) => n + secs(s.segment_start, s.segment_end), 0);
    const { data, error } = await split('owner', f.afternoon, '2020-01-06T14:07:13.000Z', taskB, 'incomplete', 'moved to B');
    expect(error).toBeNull();
    const after = await segmentsOf(f.sid);
    const first = after.find((s) => s.id === f.afternoon)!;
    const second = after.find((s) => s.id === (data as { second_segment_id: string }).second_segment_id)!;
    expect(secs(first.segment_start, first.segment_end)).toBe(5833); // 1:37:13
    expect(secs(second.segment_start, second.segment_end)).toBe(6767); // 1:52:47
    expect(secs(first.segment_start, first.segment_end) + secs(second.segment_start, second.segment_end)).toBe(origSecs);
    expect(origSecs).toBe(12600);
    // Contiguous: first ends exactly where second starts.
    expect(new Date(first.segment_end!).getTime()).toBe(new Date(second.segment_start).getTime());
    expect(after.reduce((n, s) => n + secs(s.segment_start, s.segment_end), 0)).toBe(totalBefore);
    // The halves' attribution: the first keeps its own; the second has its own task + outcome.
    expect(first).toMatchObject({ task_id: null, note: 'cleanup', project_id: projectId });
    expect(second).toMatchObject({ task_id: taskB, completion: 'incomplete', note: 'moved to B', project_id: projectId, segment_type: 'work' });
  });

  it('splitting a TASK-BOUND segment keeps its outcome on the first half (the gate holds)', async () => {
    const f = await fixture(crewMember);
    const { error } = await split('owner', f.morning, T('10:00'), taskB, 'complete');
    expect(error).toBeNull();
    const m = (await segmentsOf(f.sid)).find((s) => s.id === f.morning)!;
    expect(m).toMatchObject({ task_id: taskA, completion: 'complete' });
  });

  it('the split time must be strictly inside; an open segment cannot be split', async () => {
    const f = await fixture(crewMember);
    for (const at of [T('12:30'), T('16:00'), T('17:00')]) {
      const { error } = await split('owner', f.afternoon, at, null, null);
      expect(error?.message, at).toMatch(/strictly inside/);
    }
    expect(await segmentsOf(f.sid)).toHaveLength(3);
    // An OPEN segment (still clocked in). Built by INSERT: the segment
    // column-scope trigger refuses even the service role an UPDATE that clears
    // an end, so an update-based setup would silently not happen.
    const { data: open } = await admin
      .from('time_clock_sessions')
      .insert({ company_id: companyId, member_id: crewMember, clock_in: T('08:00', '2020-01-08'), status: 'pending' })
      .select('id')
      .single();
    const { data: seg, error: segErr } = await admin
      .from('time_segments')
      .insert({ company_id: companyId, session_id: open!.id, segment_type: 'shop', segment_start: T('08:00', '2020-01-08') })
      .select('id, segment_end')
      .single();
    expect(segErr).toBeNull();
    expect(seg!.segment_end, 'non-vacuous: the segment really is open').toBeNull();
    const { error } = await split('owner', seg!.id as string, T('09:00', '2020-01-08'), null, null);
    expect(error?.message).toMatch(/Only a finished segment/);
    expect(await segmentsOf(open!.id as string)).toHaveLength(1);
  });
});

describe('GATE — the completion gate that trapped Josh on 2026-09-29 is KEPT', () => {
  it('split whose second half has a task but NO outcome → refused, and NOTHING changed (one transaction)', async () => {
    const f = await fixture(crewMember);
    const { error } = await split('owner', f.afternoon, T('14:00'), taskB, null);
    expect(error?.message).toBe('A task segment needs its outcome: complete or incomplete.');
    const segs = await segmentsOf(f.sid);
    expect(segs).toHaveLength(3);
    const pm = segs.find((s) => s.id === f.afternoon)!;
    expect(new Date(pm.segment_end!).toISOString(), 'the first half was NOT shortened').toBe(T('16:00'));
  });

  it('add of a task segment with no outcome → refused; with one → added', async () => {
    const f = await fixture(crewMember, '2020-01-07', '17:00');
    const { error: e1 } = await add('owner', f.sid, T('16:00', '2020-01-07'), T('17:00', '2020-01-07'), { task: taskB });
    expect(e1?.message).toBe('A task segment needs its outcome: complete or incomplete.');
    expect(await segmentsOf(f.sid)).toHaveLength(3);
    const { error: e2 } = await add('owner', f.sid, T('16:00', '2020-01-07'), T('17:00', '2020-01-07'), { task: taskB, completion: 'complete' });
    expect(e2).toBeNull();
    expect(await segmentsOf(f.sid)).toHaveLength(4);
  });

  it('a task from ANOTHER project is refused', async () => {
    const f = await fixture(crewMember, '2020-01-07', '17:00');
    const { data: other } = await admin
      .from('tasks')
      .select('id, project_id')
      .eq('company_id', companyId)
      .neq('project_id', projectId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();
    expect(other, 'non-vacuous: another project has a task').not.toBeNull();
    const { error } = await add('owner', f.sid, T('16:00', '2020-01-07'), T('17:00', '2020-01-07'), {
      task: other!.id as string,
      completion: 'complete',
    });
    expect(error?.message).toMatch(/not on this segment's job/);
  });
});

describe('OVERLAP refused; GAP allowed (ASK-23)', () => {
  it('an added segment overlapping the chain → refused, nothing added', async () => {
    const f = await fixture(crewMember, '2020-01-07', '17:00');
    const { error } = await add('owner', f.sid, T('15:00', '2020-01-07'), T('16:30', '2020-01-07'));
    expect(error?.message).toMatch(/overlaps another segment/);
    expect(await segmentsOf(f.sid)).toHaveLength(3);
  });

  it('an added segment leaving a GAP (16:30–17:00 after a 16:00 end) → accepted', async () => {
    const f = await fixture(crewMember, '2020-01-07', '17:00');
    const { error } = await add('owner', f.sid, T('16:30', '2020-01-07'), T('17:00', '2020-01-07'));
    expect(error).toBeNull();
    expect(await segmentsOf(f.sid)).toHaveLength(4);
  });

  it('touching end-to-start (16:00–16:30) is not an overlap → accepted', async () => {
    const f = await fixture(crewMember, '2020-01-07', '17:00');
    const { error } = await add('owner', f.sid, T('16:00', '2020-01-07'), T('16:30', '2020-01-07'));
    expect(error).toBeNull();
  });

  it('an EDIT that stretches into the next segment → refused, unchanged', async () => {
    const f = await fixture(crewMember);
    const { error } = await edit('owner', f.morning, T('08:00'), T('12:15'));
    expect(error?.message).toMatch(/overlaps another segment/);
    const m = (await segmentsOf(f.sid)).find((s) => s.id === f.morning)!;
    expect(new Date(m.segment_end!).toISOString()).toBe(T('12:00'));
  });

  it("overlap is checked across the member's OTHER sessions too", async () => {
    const f = await fixture(crewMember, '2020-01-07', '17:00');
    // A second session later the same day, 18:00–19:00.
    const { data: s2 } = await admin
      .from('time_clock_sessions')
      .insert({ company_id: companyId, member_id: crewMember, clock_in: T('18:00', '2020-01-07'), clock_out: T('19:00', '2020-01-07'), status: 'pending' })
      .select('id')
      .single();
    await admin.from('time_segments').insert({
      company_id: companyId,
      session_id: s2!.id,
      segment_type: 'shop',
      note: 'shop',
      segment_start: T('18:00', '2020-01-07'),
      segment_end: T('19:00', '2020-01-07'),
    });
    // Editing this session's last segment to run into the other session → refused.
    const { error } = await edit('owner', f.afternoon, T('12:30', '2020-01-07'), T('18:30', '2020-01-07'));
    expect(error?.message).toMatch(/overlaps another segment/);
  });
});

describe('REOPEN — an edit to an APPROVED day returns it to pending (ASK-11)', () => {
  it('approved → split → pending, approver cleared, the function says so', async () => {
    const f = await fixture(crewMember);
    await approve(f.sid);
    expect((await sessionRow(f.sid)).status).toBe('approved');
    const { data, error } = await split('admin', f.afternoon, T('14:00'), null, null);
    expect(error).toBeNull();
    expect((data as { returned_to_pending: boolean }).returned_to_pending).toBe(true);
    expect(await sessionRow(f.sid)).toMatchObject({ status: 'pending', approved_by: null, approved_at: null });
  });

  it('approved → add / edit → pending as well', async () => {
    const a = await fixture(crewMember, '2020-01-07', '17:00');
    await approve(a.sid);
    await add('owner', a.sid, T('16:30', '2020-01-07'), T('17:00', '2020-01-07'));
    expect((await sessionRow(a.sid)).status).toBe('pending');
    const b = await fixture(crewMember);
    await approve(b.sid);
    await edit('owner', b.afternoon, T('12:30'), T('15:45'));
    expect((await sessionRow(b.sid)).status).toBe('pending');
  });

  it('a PENDING day stays pending and the function says it was not reopened', async () => {
    const f = await fixture(crewMember);
    const { data } = await edit('owner', f.afternoon, T('12:30'), T('15:45'));
    expect((data as { returned_to_pending: boolean }).returned_to_pending).toBe(false);
    expect((await sessionRow(f.sid)).status).toBe('pending');
  });

  it('a REFUSED edit does not reopen an approved day', async () => {
    const f = await fixture(crewMember);
    await approve(f.sid);
    await edit('owner', f.morning, T('08:00'), T('12:15')); // overlap → refused
    expect((await sessionRow(f.sid)).status).toBe('approved');
    await split('foreman', f.afternoon, T('14:00'), null, null); // not authorised
    expect((await sessionRow(f.sid)).status).toBe('approved');
  });
});

describe('AUDIT — every edit in time_edit_logs, with its action (ASK-10 / ASK-29)', () => {
  async function logs(sid: string) {
    const { data } = await admin
      .from('time_edit_logs')
      .select('editor_member_id, target_member_id, segment_id, changes, created_at')
      .eq('session_id', sid)
      .order('created_at', { ascending: true });
    return (data ?? []) as {
      editor_member_id: string | null;
      target_member_id: string | null;
      segment_id: string | null;
      changes: Record<string, unknown>;
    }[];
  }

  it("split of a crew member's approved day logs: the shortened half (old end), the new half, and the status change", async () => {
    const f = await fixture(crewMember);
    await approve(f.sid);
    await admin.from('time_edit_logs').delete().eq('session_id', f.sid); // the approve() write is not under test
    const { data } = await split('owner', f.afternoon, T('14:00'), null, null);
    const rows = await logs(f.sid);
    const update = rows.find((r) => r.segment_id === f.afternoon)!;
    expect(update, 'the first half').toBeDefined();
    expect(update.editor_member_id).toBe(ownerMember);
    expect(update.target_member_id).toBe(crewMember);
    expect(update.changes.action).toBe('split');
    expect((update.changes.segment_end as { from: string }).from).toMatch(/2020-01-06T16:00:00/);
    const inserted = rows.find((r) => r.segment_id === (data as { second_segment_id: string }).second_segment_id)!;
    expect(inserted.changes.action).toBe('split');
    expect(inserted.changes.created).toBeDefined();
    const status = rows.find((r) => r.segment_id === null && r.changes.status)!;
    expect(status.changes.status).toEqual({ from: 'approved', to: 'pending' });
    expect(rows).toHaveLength(3);
  });

  it("an OWNER editing their OWN time through the function IS logged; a plain self-update is not (control)", async () => {
    const f = await fixture(ownerMember);
    await edit('owner', f.afternoon, T('12:30'), T('15:30'), 'own edit');
    const rows = await logs(f.sid);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ editor_member_id: ownerMember, target_member_id: ownerMember });
    expect(rows[0].changes.action).toBe('edit');
    // Control: the ordinary path (a direct update of one's own segment) stays unlogged.
    await session.owner.from('time_segments').update({ note: 'plain self edit' }).eq('id', f.morning);
    const { data: m } = await admin.from('time_segments').select('note').eq('id', f.morning).single();
    expect(m!.note, 'the control write landed').toBe('plain self edit');
    expect(await logs(f.sid)).toHaveLength(1);
  });

  it('an added segment is logged as "add"', async () => {
    const f = await fixture(crewMember, '2020-01-07', '17:00');
    const { data } = await add('admin', f.sid, T('16:30', '2020-01-07'), T('17:00', '2020-01-07'));
    const rows = await logs(f.sid);
    const r = rows.find((x) => x.segment_id === (data as { segment_id: string }).segment_id)!;
    expect(r.changes.action).toBe('add');
  });

  it('nobody writes the log directly (no INSERT path for any role)', async () => {
    const f = await fixture(crewMember);
    for (const role of ['owner', 'admin', 'crew_member'] as const) {
      await session[role].from('time_edit_logs').insert({
        company_id: companyId,
        session_id: f.sid,
        changes: { forged: role },
      });
    }
    expect(await logs(f.sid)).toHaveLength(0);
  });
});
