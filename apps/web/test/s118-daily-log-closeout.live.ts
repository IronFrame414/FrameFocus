/**
 * S118 item 12 — the daily log brought up to the paper close-out form.
 * Migration 20262070000000.
 *
 *   A/C/E are plain nullable columns the AUTHOR writes (both forms).
 *   D is daily_log_material_needs; the AUTHOR writes the item fields.
 *   "Office reviewed" and D's "ordered (office)" are the OFFICE's marks —
 *   Owner/Admin/PM/PE, through two SECURITY DEFINER functions that re-check
 *   role and project; a column guard stops anyone else setting them directly.
 *
 * Every refusal is judged by the SERVICE ROLE; writes without returning rows.
 * Disposable project (marker `S118L`), swept before and after.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CompanyRole } from '@framefocus/shared/types/roles';
import { forEveryRole } from '@/test-support/role-matrix';
import { admin, assertRebuildTest, deleteProjects, sessionFor } from './live-session';

const MARKER = 'S118L';
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
const ASSIGN: Partial<Record<CompanyRole, string>> = {
  project_executive: 'project_executive',
  project_manager: 'project_manager',
  foreman: 'crew',
  crew_member: 'crew',
  subcontractor: 'crew',
};

const session = {} as Record<CompanyRole, SupabaseClient>;
let companyId = '';
let contactId = '';
let projectId = '';
let offProjectId = '';
const member = {} as Record<CompanyRole, string>;

async function memberIdOf(email: string): Promise<string> {
  const { data: p } = await admin.from('profiles').select('id').eq('email', email).single();
  const { data: m } = await admin
    .from('company_members')
    .select('id')
    .eq('profile_id', p!.id)
    .maybeSingle();
  return (m?.id as string) ?? '';
}

async function sweep() {
  const { data: ps } = await admin.from('projects').select('id').like('name', `${MARKER} %`);
  const ids = (ps ?? []).map((p) => p.id as string);
  if (ids.length) {
    const { data: logs } = await admin.from('daily_logs').select('id').in('project_id', ids);
    const logIds = (logs ?? []).map((l) => l.id as string);
    if (logIds.length) {
      await admin.from('daily_log_material_needs').delete().in('daily_log_id', logIds);
      await admin.from('daily_log_crew').delete().in('daily_log_id', logIds);
      await admin.from('daily_logs').delete().in('id', logIds);
    }
    await admin.from('project_assignments').delete().in('project_id', ids);
    await deleteProjects(admin, ids);
  }
  const { data: cs } = await admin
    .from('contacts')
    .select('id')
    .eq('last_name', `${MARKER} Client`);
  const cIds = (cs ?? []).map((c) => c.id as string);
  if (cIds.length) {
    await admin.from('qb_sync_queue').delete().in('entity_id', cIds);
    await admin.from('contacts').delete().in('id', cIds);
  }
}

async function makeProject(tag: string, seq: number, assign: boolean): Promise<string> {
  const { data, error } = await admin
    .from('projects')
    .insert({
      company_id: companyId,
      contact_id: contactId,
      project_number: `PRJ-${MARKER}-${tag}`,
      name: `${MARKER} ${tag} project`,
      status: 'active',
      project_internal_seq: seq,
    })
    .select('id')
    .single();
  if (error) throw new Error(`project ${tag}: ${error.message}`);
  if (assign) {
    for (const [role, onProject] of Object.entries(ASSIGN) as [CompanyRole, string][]) {
      const { error: aErr } = await admin
        .from('project_assignments')
        .insert({
          company_id: companyId,
          project_id: data!.id,
          member_id: member[role],
          role_on_project: onProject,
        });
      if (aErr) throw new Error(`assign ${role}: ${aErr.message}`);
    }
  }
  return data!.id as string;
}

/** A log authored by the CREW member (service role), for one test. */
async function crewLog(project = projectId): Promise<string> {
  const { data, error } = await admin
    .from('daily_logs')
    .insert({
      company_id: companyId,
      project_id: project,
      log_date: '2026-09-29',
      work_performed: `${MARKER} work`,
      author_member_id: member.crew_member,
      hazards_present: false,
    })
    .select('id')
    .single();
  if (error) throw new Error(`log: ${error.message}`);
  return data!.id as string;
}
async function logRow(id: string) {
  const { data } = await admin.from('daily_logs').select('*').eq('id', id).single();
  return data as Record<string, unknown>;
}
async function needRow(id: string) {
  const { data } = await admin.from('daily_log_material_needs').select('*').eq('id', id).single();
  return data as Record<string, unknown>;
}

