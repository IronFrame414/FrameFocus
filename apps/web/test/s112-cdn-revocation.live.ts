import { afterAll, beforeAll, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { ANON, TEST_PASSWORD, URL_, admin, assertRebuildTest, sessionFor, sweepProjectsNamed } from './live-session';

// ============================================================================
// S112 Q6 (d)/(e) — does REVOKING access revoke READING? Measured, rebuild-test.
// Runs only with S112_CDN=1: it can take up to ~70 minutes.
// ============================================================================
// Josh: "take a user, revoke their project assignment, and measure what they
// can still fetch and for how long. Row counts and seconds." And (e): whether
// anyone else could reach it.
//
// Pass 1-2 probes (read-only) established: Cloudflare fronts Storage
// (`cf-cache-status`, `cache-control: public, max-age=3600`); the cache is keyed
// by OBJECT (a different authorised user and a fresh token both HIT); a caller
// the policy refuses gets 400 BYPASS/DYNAMIC even on a cached object. So the
// edge checks authorisation per request — and yet a revoked reader was served
// in S112 R7. This measures that window.
//
// Two revocations, on two fixture projects, so they cannot interfere:
//   A  UNASSIGN — the sub's project_assignments row soft-deleted (the real
//      "sub leaves the project" path). Objects: an original + its thumbnail.
//   B  ROW GONE — the files row deleted while the sub stays assigned (the R7
//      repoint shape: no row names the object any more).
// Per tick (every 5 s) the sub fetches each object three ways:
//   GET   the authenticated endpoint with the user JWT (what download() does)
//   SIGN  a NEW signed URL (an RLS decision in the database)
//   URL   a signed URL issued BEFORE the revocation (7200 s app TTL)
// plus CONTROLS that must stay refused throughout: a same-company crew member
// never assigned, and another company's owner.
// ============================================================================

const RUN = process.env.S112_CDN === '1';
const MARKER = 'S112CDN';
const OWNER = 'josh+test50@worthprop.com';
const SUB = 'josh+qa-sub@worthprop.com';
const CREW = 'josh+crew@worthprop.com';
const OTHER_CO = 'josh+qa-b-owner@worthprop.com';
const BUCKET = 'project-files';
const TICK_MS = 5_000;
const MAX_MS = 70 * 60_000;
const WEBP = Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64');

type Obj = { key: string; path: string; project: 'A' | 'B' };
const objs: Obj[] = [];
const projects: Record<'A' | 'B', string> = { A: '', B: '' };
let companyId = '';
let subMemberId = '';
const fileRowId: Record<string, string> = {};
const tok: Record<string, string> = {};
const preSigned: Record<string, string> = {};
/** A 20 s signed URL per object, fetched while valid — then past its expiry, with NO credentials. */
const shortSigned: Record<string, string> = {};
const SHORT_TTL = 20;
const shortMintedAt: Record<string, number> = {};

const urlFor = (p: string) =>
  `${URL_}/storage/v1/object/authenticated/${BUCKET}/${p.split('/').map(encodeURIComponent).join('/')}`;

async function freshToken(email: string) {
  const c = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error) throw error;
  return data.session!.access_token;
}

async function get(t: string, path: string) {
  const r = await fetch(urlFor(path), { headers: { apikey: ANON, Authorization: `Bearer ${t}` } });
  await r.arrayBuffer();
  return { s: r.status, cf: r.headers.get('cf-cache-status') ?? '-' };
}

async function signAs(email: string, path: string) {
  const c = await sessionFor(email);
  const { data } = await c.storage.from(BUCKET).createSignedUrl(path, 7200);
  return data?.signedUrl ?? null;
}

async function makeProject(label: 'A' | 'B') {
  const { data: c } = await admin
    .from('contacts')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .single();
  const { data: counters } = await admin.from('companies').select('project_internal_sequence').eq('id', companyId).single();
  const internal = (counters as { project_internal_sequence: number }).project_internal_sequence + 1;
  const { data: p, error } = await admin
    .from('projects')
    .insert({
      company_id: companyId,
      name: `${MARKER} ${label}`,
      contact_id: (c as { id: string }).id,
      project_type: 'fixed_price',
      project_number: `PRJ-${MARKER}-${label}`,
      project_internal_seq: internal,
    })
    .select('id')
    .single();
  expect(error, error?.message).toBeNull();
  await admin.from('companies').update({ project_internal_sequence: internal }).eq('id', companyId);
  const asg = await admin
    .from('project_assignments')
    .insert({ company_id: companyId, project_id: (p as { id: string }).id, member_id: subMemberId, role_on_project: 'crew' });
  expect(asg.error, asg.error?.message).toBeNull();
  return (p as { id: string }).id;
}

