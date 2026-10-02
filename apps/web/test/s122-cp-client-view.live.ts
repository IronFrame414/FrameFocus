/**
 * S122 Part 7 — client_critical_path(): the client's ONLY Critical Path read.
 * Migration 20262130000000. [ruling 8; Josh, 2026-10-01/02, report R2.10]
 *
 *   Fixture S122CPV (company A), linked to the LINKED client by projects.contact_id
 *   (S164 arm a). Phases Framing(1), Finish(2). A(3, Framing) → B(Finish).
 *   Crew assigned to A. Critical Path ON, computed by the engine; then B 2 → 4,
 *   so the finish moves Fri 8 → Tue 12 Jan and a REAL history row exists.
 *
 *   LINKED on S122CPV   → EXACTLY two rows: phase name/sort/start/finish, task
 *                          title/sort, projected finish — the closed shape, the
 *                          exact values. No float column exists to leak.
 *   ⚠️ UNLINKED (same company, contact NULL) on S122CPV — CP ON, data present —
 *                        → 0 rows. Only the link check stands between them.
 *   LINKED on a CP-OFF project (S164's eaf0e25b) → 0 rows: not a second back door.
 *   CP turned OFF on S122CPV → 0 rows for the linked client too; back ON → rows.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { recomputeProject } from '@/lib/critical-path/recompute';
import { admin, assertRebuildTest, deleteProjects, sessionFor, sweepProjectsNamed } from './live-session';

const MARKER = 'S122CPV';
const LINKED = 'josh+qa-client-linked@worthprop.com';
const CONTROL = 'josh+qa-client@worthprop.com';
const CREW = 'josh+crew@worthprop.com';
const CP_OFF_PROJECT = 'eaf0e25b-d60e-49c0-89b2-5612118d94b4';
const KEYS = ['phase_finish', 'phase_name', 'phase_sort', 'phase_start', 'projected_finish', 'task_sort', 'task_title'];

const db = admin as unknown as SupabaseClient<Database>;
let linked: SupabaseClient;
let control: SupabaseClient;
let companyId = '';
let projectId = '';
/** A CP-ON project with data, linked to ANOTHER contact: the full-access client is a stranger to it. */
let strangerProjectId = '';
const task = { A: '', B: '' };

const must = (label: string, error: { message: string } | null) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};

async function purge(id: string) {
  const { data: ts } = await admin.from('tasks').select('id').eq('project_id', id);
  const ids = (ts ?? []).map((r) => r.id as string);
  await admin.from('notifications').delete().eq('project_id', id);
  await admin.from('task_schedule_edits').delete().eq('project_id', id);
  await admin.from('project_finish_history').delete().eq('project_id', id);
  await admin.from('project_schedule_settings').delete().eq('project_id', id);
  if (ids.length) {
    await admin.from('task_dependencies').delete().in('successor_id', ids);
    await admin.from('task_assignees').delete().in('task_id', ids);
    await admin.from('tasks').delete().in('id', ids);
  }
  await admin.from('phases').delete().eq('project_id', id);
  await deleteProjects(admin, [id]);
}

async function view(c: SupabaseClient, project: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await c.rpc('client_critical_path', { p_project_id: project });
  if (error) throw new Error(`client_critical_path: ${error.message}`);
  return (data ?? []) as Record<string, unknown>[];
}

