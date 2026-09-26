import { afterAll, beforeAll, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { ANON, URL_, admin, assertRebuildTest, deleteCompanies } from './live-session';

// ============================================================================
// S112 Q6 — how long does a REVOKED token keep re-reading? Run to the end.
// Runs only with S112_CDN_LONG=1 (hours). rebuild-test only.
// ============================================================================
// RULED [Josh, S112]: "finish the measurement first ... If reads stop at about
// 59 minutes, the access token's own lifetime is the whole story and purging
// the CDN would fix nothing. If they outlast the token, it is the cache."
// The first run (s112-cdn-revocation.live.ts) stopped at its 70-min limit with
// the old token still served ~10 min past its own expiry. This one polls until
// the reads actually stop.
//
// ⚠️ STANDING PRACTICE [Josh, S112]: "a long-running probe gets its own
// identity, never a shared one." Everything here is DISPOSABLE and created by
// this file: a tenant renamed "DISPOSABLE S112 CDN PROBE — delete me", a
// crew_member login in it, a contact, a project and three files. CI never
// touches that tenant. afterAll removes all of it and FAILS if anything is left.
//
// RULED [Josh, S112]: 90 MINUTES, not 8 hours. The token lives 3,600 s and
// the CDN sends max-age=3600, so both candidate mechanisms end within the hour.
// Reads stopping near t+3600 = the token's lifetime is the whole story. Reads
// surviving past t+5400 = something refreshes or extends, and only THEN is a
// longer run warranted — decided on that evidence, not in advance.
// The probe shares nothing with CI, so it runs IN PARALLEL with the CI queue.
//
// S112_CDN_SWEEP=1 runs only the sweep: it removes every tenant named
// DISPOSABLE_NAME and every disposable-s112-cdn-probe-* login, and fails if
// anything is left. Use it after a run that was killed before its afterAll.
//
// Files: P1, P2 fetched (primed) before revocation; N1 NEVER fetched before it
// — answers whether a revoked token can read something it had not read yet.
// ============================================================================

const RUN = process.env.S112_CDN_LONG === '1';
const TICK_MS = Number(process.env.S112_CDN_TICK_MS ?? 60_000);
const MAX_MS = Number(process.env.S112_CDN_MAX_MS ?? 90 * 60_000);
const SWEEP = process.env.S112_CDN_SWEEP === '1';
const DISPOSABLE_NAME = 'DISPOSABLE S112 CDN PROBE — delete me';
const EMAIL_PREFIX = 'disposable-s112-cdn-probe-';
const BUCKET = 'project-files';
const EMAIL = `${EMAIL_PREFIX}${Date.now()}@example.invalid`;
const PASSWORD = `Disposable-${crypto.randomUUID()}!9`;
const WEBP = Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64');

let userId = '';
let companyId = '';
let memberId = '';
let projectId = '';
let token = '';
let tokenExp = 0;
const paths: Record<'P1' | 'P2' | 'N1', string> = { P1: '', P2: '', N1: '' };

const urlFor = (p: string) =>
  `${URL_}/storage/v1/object/authenticated/${BUCKET}/${p.split('/').map(encodeURIComponent).join('/')}`;
async function get(t: string, p: string) {
  const r = await fetch(urlFor(p), { headers: { apikey: ANON, Authorization: `Bearer ${t}` } });
  await r.arrayBuffer();
  return { s: r.status, cf: r.headers.get('cf-cache-status') ?? '-' };
}
async function signIn() {
  const c = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (error) throw error;
  return data.session!.access_token;
}

async function removeTenant(companyId: string) {
  const { data: files } = await admin.from('files').select('file_path').eq('company_id', companyId);
  const all = ((files ?? []) as { file_path: string }[]).map((f) => f.file_path);
  if (all.length) await admin.storage.from(BUCKET).remove(all);
  await admin.from('project_assignments').delete().eq('company_id', companyId);
  await admin.from('files').delete().eq('company_id', companyId);
  await admin.from('projects').delete().eq('company_id', companyId);
  await admin.from('contacts').delete().eq('company_id', companyId);
  await deleteCompanies(admin, [companyId]);
}

// Everything a disposable run could have left, found by name rather than by
// this process's variables — so it also clears a run that was killed.
async function sweep() {
  const { data: cos } = await admin.from('companies').select('id').eq('name', DISPOSABLE_NAME);
  for (const c of (cos ?? []) as { id: string }[]) await removeTenant(c.id);
  const { data: profs } = await admin
    .from('profiles')
    .select('company_id')
    .like('email', `${EMAIL_PREFIX}%`);
  for (const p of (profs ?? []) as { company_id: string }[]) await removeTenant(p.company_id);
  await admin.from('trial_emails').delete().like('email', `${EMAIL_PREFIX}%`);
  const users: string[] = [];
  for (let page = 1; ; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    const batch = data?.users ?? [];
    users.push(...batch.filter((u) => u.email?.startsWith(EMAIL_PREFIX)).map((u) => u.id));
    if (batch.length < 1000) break;
  }
  for (const id of users) expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
  const left = await Promise.all([
    admin
      .from('companies')
      .select('id', { count: 'exact', head: true })
      .eq('name', DISPOSABLE_NAME),
    admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .like('email', `${EMAIL_PREFIX}%`),
    admin
      .from('trial_emails')
      .select('id', { count: 'exact', head: true })
      .like('email', `${EMAIL_PREFIX}%`),
  ]);
  const counts = left.map((r) => r.count ?? 0);
  console.log(
    `[Q6 sweep] removed ${(cos ?? []).length} tenant(s), ${users.length} login(s); company/profile/trial_emails left: ${counts.join('/')}`
  );
  expect(counts, 'disposable probe rows survived the sweep').toEqual([0, 0, 0]);
}

it.skipIf(!SWEEP)(
  'sweep: nothing disposable is left on rebuild-test',
  async () => {
    assertRebuildTest();
    await sweep();
  },
  300_000
);

async function teardown() {
  if (companyId) {
    const { data: files } = await admin
      .from('files')
      .select('file_path')
      .eq('company_id', companyId);
    const all = [
      ...Object.values(paths),
      ...((files ?? []) as { file_path: string }[]).map((f) => f.file_path),
    ].filter(Boolean);
    if (all.length) await admin.storage.from(BUCKET).remove(all);
    await admin.from('project_assignments').delete().eq('company_id', companyId);
    await admin.from('files').delete().eq('company_id', companyId);
    await admin.from('projects').delete().eq('company_id', companyId);
    await admin.from('contacts').delete().eq('company_id', companyId);
    await deleteCompanies(admin, [companyId]);
  }
  await admin.from('trial_emails').delete().eq('email', EMAIL);
  if (userId) {
    const del = await admin.auth.admin.deleteUser(userId);
    expect(del.error, del.error?.message).toBeNull();
  }
  const left = await Promise.all([
    admin.from('companies').select('id', { count: 'exact', head: true }).eq('id', companyId),
    admin.from('profiles').select('id', { count: 'exact', head: true }).eq('email', EMAIL),
    admin.from('trial_emails').select('id', { count: 'exact', head: true }).eq('email', EMAIL),
  ]);
  const counts = left.map((r) => r.count ?? 0);
  console.log(`[Q6 long teardown] company/profile/trial_emails left: ${counts.join('/')}`);
  expect(counts, 'the disposable probe left rows behind').toEqual([0, 0, 0]);
}

beforeAll(async () => {
  if (!RUN) return;
  assertRebuildTest();
  const { data: u, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  expect(error, error?.message).toBeNull();
  userId = u.user!.id;
  const { data: prof } = await admin
    .from('profiles')
    .select('id, company_id')
    .eq('user_id', userId)
    .single();
  companyId = (prof as { company_id: string }).company_id;
  await admin.from('companies').update({ name: DISPOSABLE_NAME }).eq('id', companyId);
  const up = await admin
    .from('profiles')
    .update({ role: 'crew_member' })
    .eq('id', (prof as { id: string }).id);
  expect(up.error, up.error?.message).toBeNull();
  const { data: m } = await admin
    .from('company_members')
    .select('id')
    .eq('profile_id', (prof as { id: string }).id)
    .single();
  memberId = (m as { id: string }).id;
  const { data: c, error: cErr } = await admin
    .from('contacts')
    .insert({
      company_id: companyId,
      first_name: 'Disposable',
      last_name: 'Probe',
      contact_type: 'client',
    })
    .select('id')
    .single();
  expect(cErr, cErr?.message).toBeNull();
  const { data: p, error: pErr } = await admin
    .from('projects')
    .insert({
      company_id: companyId,
      name: 'DISPOSABLE S112 CDN PROBE',
      contact_id: (c as { id: string }).id,
      project_type: 'fixed_price',
      project_number: 'PRJ-DISPOSABLE',
      project_internal_seq: 1,
    })
    .select('id')
    .single();
  expect(pErr, pErr?.message).toBeNull();
  projectId = (p as { id: string }).id;
  const a = await admin
    .from('project_assignments')
    .insert({
      company_id: companyId,
      project_id: projectId,
      member_id: memberId,
      role_on_project: 'crew',
    });
  expect(a.error, a.error?.message).toBeNull();
  for (const k of ['P1', 'P2', 'N1'] as const) {
    const id = crypto.randomUUID();
    const path = `${companyId}/${projectId}/${id}-disposable-${k}.webp`;
    const bytes = Buffer.concat([WEBP, Buffer.from(`${k}-${Date.now()}-${Math.random()}`)]);
    expect(
      (await admin.storage.from(BUCKET).upload(path, bytes, { contentType: 'image/webp' })).error
    ).toBeNull();
    const ins = await admin
      .from('files')
      .insert({
        id,
        company_id: companyId,
        project_id: projectId,
        category: 'photos',
        file_name: `disposable-${k}.webp`,
        file_path: path,
        file_size: bytes.length,
        mime_type: 'image/webp',
      });
    expect(ins.error, ins.error?.message).toBeNull();
    paths[k] = path;
  }
  token = await signIn();
  tokenExp = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).exp;
}, 300_000);

afterAll(async () => {
  if (!RUN) return;
  await teardown();
}, 300_000);

it.skipIf(!RUN)(
  'a revoked token: when do its reads stop?',
  async () => {
    for (const k of ['P1', 'P2'] as const) {
      let r = await get(token, paths[k]);
      for (let i = 0; i < 4 && r.cf !== 'HIT'; i++) r = await get(token, paths[k]);
      console.log(`[Q6 long] prime ${k}: ${r.s} ${r.cf}`);
      expect(r.s).toBe(200);
    }
    const rev = await admin
      .from('project_assignments')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('project_id', projectId)
      .eq('member_id', memberId)
      .select('id');
    expect(rev.data?.length).toBe(1);
    const t0 = Date.now();
    console.log(
      `[Q6 long] REVOKED at ${new Date(t0).toISOString()}; token exp ${new Date(tokenExp * 1000).toISOString()} (t+${Math.round(tokenExp - t0 / 1000)}s)`
    );

    const first: Record<string, number | null> = { P1: null, P2: null, N1_ever_served: null };
    let closedTicks = 0;
    while (Date.now() - t0 < MAX_MS) {
      const sec = Math.round((Date.now() - t0) / 1000);
      const p1 = await get(token, paths.P1);
      const p2 = await get(token, paths.P2);
      const n1 = await get(token, paths.N1);
      if (p1.s !== 200 && first.P1 === null) first.P1 = sec;
      if (p2.s !== 200 && first.P2 === null) first.P2 = sec;
      if (n1.s === 200 && first.N1_ever_served === null) first.N1_ever_served = sec;
      const pastExp = Math.round(Date.now() / 1000 - tokenExp);
      console.log(
        `[Q6 long] t+${sec}s (token ${pastExp > 0 ? `expired ${pastExp}s ago` : `valid ${-pastExp}s more`}) P1 ${p1.s}/${p1.cf} P2 ${p2.s}/${p2.cf} N1(never primed) ${n1.s}/${n1.cf}`
      );
      closedTicks = p1.s !== 200 && p2.s !== 200 ? closedTicks + 1 : 0;
      if (closedTicks >= 3) break;
      await new Promise((r) => setTimeout(r, TICK_MS));
    }
    console.log(
      `[Q6 long] RESULT (seconds after revocation): ${JSON.stringify(first)}; token lifetime ended at t+${Math.round(tokenExp - t0 / 1000)}s`
    );
  },
  MAX_MS + 600_000
);