async function makeObject(key: string, project: 'A' | 'B', withThumb: boolean) {
  const id = crypto.randomUUID();
  const path = `${companyId}/${projects[project]}/${id}-${MARKER}-${key}.png`;
  // Unique bytes, so no earlier cache entry can exist for this content.
  const bytes = Buffer.concat([WEBP, Buffer.from(`${MARKER}-${key}-${Date.now()}-${Math.random()}`)]);
  expect((await admin.storage.from(BUCKET).upload(path, bytes, { contentType: 'image/webp' })).error).toBeNull();
  const ins = await admin.from('files').insert({
    id,
    company_id: companyId,
    project_id: projects[project],
    category: 'photos',
    file_name: `${MARKER}-${key}.png`,
    file_path: path,
    file_size: bytes.length,
    mime_type: 'image/webp',
  });
  expect(ins.error, ins.error?.message).toBeNull();
  fileRowId[path] = id;
  objs.push({ key, path, project });
  if (withThumb) {
    const thumb = `${path}.thumb.webp`;
    expect((await admin.storage.from(BUCKET).upload(thumb, bytes, { contentType: 'image/webp' })).error).toBeNull();
    objs.push({ key: `${key}.thumb`, path: thumb, project });
  }
}

async function sweep() {
  const { data } = await admin.from('files').select('id, file_path').like('file_name', `${MARKER}%`);
  for (const r of (data ?? []) as { id: string; file_path: string }[]) {
    await admin.storage.from(BUCKET).remove([r.file_path, `${r.file_path}.thumb.webp`]);
    await admin.from('files').delete().eq('id', r.id);
  }
  const { data: ps } = await admin.from('projects').select('id').like('name', `${MARKER}%`);
  for (const p of (ps ?? []) as { id: string }[]) {
    await admin.from('project_assignments').delete().eq('project_id', p.id);
  }
  await sweepProjectsNamed(MARKER);
}

beforeAll(async () => {
  if (!RUN) return;
  assertRebuildTest();
  await sweep();
  const { data: owner } = await admin.from('profiles').select('company_id').eq('email', OWNER).eq('is_deleted', false).single();
  companyId = (owner as { company_id: string }).company_id;
  const { data: sub } = await admin.from('profiles').select('id').eq('email', SUB).eq('is_deleted', false).single();
  const { data: m } = await admin
    .from('company_members')
    .select('id')
    .eq('profile_id', (sub as { id: string }).id)
    .eq('is_deleted', false)
    .single();
  subMemberId = (m as { id: string }).id;
  projects.A = await makeProject('A');
  projects.B = await makeProject('B');
  await makeObject('A1', 'A', true);
  await makeObject('A2', 'A', false);
  await makeObject('B1', 'B', false);
  tok.sub = await freshToken(SUB);
  tok.crew = await freshToken(CREW);
  tok.other = await freshToken(OTHER_CO);
}, 180_000);

afterAll(async () => {
  if (!RUN) return;
  await sweep();
}, 180_000);