beforeAll(async () => {
  assertRebuildTest();
  const { data: stale } = await admin.from('projects').select('id').like('name', `${MARKER}%`);
  for (const r of stale ?? []) await purge(r.id as string);
  await sweepProjectsNamed(MARKER);
  [linked, control] = await Promise.all([sessionFor(LINKED), sessionFor(CONTROL)]);

  const { data: lp } = await admin.from('profiles').select('contact_id, company_id').eq('email', LINKED).single();
  const l = lp as { contact_id: string | null; company_id: string };
  if (!l.contact_id) throw new Error(`${LINKED} is unlinked — run the seed; every assertion here would be vacuous.`);
  companyId = l.company_id;
  const { data: cp } = await admin.from('profiles').select('contact_id, role, company_id').eq('email', CONTROL).single();
  const c = cp as { contact_id: string | null; role: string; company_id: string };
  if (c.contact_id !== null || c.role !== 'client' || c.company_id !== companyId) {
    throw new Error(`${CONTROL} must be an UNLINKED client in the SAME company (only the link check may refuse it).`);
  }
  const { data: lvl } = await linked.rpc('my_client_access_level');
  if (lvl !== 'full') throw new Error(`${LINKED} must have FULL access (has ${String(lvl)}) — the schedule is refused otherwise.`);

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
      contact_id: l.contact_id,
      name: `${MARKER} client view`,
      status: 'active',
      project_number: `PRJ-${MARKER}`,
      project_internal_seq: (seqRow!.project_internal_seq as number) + 9500,
      start_date: '2027-01-04',
    })
    .select('id')
    .single();
  must('project', error);
  projectId = proj!.id as string;

  const ph = async (name: string, sort: number) => {
    const { data, error: e } = await admin.from('phases').insert({ company_id: companyId, project_id: projectId, name, sort_order: sort }).select('id').single();
    must(`phase ${name}`, e);
    return data!.id as string;
  };
  const framing = await ph('Framing', 1);
  const finish = await ph('Finish', 2);
  const t = async (title: string, phaseId: string, days: number) => {
    const { data, error: e } = await admin
      .from('tasks')
      .insert({ company_id: companyId, project_id: projectId, title, phase_id: phaseId, duration_days: days })
      .select('id')
      .single();
    must(`task ${title}`, e);
    return data!.id as string;
  };
  task.A = await t(`${MARKER} A`, framing, 3);
  task.B = await t(`${MARKER} B`, finish, 2);
  must('dep', (await admin.from('task_dependencies').insert({ company_id: companyId, predecessor_id: task.A, successor_id: task.B })).error);
  const { data: crewProf } = await admin.from('profiles').select('id').eq('email', CREW).single();
  const { data: crewMember } = await admin.from('company_members').select('id').eq('profile_id', crewProf!.id).eq('is_deleted', false).single();
  must('assignee', (await admin.from('task_assignees').insert({ company_id: companyId, task_id: task.A, member_id: crewMember!.id })).error);
  must('cp on', (await admin.from('project_schedule_settings').insert({ company_id: companyId, project_id: projectId, critical_path_enabled: true })).error);

  const now = new Date('2026-10-05T16:00:00Z');
  const first = await recomputeProject(db, projectId, { cause: { kind: 'enabled' }, now });
  expect(first).toMatchObject({ status: 'computed', projectedFinish: '2027-01-08' });
  must('B 2 -> 4', (await admin.from('tasks').update({ duration_days: 4 }).eq('id', task.B)).error);
  const second = await recomputeProject(db, projectId, { cause: { kind: 'task', taskId: task.B }, now });
  expect(second).toMatchObject({ status: 'computed', projectedFinish: '2027-01-12' });
  const { count } = await admin.from('project_finish_history').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('previous_finish', '2027-01-08');
  expect(count, 'a REAL history row with the old finish exists — the thing the client must never see').toBe(1);

  // The STRANGER fixture: CP on, computed, linked to a DIFFERENT client contact.
  const { data: other } = await admin
    .from('contacts')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .neq('id', l.contact_id)
    .order('id', { ascending: true })
    .limit(1)
    .single();
  const { data: sp, error: spErr } = await admin
    .from('projects')
    .insert({
      company_id: companyId,
      contact_id: (other as { id: string }).id,
      name: `${MARKER} stranger`,
      status: 'active',
      project_number: `PRJ-${MARKER}-X`,
      project_internal_seq: (seqRow!.project_internal_seq as number) + 9501,
      start_date: '2027-01-04',
    })
    .select('id')
    .single();
  must('stranger project', spErr);
  strangerProjectId = sp!.id as string;
  const { data: pc } = await admin.from('project_contacts').select('id').eq('project_id', strangerProjectId).eq('contact_id', l.contact_id);
  expect(pc ?? [], 'the linked client has NO project_contacts row on the stranger project').toHaveLength(0);
  must(
    'stranger task',
    (await admin.from('tasks').insert({ company_id: companyId, project_id: strangerProjectId, title: `${MARKER} X`, duration_days: 2 })).error
  );
  must(
    'stranger cp on',
    (await admin.from('project_schedule_settings').insert({ company_id: companyId, project_id: strangerProjectId, critical_path_enabled: true })).error
  );
  expect(await recomputeProject(db, strangerProjectId, { cause: { kind: 'enabled' }, now })).toMatchObject({ status: 'computed', projectedFinish: '2027-01-05' });
}, 300_000);

