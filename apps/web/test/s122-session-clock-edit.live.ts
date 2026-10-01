/**
 * S122 Part 0-B-4 — the session clock edit matches the week sheet. ⚠️ PAYROLL.
 * Migration 20262122000000. [RULED Josh, S122 Q4-A / Q5-A.]
 *
 *   AUTHORITY  UNCHANGED (Q5-A). edit_time_session_clock is SECURITY INVOKER:
 *              who may correct a crew member's clock is exactly who could
 *              before — Owner/Admin, and any supervisor ranked above crew
 *              (PE, PM, foreman). TOTAL MAP over every role; refusals judged
 *              by the SERVICE ROLE (clock_out, status, audit-row count). The RPC
 *              returns a jsonb verdict, never rows.
 *   REOPEN     a clock change on an APPROVED day returns it to pending
 *              (approved_by / approved_at cleared), reported as
 *              returned_to_pending — ON EVERY PATH: the RPC, a direct UPDATE
 *              of the session, a direct UPDATE of a segment's hours. A pending
 *              day stays pending; an attribution-only change reopens nothing.
 *   WEEK SHEET S121's edit_time_segment still reports returned_to_pending =
 *              true (the segment trigger steps aside under its flag).
 *   SELF       a member's own live clock-out on an OPEN session still works
 *              (the segment trigger never makes the column scope refuse it).
 *   AUDIT      an Owner/Admin correcting their OWN session through the RPC is
 *              logged (action 'clock'); an ordinary own update is not (control).
 *
 * Disposable fixture: sessions on 2020-01-13 (a date no real time sits on),
 * swept before and after.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CompanyRole } from '@framefocus/shared/types/roles';
import { forEveryRole } from '@/test-support/role-matrix';
import { admin, assertRebuildTest, sessionFor } from './live-session';

const DAY = '2020-01-13';
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
// Who may correct the CREW member's session clock — TODAY's answer, unchanged
// (Q5-A): Owner/Admin by role; PE (3), PM (3), foreman (2) by
// can_approve_member over crew (1). Crew (equal rank, not self), the sub (1)
// and the client (0) may not.
const MAY_CORRECT_CREW: Record<CompanyRole, boolean> = {
  owner: true,
  admin: true,
  project_executive: true,
  project_manager: true,
  foreman: true,
  crew_member: false,
  client: false,
  subcontractor: false,
};

const session = {} as Record<CompanyRole, SupabaseClient>;
let companyId = '';
let crewMember = '';
let ownerMember = '';
let crewPeer = ''; // a SECOND crew-rank member, so the crew identity is not "self"
const T = (hhmm: string) => `${DAY}T${hhmm}:00.000Z`;

async function memberOf(email: string): Promise<string> {
  const { data: p } = await admin.from('profiles').select('id').eq('email', email).single();
  const { data: m } = await admin
    .from('company_members')
    .select('id')
    .eq('profile_id', p!.id)
    .eq('is_deleted', false)
    .single();
  return m!.id as string;
}

async function sweep() {
  const members = [crewMember, ownerMember, crewPeer].filter(Boolean);
  if (!members.length) return;
  const { data: ss } = await admin
    .from('time_clock_sessions')
    .select('id')
    .in('member_id', members)
    .gte('clock_in', `${DAY}T00:00:00Z`)
    .lt('clock_in', `${DAY}T23:59:59Z`);
  const ids = (ss ?? []).map((s) => s.id as string);
  if (ids.length) {
    await admin.from('time_edit_logs').delete().in('session_id', ids);
    await admin.from('time_segments').delete().in('session_id', ids);
    await admin.from('time_session_rate_snapshots').delete().in('session_id', ids);
    await admin.from('time_clock_sessions').delete().in('id', ids);
  }
}

/** A CLOSED session 08:00–16:00 for `member` with one work segment, optionally approved. */
async function closedSession(member: string, approved: boolean) {
  const { data: s, error } = await admin
    .from('time_clock_sessions')
    .insert({
      company_id: companyId,
      member_id: member,
      clock_in: T('08:00'),
      clock_out: T('16:00'),
      status: 'pending',
    })
    .select('id')
    .single();
  if (error) throw new Error(`session: ${error.message}`);
  const sid = s!.id as string;
  const { data: seg, error: sErr } = await admin
    .from('time_segments')
    .insert({
      company_id: companyId,
      session_id: sid,
      segment_type: 'break',
      segment_start: T('08:00'),
      segment_end: T('16:00'),
    })
    .select('id')
    .single();
  if (sErr) throw new Error(`segment: ${sErr.message}`);
  if (approved) await approve(sid);
  return { sid, seg: seg!.id as string };
}

