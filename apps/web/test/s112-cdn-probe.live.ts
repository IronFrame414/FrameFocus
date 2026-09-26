import { it } from 'vitest';
// Runs only with S112_CDN=1. READ-ONLY: sign-ins and GETs of existing rebuild-test objects.
import { createClient } from '@supabase/supabase-js';
import { admin, sessionFor, URL_, ANON, TEST_PASSWORD } from './live-session';

// S112 Q6 — READ-ONLY cache probe, pass 2: keyed by object or by caller? same-company exposure?
const H = ['cf-cache-status', 'cache-control', 'content-length'];
const hdr = (r: Response) => H.map((k) => `${k}=${r.headers.get(k) ?? '-'}`).join(' ');
async function token(email: string, fresh = false) {
  if (!fresh) return (await (await sessionFor(email)).auth.getSession()).data.session!.access_token;
  const c = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error) throw error;
  return data.session!.access_token;
}
async function pick(projectId: string, n: number) {
  const { data } = await admin.from('files').select('file_path').eq('project_id', projectId).eq('is_deleted', false)
    .like('mime_type', 'image/%').order('created_at').order('id').limit(n);
  return ((data ?? []) as { file_path: string }[]).map((r) => r.file_path);
}
const urlFor = (p: string) => `${URL_}/storage/v1/object/authenticated/project-files/${p.split('/').map(encodeURIComponent).join('/')}`;

it.skipIf(process.env.S112_CDN !== '1')('probe', async () => {
  const T = {
    owner: await token('josh+test50@worthprop.com'),
    crew: await token('josh+crew@worthprop.com'),
    sub: await token('josh+qa-sub@worthprop.com'),
  };
  const crewFresh = await token('josh+crew@worthprop.com', true);
  const get = async (label: string, who: string, tok: string, path: string) => {
    const r = await fetch(urlFor(path), { headers: { apikey: ANON, Authorization: `Bearer ${tok}` } });
    await r.arrayBuffer();
    console.log(`[Q6] ${label.padEnd(44)} ${who.padEnd(12)} ${r.status} ${hdr(r)}`);
  };
  const [P] = await pick('545edc73-e3e6-402a-a594-a8da00701f09', 1); // crew ON, sub OFF
  const [Q, R] = await pick('6c395b31-cd45-4683-bb6a-cc4895488692', 2); // crew OFF, sub OFF
  console.log(`[Q6] crew-token-fresh differs from cached token: ${crewFresh !== T.crew}`);

  await get('P (crew on, sub off) prime', 'owner', T.owner, P);
  await get('P', 'owner', T.owner, P);
  await get('P — allowed, different user', 'crew', T.crew, P);
  await get('P — NOT allowed, same company', 'sub', T.sub, P);
  await get('P — allowed, fresh token', 'crew(fresh)', crewFresh, P);

  await get('Q (neither on) prime', 'owner', T.owner, Q);
  await get('Q', 'owner', T.owner, Q);
  await get('Q — NOT allowed, same company', 'crew', T.crew, Q);
  await get('Q — NOT allowed, same company', 'sub', T.sub, Q);

  await get('R (neither on) — refused user FIRST', 'crew', T.crew, R);
  await get('R — then owner', 'owner', T.owner, R);
  await get('R — owner again', 'owner', T.owner, R);
  await get('R — refused user after owner cached', 'crew', T.crew, R);
}, 180000);