afterAll(async () => {
  if (projectId) await purge(projectId);
  if (strangerProjectId) await purge(strangerProjectId);
  const { count } = await admin.from('projects').select('id', { count: 'exact', head: true }).like('name', `${MARKER}%`);
  expect(count ?? 0).toBe(0);
}, 300_000);

describe('client_critical_path — the linked client on a Critical Path project', () => {
  it('EXACTLY two rows: the closed shape and the exact values (phase dates, titles, finish — nothing else)', async () => {
    const rows = await view(linked, projectId);
    expect(rows.length).toBe(2);
    for (const r of rows) expect(Object.keys(r).sort()).toEqual(KEYS);
    expect(rows).toEqual([
      { phase_name: 'Framing', phase_sort: 1, phase_start: '2027-01-04', phase_finish: '2027-01-06', task_title: `${MARKER} A`, task_sort: 1, projected_finish: '2027-01-12' },
      { phase_name: 'Finish', phase_sort: 2, phase_start: '2027-01-07', phase_finish: '2027-01-12', task_title: `${MARKER} B`, task_sort: 1, projected_finish: '2027-01-12' },
    ]);
  });

  it('⚠️ and nothing in what came back is the OLD finish (history) or a duration', async () => {
    const s = JSON.stringify(await view(linked, projectId));
    expect(s).not.toContain('2027-01-08');
    expect(s).not.toMatch(/duration|float|critical|assignee|status|days_left/i);
  });

  it('and the tasks TABLE is still closed to them (the function is the only read)', async () => {
    const { data } = await linked.from('tasks').select('id').eq('project_id', projectId);
    expect(data ?? []).toHaveLength(0);
  });
});

describe('the controls', () => {
  it('⚠️ THE STRANGER: the FULL-ACCESS client on a CP-ON project linked to someone else → 0 rows (only the LINK check refuses this)', async () => {
    // Positive half: the data exists and is computed, and the client's access IS full.
    const { data: s } = await admin.from('project_schedule_settings').select('projected_finish').eq('project_id', strangerProjectId).single();
    expect((s as { projected_finish: string | null }).projected_finish).toBe('2027-01-05');
    expect((await linked.rpc('my_client_access_level')).data).toBe('full');
    expect((await view(linked, projectId)).length, 'they DO read their own CP project').toBe(2);
    expect(await view(linked, strangerProjectId)).toHaveLength(0);
  });

  // NOTE [S122 Part 7, sabotage L]: the unlinked client below is refused by
  // client_has_full_access() too (a client with no contact has access 'none'),
  // so this test stayed GREEN with the link check removed. It proves a
  // contact-less stranger reads nothing; THE STRANGER test above proves the link.
  it('⚠️ UNLINKED client, same company, on the CP-ON project where the data exists → 0 rows', async () => {
    expect((await view(linked, projectId)).length, 'the positive half, so the 0 below is not vacuous').toBe(2);
    expect(await view(control, projectId)).toHaveLength(0);
  });

  it('LINKED on a CP-OFF project → 0 rows (not a second back door)', async () => {
    const { data } = await admin.from('project_schedule_settings').select('critical_path_enabled').eq('project_id', CP_OFF_PROJECT).eq('is_deleted', false);
    expect(((data ?? []) as { critical_path_enabled: boolean }[]).some((r) => r.critical_path_enabled), 'the fixture must be CP OFF').toBe(false);
    const { data: sched } = await linked.rpc('client_schedule', { p_project_id: CP_OFF_PROJECT });
    expect(((sched ?? []) as unknown[]).length, 'the linked client DOES reach that project (client_schedule has rows)').toBeGreaterThan(0);
    expect(await view(linked, CP_OFF_PROJECT)).toHaveLength(0);
  });

  it('CP turned OFF on the same project → 0 rows; back ON → the rows return', async () => {
    must('off', (await admin.from('project_schedule_settings').update({ critical_path_enabled: false }).eq('project_id', projectId)).error);
    expect(await view(linked, projectId)).toHaveLength(0);
    must('on', (await admin.from('project_schedule_settings').update({ critical_path_enabled: true }).eq('project_id', projectId)).error);
    expect(await view(linked, projectId)).toHaveLength(2);
  });
});
