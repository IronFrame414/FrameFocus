/**
 * S127 item 7 — a work ↔ break change on an APPROVED day returns it to pending.
 * ⚠️ PAYROLL. Migration 20262134200000. [RULED Josh, S127 #8; #9: report, never correct.]
 *
 *   TOTAL MAP  every role flips a crew member's approved break → shop through a
 *              plain UPDATE (the supervisor day-page path, and the direct-API
 *              path for Owner/Admin). Allowed roles: the write lands AND the day
 *              is pending. Refused roles: the type is unchanged AND the day is
 *              still approved. Judged by the SERVICE ROLE; writes return no rows.
 *   WORK       break → work (with a job) by a PM reopens too.
 *   CONTROLS   a non-break retype (shop → travel) and a note-only change keep
 *              the day approved — the write landed and nothing reopened;
 *              a pending day stays pending.
 *   SELF       a crew member retyping their OWN approved break through the API
 *              is REFUSED (42501), type and approval unchanged.
 *
 * The live clock flow on an open session and the week sheet's own reopen are
 * S122's, re-run unchanged (s122-session-clock-edit.live.ts).
 *
 * Disposable fixture: sessions on 2020-01-27 (no real time sits there), swept
 * before and after; the SELF fixture sits after the crew member's latest real
 * segment, marked by its note.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CompanyRole } from '@framefocus/shared/types/roles';
import { forEveryRole } from '@/test-support/role-matrix';
import { admin, assertRebuildTest, sessionFor } from './live-session';

const DAY = '2020-01-27'; // not 2020-01-20: e2e/desktop-day-clock-edit-s122 sweeps that day
const SELF_NOTE = 'S127ST-self';
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
// Who may retype a CREW member's segment — unchanged authority: Owner/Admin by
// role; PE, PM, foreman by can_approve_member over crew. Crew here is SELF (its
// own day), refused by the new arm or by is_my_recent_segment; client and sub
// have no write arm.
const MAY_RETYPE_CREW: Record<CompanyRole, boolean> = {
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
let projectId = '';
const T = (hhmm: string, day = DAY) => `${day}T${hhmm}:00.000Z`;

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

async function purge(ids: string[]) {
  if (!ids.length) return;
  await admin.from('time_edit_logs').delete().in('session_id', ids);
  await admin.from('time_segments').delete().in('session_id', ids);
  await admin.from('time_session_rate_snapshots').delete().in('session_id', ids);
  await admin.from('time_clock_sessions').delete().in('id', ids);
}

async function sweep() {
  const { data: selfSegs } = await admin.from('time_segments').select('session_id').eq('note', SELF_NOTE);
  await purge([...new Set((selfSegs ?? []).map((r) => r.session_id as string))]);
  const { data: ss } = await admin
    .from('time_clock_sessions')
    .select('id')
    .eq('member_id', crewMember)
    .gte('clock_in', `${DAY}T00:00:00Z`)
    .lt('clock_in', `${DAY}T23:59:59Z`);
  await purge((ss ?? []).map((s) => s.id as string));
}

async function approve(sid: string) {
  const { error } = await admin
    .from('time_clock_sessions')
    .update({ status: 'approved', approved_by: ownerMember, approved_at: new Date().toISOString() })
    .eq('id', sid);
  if (error) throw new Error(`approve: ${error.message}`);
}

/**
 * A CLOSED crew session with one ended segment of `type`, optionally approved.
 * Each fixture gets its own hour so sessions never overlap.
 */
let slot = 0;
async function closedDay(type: string, approved: boolean, day = DAY, note: string | null = null) {
  const h = String(slot++ % 20).padStart(2, '0');
  const { data: s, error } = await admin
    .from('time_clock_sessions')
    .insert({
      company_id: companyId,
      member_id: crewMember,
      clock_in: T(`${h}:00`, day),
      clock_out: T(`${h}:50`, day),
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
      segment_type: type,
      project_id: type === 'work' ? projectId : null,
      segment_start: T(`${h}:00`, day),
      segment_end: T(`${h}:50`, day),
      note,
    })
    .select('id')
    .single();
  if (sErr) throw new Error(`segment: ${sErr.message}`);
  if (approved) await approve(sid);
  return { sid, seg: seg!.id as string };
}

async function status(sid: string) {
  const { data } = await admin.from('time_clock_sessions').select('status, approved_by').eq('id', sid).single();
  return data as { status: string | null; approved_by: string | null };
}
async function segRow(seg: string) {
  const { data } = await admin.from('time_segments').select('segment_type, note').eq('id', seg).single();
  return data as { segment_type: string; note: string | null };
}

beforeAll(async () => {
  assertRebuildTest();
  const { data: prof } = await admin.from('profiles').select('company_id').eq('email', IDENTITY.owner).single();
  companyId = prof!.company_id as string;
  crewMember = await memberOf(IDENTITY.crew_member);
  ownerMember = await memberOf(IDENTITY.owner);
  // Any live project of the company, ordered so the pick is stable (a `work`
  // segment needs one; which one is irrelevant to the rule under test).
  const { data: proj } = await admin
    .from('projects')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  projectId = proj!.id as string;
  await sweep();
  for (const role of Object.keys(IDENTITY) as CompanyRole[]) session[role] = await sessionFor(IDENTITY[role]);
}, 240_000);