beforeAll(async () => {
  assertRebuildTest();
  const { data: prof } = await admin
    .from('profiles')
    .select('company_id')
    .eq('email', IDENTITY.owner)
    .single();
  companyId = prof!.company_id as string;
  await sweep();
  for (const role of Object.keys(IDENTITY) as CompanyRole[])
    member[role] = await memberIdOf(IDENTITY[role]);
  const { data: c, error: cErr } = await admin
    .from('contacts')
    .insert({
      company_id: companyId,
      first_name: 'Log',
      last_name: `${MARKER} Client`,
      contact_type: 'client',
    })
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
  const base = (seqRow?.project_internal_seq ?? 0) + 8000;
  projectId = await makeProject('on', base, true);
  offProjectId = await makeProject('off', base + 1, false);
  for (const role of Object.keys(IDENTITY) as CompanyRole[])
    session[role] = await sessionFor(IDENTITY[role]);
}, 240_000);

afterAll(async () => {
  await sweep();
  const { count } = await admin
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .like('name', `${MARKER} %`);
  expect(count ?? 0).toBe(0);
}, 180_000);

describe('existing logs are untouched — every new column is NULL on rows written before it', () => {
  it('no pre-existing daily log carries a close-out answer, a date, blockers or a review', async () => {
    const { count } = await admin
      .from('daily_logs')
      .select('id', { count: 'exact', head: true })
      .not('work_performed', 'like', `${MARKER}%`)
      .or(
        'closeout_floors_swept.not.is.null,closeout_site_secured.not.is.null,photos_sent_at.not.is.null,tasks_day_after.not.is.null,blockers.not.is.null,office_reviewed_at.not.is.null'
      );
    expect(count).toBe(0);
    const { count: total } = await admin
      .from('daily_logs')
      .select('id', { count: 'exact', head: true });
    expect(total ?? 0, 'control: there ARE existing logs to be untouched').toBeGreaterThan(0);
  });
});

describe('A / C / E — the author writes them (create and edit)', () => {
  it("crew creates a log with the paper form's fields; the service role reads them back", async () => {
    const { error } = await session.crew_member.from('daily_logs').insert({
      project_id: projectId,
      log_date: '2026-09-28',
      work_performed: `${MARKER} crew create`,
      hazards_present: false,
      closeout_floors_swept: true,
      closeout_site_secured: false,
      photos_sent_at: '2026-09-28T21:15:00.000Z',
      tasks_tomorrow_date: '2026-09-29',
      tasks_day_after: 'Hang doors',
      tasks_day_after_date: '2026-09-30',
      blockers: 'Waiting on the electrical inspection',
    });
    expect(error, error?.message).toBeNull();
    const { data } = await admin
      .from('daily_logs')
      .select('*')
      .eq('work_performed', `${MARKER} crew create`)
      .single();
    expect(data).toMatchObject({
      closeout_floors_swept: true,
      closeout_site_secured: false,
      closeout_debris_hauled: null,
      tasks_tomorrow_date: '2026-09-29',
      tasks_day_after: 'Hang doors',
      tasks_day_after_date: '2026-09-30',
      blockers: 'Waiting on the electrical inspection',
      office_reviewed_at: null,
    });
    expect(new Date(data!.photos_sent_at as string).toISOString()).toBe('2026-09-28T21:15:00.000Z');
  });
});

const OFFICE: Record<CompanyRole, boolean> = {
  owner: true,
  admin: true,
  project_executive: true,
  project_manager: true,
  foreman: false,
  crew_member: false,
  subcontractor: false,
  client: false,
};