it.skipIf(!RUN)('revocation window', async () => {
  // PRIME: the sub, authorised, fetches everything until the edge serves it.
  for (const o of objs) {
    let last = await get(tok.sub, o.path);
    for (let i = 0; i < 3 && last.cf !== 'HIT'; i++) last = await get(tok.sub, o.path);
    console.log(`[Q6d] prime ${o.key}: ${last.s} ${last.cf}`);
    expect(last.s, `the sub cannot read ${o.key} BEFORE revocation — the fixture is wrong`).toBe(200);
    preSigned[o.path] = (await signAs(SUB, o.path))!;
    {
      const c = await sessionFor(SUB);
      const { data } = await c.storage.from(BUCKET).createSignedUrl(o.path, SHORT_TTL);
      shortSigned[o.path] = data!.signedUrl;
      shortMintedAt[o.path] = Date.now();
      for (let i = 0; i < 3; i++) await (await fetch(shortSigned[o.path])).arrayBuffer(); // warm the edge
    }
    expect(preSigned[o.path], `sub could not sign ${o.key} before revocation`).toBeTruthy();
    // CONTROLS before revocation: must already be refused.
    expect((await get(tok.crew, o.path)).s, `crew (never assigned) reads ${o.key}`).not.toBe(200);
    expect((await get(tok.other, o.path)).s, `other company reads ${o.key}`).not.toBe(200);
  }

  // REVOKE — both at once, t0.
  const t0 = Date.now();
  const un = await admin
    .from('project_assignments')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('project_id', projects.A)
    .eq('member_id', subMemberId)
    .select('id');
  expect(un.data?.length, 'unassign touched no row').toBe(1);
  const gone = await admin.from('files').delete().eq('id', fileRowId[objs.find((o) => o.key === 'B1')!.path]).select('id');
  expect(gone.data?.length, 'row delete touched no row').toBe(1);
  console.log(`[Q6d] REVOKED at t0 (A: unassigned; B: files row deleted)`);

  const firstRefused: Record<string, Record<string, number | null>> = {};
  for (const o of objs) firstRefused[o.key] = { GET: null, SIGN: null, URL: null, 'GET(fresh token)': null, EXPIRED: null };
  let freshSub = '';
  let leaks = 0;

  while (Date.now() - t0 < MAX_MS) {
    const sec = Math.round((Date.now() - t0) / 1000);
    if (!freshSub && sec >= 10) freshSub = await freshToken(SUB); // a token minted AFTER revocation
    const line: string[] = [];
    let stillReadable = 0;
    for (const o of objs) {
      const g = await get(tok.sub, o.path);
      const r0 = (k: string) => firstRefused[k];
      const sgn = await signAs(SUB, o.path);
      const u = await fetch(preSigned[o.path]);
      await u.arrayBuffer();
      const f = freshSub ? await get(freshSub, o.path) : null;
      const c1 = await get(tok.crew, o.path);
      const c2 = await get(tok.other, o.path);
      // Supabase docs: an EXPIRED token's cached response "can continue to be served".
      // No apikey, no JWT — a signed URL is a bearer link; anyone holding it.
      const x = await fetch(shortSigned[o.path]);
      await x.arrayBuffer();
      const pastExpiry = Math.round((Date.now() - shortMintedAt[o.path]) / 1000) - SHORT_TTL;
      if (x.status !== 200 && r0(o.key).EXPIRED === null && pastExpiry > 0) r0(o.key).EXPIRED = sec;
      if (c1.s === 200 || c2.s === 200) leaks++;
      const r = firstRefused[o.key];
      if (g.s !== 200 && r.GET === null) r.GET = sec;
      if (!sgn && r.SIGN === null) r.SIGN = sec;
      if (u.status !== 200 && r.URL === null) r.URL = sec;
      if (f && f.s !== 200 && r['GET(fresh token)'] === null) r['GET(fresh token)'] = sec;
      if (g.s === 200 || u.status === 200 || f?.s === 200) stillReadable++;
      line.push(
        `${o.key}: GET ${g.s}/${g.cf} SIGN ${sgn ? 'yes' : 'no'} URL ${u.status}/${u.headers.get('cf-cache-status')} 20s-URL(${pastExpiry > 0 ? `expired ${pastExpiry}s ago` : 'valid'}) ${x.status}/${x.headers.get('cf-cache-status')}` +
          (f ? ` fresh ${f.s}/${f.cf}` : '') +
          ` | crew ${c1.s} other ${c2.s}`
      );
    }
    console.log(`[Q6d] t+${sec}s readable=${stillReadable}/${objs.length} :: ${line.join(' || ')}`);
    const getsClosed = objs.every((o) => firstRefused[o.key].GET !== null && firstRefused[o.key]['GET(fresh token)'] !== null);
    // Pre-issued signed URLs are expected to outlive this by design (7200 s);
    // stop once the GET paths have closed and been observed closed for 60 s.
    if (getsClosed && sec - Math.max(...objs.map((o) => firstRefused[o.key].GET!)) >= 60) break;
    await new Promise((r) => setTimeout(r, TICK_MS));
  }
  console.log(`[Q6d] FIRST REFUSED (seconds after t0): ${JSON.stringify(firstRefused)}`);
  console.log(`[Q6d] control leaks (crew never assigned / other company served 200): ${leaks}`);
  expect(leaks, 'an UNRELATED user was served a cached object').toBe(0);
}, MAX_MS + 300_000);