async function approve(sid: string) {
  const { error } = await admin
    .from('time_clock_sessions')
    .update({ status: 'approved', approved_by: ownerMember, approved_at: new Date().toISOString() })
    .eq('id', sid);
  if (error) throw new Error(`approve: ${error.message}`);
}

async function row(sid: string) {
  const { data } = await admin
    .from('time_clock_sessions')
    .select('clock_in, clock_out, status, approved_by, approved_at')
    .eq('id', sid)
    .single();
  return data as {
    clock_in: string;
    clock_out: string | null;
    status: string | null;
    approved_by: string | null;
    approved_at: string | null;
  };
}

async function auditRows(sid: string) {
  const { data } = await admin.from('time_edit_logs').select('changes').eq('session_id', sid);
  return (data ?? []) as { changes: Record<string, unknown> }[];
}

const iso = (s: string | null) => (s ? new Date(s).toISOString() : null);

function correct(role: CompanyRole, sid: string, clockOut: string) {
  return session[role].rpc('edit_time_session_clock', {
    p_session_id: sid,
    p_clock_in: T('08:00'),
    p_clock_out: clockOut,
  });
}

beforeAll(async () => {
  assertRebuildTest();
  const { data: prof } = await admin
    .from('profiles')
    .select('company_id')
    .eq('email', IDENTITY.owner)
    .single();
  companyId = prof!.company_id as string;
  crewMember = await memberOf(IDENTITY.crew_member);
  ownerMember = await memberOf(IDENTITY.owner);
  // A crew-rank directory member with no login (rank 1 by time_member_rank), so
  // the crew identity's refusal is "equal rank, not self", never "it is me".
  // Ordered, so stable.
  const { data: peer } = await admin
    .from('company_members')
    .select('id, created_at')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .is('profile_id', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  crewPeer = peer!.id as string;
  await sweep();
  for (const role of Object.keys(IDENTITY) as CompanyRole[])
    session[role] = await sessionFor(IDENTITY[role]);
}, 240_000);

afterAll(async () => {
  await sweep();
  const { count } = await admin
    .from('time_clock_sessions')
    .select('id', { count: 'exact', head: true })
    .in('member_id', [crewMember, ownerMember, crewPeer])
    .gte('clock_in', `${DAY}T00:00:00Z`)
    .lt('clock_in', `${DAY}T23:59:59Z`);
  expect(count ?? 0).toBe(0);
}, 180_000);

describe('AUTHORITY — unchanged (Q5-A): TOTAL MAP over every role, judged by the service role', () => {
  forEveryRole(MAY_CORRECT_CREW, (role, allowed) => {
    it(`${role}: ${allowed ? 'corrects' : 'is refused'} a crew member's APPROVED day`, async () => {
      const { sid } = await closedSession(crewMember, true);
      const before = await row(sid);
      expect(before.status).toBe('approved');
      const auditBefore = (await auditRows(sid)).length;

      const { data, error } = await correct(role, sid, T('15:00'));
      const after = await row(sid);
      const audit = await auditRows(sid);
      console.log(
        `[S122CE] ${role}: error=${error?.code ?? 'none'} clock_out=${iso(after.clock_out)} status=${after.status} audit +${audit.length - auditBefore}`
      );

      if (allowed) {
        expect(error, error?.message).toBeNull();
        expect((data as { returned_to_pending: boolean }).returned_to_pending).toBe(true);
        expect(iso(after.clock_out)).toBe(T('15:00'));
        expect(after.status).toBe('pending');
        expect(after.approved_by).toBeNull();
        expect(after.approved_at).toBeNull();
        expect(audit.length - auditBefore, 'one audit row for the correction').toBe(1);
        const changes = audit[audit.length - 1].changes;
        expect(changes.action).toBe('clock');
        expect(changes).toHaveProperty('clock_out');
        expect(changes).toHaveProperty('status');
      } else {
        expect(error, 'the database must refuse').not.toBeNull();
        expect(iso(after.clock_out), 'clock_out unchanged').toBe(T('16:00'));
        expect(after.status, 'still approved').toBe('approved');
        expect(after.approved_by).toBe(ownerMember);
        expect(audit.length - auditBefore, 'no audit row for a refusal').toBe(0);
      }
    });
  });

  it("crew on a crew-rank PEER's day is refused (equal rank — not a self case)", async () => {
    const { sid } = await closedSession(crewPeer, true);
    const { error } = await correct('crew_member', sid, T('15:00'));
    expect(error).not.toBeNull();
    const after = await row(sid);
    expect(iso(after.clock_out)).toBe(T('16:00'));
    expect(after.status).toBe('approved');
  });
});

describe('REOPEN — on EVERY path that changes the hours', () => {
  it('a direct UPDATE of the session (no function) by the Owner still reopens', async () => {
    const { sid } = await closedSession(crewMember, true);
    const { error } = await session.owner
      .from('time_clock_sessions')
      .update({ clock_out: T('15:30') })
      .eq('id', sid);
    expect(error, error?.message).toBeNull();
    const after = await row(sid);
    expect(iso(after.clock_out)).toBe(T('15:30'));
    expect(after.status).toBe('pending');
    expect(after.approved_by).toBeNull();
  });

  it('a direct UPDATE by a supervisor (foreman), even re-sending status=approved, still reopens', async () => {
    const { sid } = await closedSession(crewMember, true);
    const { error } = await session.foreman
      .from('time_clock_sessions')
      .update({ clock_out: T('15:30'), status: 'approved' })
      .eq('id', sid);
    expect(error, error?.message).toBeNull();
    const after = await row(sid);
    expect(after.status, 'hours and approval cannot change in one statement').toBe('pending');
  });

  it("a direct UPDATE of a SEGMENT's hours by the Owner reopens the day", async () => {
    const { sid, seg } = await closedSession(crewMember, true);
    const { error } = await session.owner
      .from('time_segments')
      .update({ segment_end: T('15:45') })
      .eq('id', seg);
    expect(error, error?.message).toBeNull();
    expect((await row(sid)).status).toBe('pending');
  });

  it('control: an ATTRIBUTION-only segment change (note) by a supervisor reopens nothing', async () => {
    const { sid, seg } = await closedSession(crewMember, true);
    const { error } = await session.foreman
      .from('time_segments')
      .update({ note: 'S122CE note' })
      .eq('id', seg);
    expect(error, error?.message).toBeNull();
    const { data: s } = await admin.from('time_segments').select('note').eq('id', seg).single();
    expect(s!.note, 'the write landed').toBe('S122CE note');
    expect((await row(sid)).status, 'hours unchanged → still approved').toBe('approved');
  });

  it('control: a PENDING day corrected stays pending, returned_to_pending = false', async () => {
    const { sid } = await closedSession(crewMember, false);
    const { data, error } = await correct('owner', sid, T('15:00'));
    expect(error, error?.message).toBeNull();
    expect((data as { returned_to_pending: boolean }).returned_to_pending).toBe(false);
    expect((await row(sid)).status).toBe('pending');
  });

  it("the pop-up's Approve: a supervisor may re-approve the reopened day", async () => {
    const { sid } = await closedSession(crewMember, true);
    await correct('project_manager', sid, T('15:00'));
    expect((await row(sid)).status).toBe('pending');
    const { error } = await session.project_manager
      .from('time_clock_sessions')
      .update({
        status: 'approved',
        approved_by: await memberOf(IDENTITY.project_manager),
        approved_at: new Date().toISOString(),
      })
      .eq('id', sid);
    expect(error, error?.message).toBeNull();
    const after = await row(sid);
    expect(after.status).toBe('approved');
    expect(iso(after.clock_out), 'the corrected hours are what was approved').toBe(T('15:00'));
  });

  it('refused before writing: clock-out earlier than clock-in (nothing changes)', async () => {
    const { sid } = await closedSession(crewMember, true);
    const { error } = await correct('owner', sid, T('07:00'));
    expect(error?.code).toBe('22023');
    const after = await row(sid);
    expect(iso(after.clock_out)).toBe(T('16:00'));
    expect(after.status).toBe('approved');
  });
});

describe('WEEK SHEET — S121 still reports the reopen it caused', () => {
  it('edit_time_segment on an approved day → returned_to_pending = true', async () => {
    const { sid, seg } = await closedSession(crewMember, true);
    const { data, error } = await session.owner.rpc('edit_time_segment', {
      p_segment_id: seg,
      p_segment_type: 'break',
      p_start: T('08:00'),
      p_end: T('15:50'),
    });
    expect(error, error?.message).toBeNull();
    expect((data as { returned_to_pending: boolean }).returned_to_pending).toBe(true);
    expect((await row(sid)).status).toBe('pending');
  });
});

describe('SELF — the live clock flow on an OPEN session is untouched', () => {
  it('a crew member ends their own segment and clocks out on an open session someone approved', async () => {
    const { data: s, error } = await admin
      .from('time_clock_sessions')
      .insert({
        company_id: companyId,
        member_id: crewMember,
        clock_in: T('08:00'),
        status: 'pending',
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    const sid = s!.id as string;
    const { data: seg } = await admin
      .from('time_segments')
      .insert({
        company_id: companyId,
        session_id: sid,
        segment_type: 'break',
        segment_start: T('08:00'),
      })
      .select('id')
      .single();
    await approve(sid); // odd but possible: a supervisor approved a still-open day

    const endSeg = await session.crew_member
      .from('time_segments')
      .update({ segment_end: T('16:00') })
      .eq('id', seg!.id);
    expect(endSeg.error, `own segment end refused: ${endSeg.error?.message}`).toBeNull();
    const out = await session.crew_member
      .from('time_clock_sessions')
      .update({ clock_out: T('16:00') })
      .eq('id', sid);
    expect(out.error, `own clock-out refused: ${out.error?.message}`).toBeNull();
    const after = await row(sid);
    expect(iso(after.clock_out), 'the clock-out landed').toBe(T('16:00'));
    expect(after.status, 'hours changed after approval → pending').toBe('pending');
  });
});

describe('AUDIT — an Owner/Admin correcting their OWN session is logged', () => {
  it('owner, own session, through the RPC → 1 audit row, action clock', async () => {
    const { sid } = await closedSession(ownerMember, true);
    const { error } = await correct('owner', sid, T('15:00'));
    expect(error, error?.message).toBeNull();
    const audit = await auditRows(sid);
    expect(audit.length).toBe(1);
    expect(audit[0].changes.action).toBe('clock');
  });

  it('control: an ordinary own update without the function stays unlogged (and did land)', async () => {
    const { sid } = await closedSession(ownerMember, false);
    const { error } = await session.owner
      .from('time_clock_sessions')
      .update({ gps_out: null })
      .eq('id', sid);
    expect(error, error?.message).toBeNull();
    const { error: e2 } = await session.owner
      .from('time_clock_sessions')
      .update({ clock_out: T('15:10') })
      .eq('id', sid);
    expect(e2, e2?.message).toBeNull();
    expect(iso((await row(sid)).clock_out), 'the write landed').toBe(T('15:10'));
    expect((await auditRows(sid)).length).toBe(0);
  });
});