describe('"Office reviewed" — Owner/Admin/PM/PE only (total map), through the function', () => {
  forEveryRole(OFFICE, (role, may) => {
    it(`${role}: mark_daily_log_reviewed → ${may ? 'marked' : 'refused, unchanged'}`, async () => {
      const id = await crewLog();
      await session[role].rpc('mark_daily_log_reviewed', { p_log_id: id, p_reviewed: true });
      const row = await logRow(id);
      expect(row.office_reviewed_at !== null, `${role}`).toBe(may);
      if (may) expect(row.office_reviewed_by).toBe(member[role]);
    });
  });

  it('the AUTHOR cannot mark their own log reviewed by a direct UPDATE (column guard)', async () => {
    const id = await crewLog();
    await session.crew_member
      .from('daily_logs')
      .update({ office_reviewed_at: new Date().toISOString() })
      .eq('id', id);
    expect((await logRow(id)).office_reviewed_at).toBeNull();
    // Control: the same author CAN update a paper-form field on the same row.
    await session.crew_member
      .from('daily_logs')
      .update({ blockers: `${MARKER} author edit` })
      .eq('id', id);
    expect((await logRow(id)).blockers).toBe(`${MARKER} author edit`);
  });

  it('a PM on a project it is NOT assigned to is refused', async () => {
    const id = await crewLog(offProjectId);
    await session.project_manager.rpc('mark_daily_log_reviewed', {
      p_log_id: id,
      p_reviewed: true,
    });
    expect((await logRow(id)).office_reviewed_at).toBeNull();
  });

  it('the office can clear it again', async () => {
    const id = await crewLog();
    await session.project_manager.rpc('mark_daily_log_reviewed', {
      p_log_id: id,
      p_reviewed: true,
    });
    await session.project_manager.rpc('mark_daily_log_reviewed', {
      p_log_id: id,
      p_reviewed: false,
    });
    const row = await logRow(id);
    expect(row.office_reviewed_at).toBeNull();
    expect(row.office_reviewed_by).toBeNull();
  });
});

describe('D — needed on site: the author writes lines, the OFFICE marks them ordered', () => {
  async function authorLine(logId: string): Promise<string> {
    const { error } = await session.crew_member
      .from('daily_log_material_needs')
      .insert({
        daily_log_id: logId,
        item: `${MARKER} 2x4 studs`,
        qty: 40,
        unit: 'each',
        needed_by: '2026-10-01',
        vendor_source: 'Home Depot',
      });
    expect(error, error?.message).toBeNull();
    const { data } = await admin
      .from('daily_log_material_needs')
      .select('id')
      .eq('daily_log_id', logId)
      .eq('item', `${MARKER} 2x4 studs`)
      .single();
    return data!.id as string;
  }

  it('the author adds a line (all five paper fields land)', async () => {
    const id = await authorLine(await crewLog());
    expect(await needRow(id)).toMatchObject({
      qty: 40,
      unit: 'each',
      needed_by: '2026-10-01',
      vendor_source: 'Home Depot',
      ordered_at: null,
    });
  });

  forEveryRole(OFFICE, (role, may) => {
    it(`${role}: set_daily_log_material_ordered → ${may ? 'ordered' : 'refused, unchanged'}`, async () => {
      const id = await authorLine(await crewLog());
      await session[role].rpc('set_daily_log_material_ordered', { p_need_id: id, p_ordered: true });
      const row = await needRow(id);
      expect(row.ordered_at !== null, role).toBe(may);
      if (may) expect(row.ordered_by).toBe(member[role]);
    });
  });

  it('the author cannot set ordered_* directly — on insert or update', async () => {
    const logId = await crewLog();
    await session.crew_member
      .from('daily_log_material_needs')
      .insert({
        daily_log_id: logId,
        item: `${MARKER} self-ordered`,
        ordered_at: new Date().toISOString(),
      });
    const { count } = await admin
      .from('daily_log_material_needs')
      .select('id', { count: 'exact', head: true })
      .eq('item', `${MARKER} self-ordered`);
    expect(count).toBe(0);
    const id = await authorLine(logId);
    await session.crew_member
      .from('daily_log_material_needs')
      .update({ ordered_at: new Date().toISOString() })
      .eq('id', id);
    expect((await needRow(id)).ordered_at).toBeNull();
  });

  it("a crew member who is NOT the author cannot add a line to someone else's log", async () => {
    const { data: log } = await admin
      .from('daily_logs')
      .insert({
        company_id: companyId,
        project_id: projectId,
        log_date: '2026-09-27',
        work_performed: `${MARKER} foreman log`,
        author_member_id: member.foreman,
        hazards_present: false,
      })
      .select('id')
      .single();
    await session.crew_member
      .from('daily_log_material_needs')
      .insert({ daily_log_id: log!.id, item: `${MARKER} intruder` });
    const { count } = await admin
      .from('daily_log_material_needs')
      .select('id', { count: 'exact', head: true })
      .eq('item', `${MARKER} intruder`);
    expect(count).toBe(0);
  });

  it("the author's later edit keeps the office's ordered mark", async () => {
    const id = await authorLine(await crewLog());
    await session.owner.rpc('set_daily_log_material_ordered', { p_need_id: id, p_ordered: true });
    await session.crew_member.from('daily_log_material_needs').update({ qty: 44 }).eq('id', id);
    const row = await needRow(id);
    expect(row.qty).toBe(44);
    expect(row.ordered_at).not.toBeNull();
  });
});
