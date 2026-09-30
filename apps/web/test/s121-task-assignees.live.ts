/**
 * S121 5-C — multi-assignee tasks, in the DATABASE. Migration 20262120000000.
 *
 *   BACKFILL    every task carrying an assignee_id has that member as a live
 *               join row (count-for-count).
 *   VISIBILITY  tasks_select_visible reads "I am AMONG the assignees": a sub
 *               who is SECOND on a task (assignee_id = someone else) reads it;
 *               a sub on no task reads none. A crew member NOT on the project
 *               but on the task reads it (the non-sub assignee arm).
 *   AUTHORITY   set_task_assignees / direct join writes: owner, admin, PM,
 *               foreman, PE (on the project) — TOTAL MAP; crew, sub, client
 *               refused (the live set judged by the service role).
 *   GUARD       the reassignment guard the old USING-as-CHECK gave by accident
 *               is explicit: an assignee who is crew cannot change assignee_id;
 *               they can still update their own task (control).
 *   SYNC        tasks.assignee_id = the EARLIEST live assignee; a direct write
 *               of assignee_id by a supervisor REPLACES the live set.
 *
 * Disposable projects (marker `S121TA`), swept before and after.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CompanyRole } from '@framefocus/shared/types/roles';
import { forEveryRole } from '@/test-support/role-matrix';
import { admin, assertRebuildTest, deleteProjects, sessionFor } from './live-session';

const MARKER = 'S121TA';
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
const ON_PROJECT: Partial<Record<CompanyRole, string>> = {
  project_executive: 'project_executive',
  project_manager: 'project_manager',
  foreman: 'crew',
  crew_member: 'crew',
  subcontractor: 'crew',
};
const SET: Record<CompanyRole, boolean> = {
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
const member = {} as Record<CompanyRole, string>;
let companyId = '';
let contactId = '';
let projectId = ''; // everyone assigned
let bareProjectId = ''; // nobody assigned

async function sweep() {
  const { data: ps } = await admin.from('projects').select('id').like('name', `${MARKER} %`);
  const ids = (ps ?? []).map((p) => p.id as string);
  if (ids.length) {
    const { data: ts } = await admin.from('tasks').select('id').in('project_id', ids);
    const tIds = (ts ?? []).map((t) => t.id as string);
    if (tIds.length) {
      await admin.from('task_assignees').delete().in('task_id', tIds);
      await admin.from('tasks').delete().in('id', tIds);
    }
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

async function makeProject(tag: string, seq: number, assign: boolean) {
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
  if (error) throw new Error(`project: ${error.message}`);
  if (assign) {
    for (const [role, on] of Object.entries(ON_PROJECT) as [CompanyRole, string][]) {
      const { error: aErr } = await admin.from('project_assignments').insert({
        company_id: companyId,
        project_id: data!.id,
        member_id: member[role],
        role_on_project: on,
      });
      if (aErr) throw new Error(`assign ${role}: ${aErr.message}`);
    }
  }
  return data!.id as string;
}

async function task(title: string, project = projectId, assignees: string[] = []): Promise<string> {
  const { data, error } = await admin
    .from('tasks')
    .insert({ company_id: companyId, project_id: project, title: `${MARKER} ${title}`, start_date: '2026-10-05', due_date: '2026-10-06' })
    .select('id')
    .single();
  if (error) throw new Error(`task: ${error.message}`);
  const id = data!.id as string;
  // In ORDER, one at a time, so created_at orders them (earliest = first).
  for (const m of assignees) {
    const { error: aErr } = await admin.from('task_assignees').insert({ company_id: companyId, task_id: id, member_id: m });
    if (aErr) throw new Error(`assignee: ${aErr.message}`);
    await new Promise((r) => setTimeout(r, 15));
  }
  return id;
}

async function live(taskId: string): Promise<string[]> {
  const { data } = await admin
    .from('task_assignees')
    .select('member_id')
    .eq('task_id', taskId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true });
  return ((data ?? []) as { member_id: string }[]).map((r) => r.member_id);
}
async function primary(taskId: string): Promise<string | null> {
  const { data } = await admin.from('tasks').select('assignee_id').eq('id', taskId).single();
  return (data as { assignee_id: string | null }).assignee_id;
}

beforeAll(async () => {
  assertRebuildTest();
  const { data: prof } = await admin.from('profiles').select('company_id').eq('email', IDENTITY.owner).single();
  companyId = prof!.company_id as string;
  await sweep();
  for (const role of Object.keys(IDENTITY) as CompanyRole[]) {
    const { data: p } = await admin.from('profiles').select('id').eq('email', IDENTITY[role]).single();
    const { data: m } = await admin.from('company_members').select('id').eq('profile_id', p!.id).maybeSingle();
    member[role] = (m?.id as string) ?? '';
  }
  const { data: c, error: cErr } = await admin
    .from('contacts')
    .insert({ company_id: companyId, first_name: 'Tasks', last_name: `${MARKER} Client`, contact_type: 'client' })
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
  const base = (seqRow?.project_internal_seq ?? 0) + 8500;
  projectId = await makeProject('on', base, true);
  bareProjectId = await makeProject('bare', base + 1, false);
  for (const role of Object.keys(IDENTITY) as CompanyRole[]) session[role] = await sessionFor(IDENTITY[role]);
}, 240_000);

afterAll(async () => {
  await sweep();
  const { count } = await admin.from('projects').select('id', { count: 'exact', head: true }).like('name', `${MARKER} %`);
  expect(count ?? 0).toBe(0);
}, 180_000);

describe('BACKFILL — every assignee_id is a live join row', () => {
  it('count-for-count, and each one matches', async () => {
    const { data: withA } = await admin.from('tasks').select('id, assignee_id').not('assignee_id', 'is', null);
    const rows = (withA ?? []) as { id: string; assignee_id: string }[];
    expect(rows.length, 'non-vacuous').toBeGreaterThan(0);
    for (const r of rows) {
      const { count } = await admin
        .from('task_assignees')
        .select('id', { count: 'exact', head: true })
        .eq('task_id', r.id)
        .eq('member_id', r.assignee_id)
        .eq('is_deleted', false);
      expect(count, r.id).toBe(1);
    }
  });
});

describe('VISIBILITY — "I am AMONG the assignees"', () => {
  it('a sub who is SECOND on a task (assignee_id = someone else) reads it; the task beside it, not', async () => {
    const shared = await task('shared', bareProjectId, [member.project_manager, member.subcontractor]);
    const other = await task('not-sub', bareProjectId, [member.project_manager]);
    expect(await primary(shared), 'assignee_id is the PM, not the sub').toBe(member.project_manager);
    const { data } = await session.subcontractor.from('tasks').select('id').in('id', [shared, other]);
    expect(((data ?? []) as { id: string }[]).map((r) => r.id)).toEqual([shared]);
  });

  it('a crew member NOT on the project but on the task reads it (the non-sub arm)', async () => {
    const t = await task('crew-second', bareProjectId, [member.foreman, member.crew_member]);
    const none = await task('crew-none', bareProjectId, [member.foreman]);
    const { data } = await session.crew_member.from('tasks').select('id').in('id', [t, none]);
    expect(((data ?? []) as { id: string }[]).map((r) => r.id)).toEqual([t]);
  });

  it('removing the sub from the task removes it from their reads', async () => {
    const t = await task('removed', bareProjectId, [member.subcontractor, member.project_manager]);
    await admin.from('task_assignees').update({ is_deleted: true }).eq('task_id', t).eq('member_id', member.subcontractor);
    const { data } = await session.subcontractor.from('tasks').select('id').eq('id', t);
    expect(data ?? []).toHaveLength(0);
  });
});

describe('AUTHORITY — who may set a task’s people (TOTAL MAP)', () => {
  forEveryRole(SET, (role, may) => {
    it(`${role}: set_task_assignees → ${may ? 'set' : 'refused, unchanged'}`, async () => {
      const t = await task(`set-${role}`, projectId, [member.crew_member]);
      await session[role].rpc('set_task_assignees', {
        p_task_id: t,
        p_member_ids: [member.crew_member, member.foreman],
      });
      expect((await live(t)).sort(), role).toEqual(
        (may ? [member.crew_member, member.foreman] : [member.crew_member]).sort()
      );
    });
  });

  it('a direct join INSERT by crew (written without returning rows) is refused', async () => {
    const t = await task('crew-direct', projectId, []);
    await session.crew_member.from('task_assignees').insert({ task_id: t, member_id: member.crew_member });
    expect(await live(t)).toEqual([]);
  });

  it('a PM on a project they are NOT on cannot set people there', async () => {
    const t = await task('pm-off', bareProjectId, []);
    await session.project_manager.rpc('set_task_assignees', { p_task_id: t, p_member_ids: [member.foreman] });
    expect(await live(t)).toEqual([]);
  });
});

describe('GUARD — an assignee who is crew cannot reassign; can still work their task', () => {
  it('crew on the task: assignee_id change refused, unchanged; status update allowed (control)', async () => {
    const t = await task('guard', bareProjectId, [member.crew_member]);
    const { error } = await session.crew_member.from('tasks').update({ assignee_id: member.foreman }).eq('id', t);
    expect(error?.message).toMatch(/Only a supervisor can change who is assigned/);
    expect(await primary(t)).toBe(member.crew_member);
    expect(await live(t)).toEqual([member.crew_member]);
    const { error: e2 } = await session.crew_member.from('tasks').update({ status: 'in_progress' }).eq('id', t);
    expect(e2).toBeNull();
    const { data } = await admin.from('tasks').select('status').eq('id', t).single();
    expect((data as { status: string }).status, 'the control write landed').toBe('in_progress');
  });
});

describe('SYNC — assignee_id is the EARLIEST live assignee; direct writes replace the set', () => {
  it('[A, B] → A; drop A → B; drop all → null', async () => {
    const t = await task('sync', projectId, [member.foreman, member.crew_member]);
    expect(await primary(t)).toBe(member.foreman);
    await session.owner.rpc('set_task_assignees', { p_task_id: t, p_member_ids: [member.crew_member] });
    expect(await primary(t)).toBe(member.crew_member);
    await session.owner.rpc('set_task_assignees', { p_task_id: t, p_member_ids: [] });
    expect(await primary(t)).toBeNull();
    expect(await live(t)).toEqual([]);
  });

  it('a PM writing assignee_id directly (the old single path) REPLACES the live set', async () => {
    const t = await task('mirror', projectId, [member.foreman, member.crew_member]);
    const { error } = await session.project_manager.from('tasks').update({ assignee_id: member.subcontractor }).eq('id', t);
    expect(error).toBeNull();
    expect(await live(t)).toEqual([member.subcontractor]);
    expect(await primary(t)).toBe(member.subcontractor);
  });
});
