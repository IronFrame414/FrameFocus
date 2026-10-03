/**
 * S127 item 5a, FIXED AFTER MERGE — a daily-log photo made CLIENT-FACING by the
 * log's own author, through ONE server mechanism (shareLogPhotoWithClient).
 *
 *   CONTROL   the defect itself, which must fire: a FOREMAN's caller-client
 *             `client_visible = true` (5a as first merged) is refused by
 *             `enforce_files_column_scope`, and the flag stays false.
 *   TOTAL MAP every role shares a photo IT uploaded onto a log the FOREMAN
 *             wrote. Allowed: Owner, Admin (they may flip the flag anyway) and
 *             the foreman (the log's author). Everyone else is refused — the
 *             log's own UPDATE policy, restated. Judged by the SERVICE ROLE.
 *   AUTHOR    a crew member shares their own photo onto their own log.
 *   UPLOADER  the log's author may NOT share a photo someone else took.
 *   SCOPE     a photo on another project, or already on another log, is refused.
 *
 * Disposable fixture: logs dated 2020-02-03 on one project, marked by their
 * text; files marked by their path; swept before and after.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CompanyRole } from '@framefocus/shared/types/roles';
import { forEveryRole } from '@/test-support/role-matrix';
import { shareLogPhotoWithClient } from '@/lib/daily-logs/client-photo-share';
import { admin, assertRebuildTest, sessionFor } from './live-session';

const DAY = '2020-02-03';
const MARK = 'S127CPS';
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
// May share a photo they took onto a log the FOREMAN wrote.
const MAY_SHARE_ON_FOREMANS_LOG: Record<CompanyRole, boolean> = {
  owner: true,
  admin: true,
  project_executive: false,
  project_manager: false,
  foreman: true,
  crew_member: false,
  client: false,
  subcontractor: false,
};

const session = {} as Record<CompanyRole, SupabaseClient>;
const userId = {} as Record<CompanyRole, string>;
let companyId = '';
let projectId = '';
let otherProjectId = '';

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
  await admin.from('files').delete().like('file_path', `%/${MARK}-%`);
  await admin.from('daily_logs').delete().eq('log_date', DAY).like('work_performed', `${MARK}%`);
}

async function log(authorEmail: string, project = projectId): Promise<string> {
  const { data, error } = await admin
    .from('daily_logs')
    .insert({
      company_id: companyId,
      project_id: project,
      log_date: DAY,
      author_member_id: await memberOf(authorEmail),
      work_performed: `${MARK} fixture`,
    })
    .select('id')
    .single();
  if (error) throw new Error(`log: ${error.message}`);
  return data!.id as string;
}

let n = 0;
async function photo(uploader: CompanyRole, project = projectId, dailyLogId: string | null = null) {
  const id = crypto.randomUUID();
  const { error } = await admin.from('files').insert({
    id,
    company_id: companyId,
    project_id: project,
    category: 'daily_logs',
    file_name: `${MARK}-${n}.png`,
    file_path: `${companyId}/${project}/${MARK}-${n++}.png`,
    file_size: 68,
    mime_type: 'image/png',
    created_by: userId[uploader],
    daily_log_id: dailyLogId,
  });
  if (error) throw new Error(`file: ${error.message}`);
  return id;
}

async function flag(fileId: string) {
  const { data } = await admin
    .from('files')
    .select('client_visible, daily_log_id')
    .eq('id', fileId)
    .single();
  return data as { client_visible: boolean; daily_log_id: string | null };
}

const share = (role: CompanyRole, fileId: string, logId: string) =>
  shareLogPhotoWithClient({ caller: session[role], admin, userId: userId[role], fileId, logId });

beforeAll(async () => {
  assertRebuildTest();
  const { data: prof } = await admin
    .from('profiles')
    .select('company_id')
    .eq('email', IDENTITY.owner)
    .single();
  companyId = prof!.company_id as string;
  // Projects BOTH the foreman and the crew member are assigned to, ordered (a
  // stable pick): each must see the log's project for its positive case. The
  // SCOPE case needs a second project the foreman is on.
  const assigned = async (email: string) => {
    const { data } = await admin
      .from('project_assignments')
      .select('project_id, created_at, projects!inner(company_id, is_deleted)')
      .eq('member_id', await memberOf(email))
      .eq('is_deleted', false)
      .eq('projects.company_id', companyId)
      .eq('projects.is_deleted', false)
      .order('created_at', { ascending: true })
      .order('project_id', { ascending: true });
    return (data ?? []).map((r) => r.project_id as string);
  };
  const foremans = await assigned(IDENTITY.foreman);
  const crews = new Set(await assigned(IDENTITY.crew_member));
  const both = foremans.filter((id) => crews.has(id));
  if (both.length < 1) throw new Error('no project shared by the foreman and the crew member');
  projectId = both[0];
  const other = foremans.find((id) => id !== projectId);
  if (!other) throw new Error('the foreman needs a second assigned project');
  otherProjectId = other;
  for (const role of Object.keys(IDENTITY) as CompanyRole[]) {
    const { data: p } = await admin
      .from('profiles')
      .select('user_id')
      .eq('email', IDENTITY[role])
      .single();
    userId[role] = p!.user_id as string;
    session[role] = await sessionFor(IDENTITY[role]);
  }
  await sweep();
}, 240_000);

afterAll(async () => {
  await sweep();
  const { count: f } = await admin
    .from('files')
    .select('id', { count: 'exact', head: true })
    .like('file_path', `%/${MARK}-%`);
  const { count: l } = await admin
    .from('daily_logs')
    .select('id', { count: 'exact', head: true })
    .eq('log_date', DAY)
    .like('work_performed', `${MARK}%`);
  expect(f ?? 0).toBe(0);
  expect(l ?? 0).toBe(0);
}, 120_000);

describe('CONTROL — the defect 5a shipped with, which must fire', () => {
  it('a foreman setting client_visible through their own client is REFUSED; the flag stays false', async () => {
    const logId = await log(IDENTITY.foreman);
    const fileId = await photo('foreman', projectId, logId);
    // ⚠️ No .select(): judged by the service role's read-back alone.
    const { error } = await session.foreman
      .from('files')
      .update({ client_visible: true })
      .eq('id', fileId);
    console.log(`[${MARK}] control: error=${error?.message ?? 'none'}`);
    expect(error?.message ?? '').toContain('client_visible is Owner/Admin only');
    expect((await flag(fileId)).client_visible).toBe(false);
  });
});

describe('TOTAL MAP — a photo the caller took, onto a log the FOREMAN wrote', () => {
  forEveryRole(MAY_SHARE_ON_FOREMANS_LOG, (role, allowed) => {
    it(`${role}: ${allowed ? 'shared — linked and client_visible' : 'refused — the flag stays false'}`, async () => {
      const logId = await log(IDENTITY.foreman);
      const fileId = await photo(role);
      const result = await share(role, fileId, logId);
      const after = await flag(fileId);
      console.log(
        `[${MARK}] ${role}: ${result.ok ? 'ok' : `${result.status} ${result.cause}`} visible=${after.client_visible} log=${after.daily_log_id === logId}`
      );
      expect(result.ok).toBe(allowed);
      expect(after.client_visible).toBe(allowed);
      expect(after.daily_log_id === logId).toBe(allowed);
    });
  });
});

describe('AUTHOR, UPLOADER, SCOPE', () => {
  it('a crew member shares their own photo onto their own log', async () => {
    const logId = await log(IDENTITY.crew_member);
    const fileId = await photo('crew_member');
    const result = await share('crew_member', fileId, logId);
    expect(result).toEqual({ ok: true });
    expect(await flag(fileId)).toEqual({ client_visible: true, daily_log_id: logId });
  });

  it("the log's author may NOT share a photo someone else took", async () => {
    const logId = await log(IDENTITY.foreman);
    const fileId = await photo('crew_member');
    const result = await share('foreman', fileId, logId);
    expect(result.ok).toBe(false);
    expect(result.ok ? 0 : result.status).toBe(403);
    expect((await flag(fileId)).client_visible).toBe(false);
  });

  it('a photo on another project is refused (409)', async () => {
    const logId = await log(IDENTITY.foreman);
    const fileId = await photo('foreman', otherProjectId);
    const result = await share('foreman', fileId, logId);
    expect(result.ok ? 0 : result.status).toBe(409);
    expect((await flag(fileId)).client_visible).toBe(false);
  });

  it('a photo already on another log is refused (409), and stays on that log', async () => {
    const first = await log(IDENTITY.foreman);
    const second = await log(IDENTITY.foreman);
    const fileId = await photo('foreman', projectId, first);
    const result = await share('foreman', fileId, second);
    expect(result.ok ? 0 : result.status).toBe(409);
    expect(await flag(fileId)).toEqual({ client_visible: false, daily_log_id: first });
  });
});