afterAll(async () => {
  await sweep();
  const { count } = await admin
    .from('time_clock_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', crewMember)
    .gte('clock_in', `${DAY}T00:00:00Z`)
    .lt('clock_in', `${DAY}T23:59:59Z`);
  expect(count ?? 0).toBe(0);
}, 180_000);

describe('REOPEN — break → shop on an APPROVED day: TOTAL MAP, judged by the service role', () => {
  forEveryRole(MAY_RETYPE_CREW, (role, allowed) => {
    it(`${role}: ${allowed ? 'retypes, and the day returns to pending' : 'is refused; still approved'}`, async () => {
      const { sid, seg } = await closedDay('break', true);
      expect((await status(sid)).status).toBe('approved');
      // ⚠️ No .select(): judged by the service role's read-back alone.
      const { error } = await session[role].from('time_segments').update({ segment_type: 'shop' }).eq('id', seg);
      const after = await status(sid);
      const s = await segRow(seg);
      console.log(`[S127ST] ${role}: error=${error?.code ?? 'none'} type=${s.segment_type} status=${after.status}`);
      if (allowed) {
        expect(error, error?.message).toBeNull();
        expect(s.segment_type, 'the write landed').toBe('shop');
        expect(after.status, 'paid time moved → pending').toBe('pending');
        expect(after.approved_by).toBeNull();
      } else {
        expect(s.segment_type, 'type unchanged').toBe('break');
        expect(after.status, 'still approved').toBe('approved');
        expect(after.approved_by).toBe(ownerMember);
      }
    });
  });
});

describe('the other cases', () => {
  it('break → work (with a job) by a PM reopens', async () => {
    const { sid, seg } = await closedDay('break', true);
    const { error } = await session.project_manager
      .from('time_segments')
      .update({ segment_type: 'work', project_id: projectId })
      .eq('id', seg);
    expect(error, error?.message).toBeNull();
    expect((await segRow(seg)).segment_type).toBe('work');
    expect((await status(sid)).status).toBe('pending');
  });

  it('control: shop → travel (no break involved) by a foreman keeps the day approved', async () => {
    const { sid, seg } = await closedDay('shop', true);
    const { error } = await session.foreman.from('time_segments').update({ segment_type: 'travel' }).eq('id', seg);
    expect(error, error?.message).toBeNull();
    expect((await segRow(seg)).segment_type, 'the write landed').toBe('travel');
    expect((await status(sid)).status, 'pay unchanged → still approved').toBe('approved');
  });

  it('control: a note-only change by a foreman keeps the day approved', async () => {
    const { sid, seg } = await closedDay('break', true);
    const { error } = await session.foreman.from('time_segments').update({ note: 'S127ST note' }).eq('id', seg);
    expect(error, error?.message).toBeNull();
    expect((await segRow(seg)).note, 'the write landed').toBe('S127ST note');
    expect((await status(sid)).status).toBe('approved');
  });

  it('control: a PENDING day retyped stays pending', async () => {
    const { sid, seg } = await closedDay('break', false);
    const { error } = await session.foreman.from('time_segments').update({ segment_type: 'shop' }).eq('id', seg);
    expect(error, error?.message).toBeNull();
    expect((await segRow(seg)).segment_type).toBe('shop');
    expect((await status(sid)).status).toBe('pending');
  });
});

describe('SELF — a crew member cannot retype their own APPROVED break through the API', () => {
  it('refused with 42501; type and approval unchanged', async () => {
    // The fixture must be the crew member's MOST RECENT segment, or
    // is_my_recent_segment filters the write to 0 rows and the trigger under
    // test never runs (S122's sabotage (iii) lesson). So it sits two days after
    // their latest real segment, marked by SELF_NOTE for the sweep.
    const { data: latest } = await admin
      .from('time_segments')
      .select('segment_start, time_clock_sessions!inner(member_id)')
      .eq('time_clock_sessions.member_id', crewMember)
      .eq('is_deleted', false)
      .order('segment_start', { ascending: false })
      .limit(1)
      .maybeSingle();
    const base = latest ? new Date(latest.segment_start as string) : new Date('2020-01-21T00:00:00Z');
    const day = new Date(base.getTime() + 2 * 86_400_000).toISOString().slice(0, 10);
    const { sid, seg } = await closedDay('break', true, day, SELF_NOTE);

    const { error } = await session.crew_member.from('time_segments').update({ segment_type: 'shop' }).eq('id', seg);
    console.log(`[S127ST] self: error=${error?.code ?? 'none'} ${error?.message ?? ''}`);
    expect(error?.code, 'the database must refuse, not filter').toBe('42501');
    expect((await segRow(seg)).segment_type).toBe('break');
    expect((await status(sid)).status).toBe('approved');
  });
});
