// Seed (arg `up`) / remove (arg `down`) the one site visit /m/site-visits/[id]
// needs — rebuild-test has none. Prints the ESTIMATE id the route is keyed by.
import { createClient } from '/workspaces/FrameFocus/node_modules/@supabase/supabase-js/dist/index.mjs';
import { readFileSync } from 'node:fs';

for (const line of readFileSync('/workspaces/FrameFocus/apps/web/.env.local', 'utf8').split('\n')) {
  const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
}
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!URL_.includes('nmyphyhmfttxkdoposvf')) throw new Error(`REFUSING: ${URL_}`);
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const TITLE = 'S112AUDIT site visit';

if (process.argv[2] === 'down') {
  const { data, error } = await admin.from('site_visits').delete().eq('title', TITLE).select('id');
  console.log(`removed ${data?.length ?? 0}`, error?.message ?? '');
} else {
  const { data: co } = await admin.from('companies').select('id').eq('slug', 'bishop-contracting').single();
  const { data: existing } = await admin.from('site_visits').select('estimate_id').eq('title', TITLE).maybeSingle();
  if (existing) {
    console.log(existing.estimate_id);
  } else {
    // An estimate with no site visit yet; oldest first so the pick is stable.
    const { data: taken } = await admin.from('site_visits').select('estimate_id');
    const takenIds = (taken ?? []).map((r) => r.estimate_id);
    let q = admin.from('estimates').select('id').eq('company_id', co.id).order('created_at', { ascending: true }).limit(1);
    if (takenIds.length) q = q.not('id', 'in', `(${takenIds.join(',')})`);
    const { data: est } = await q.maybeSingle();
    if (!est) throw new Error('no free estimate');
    const { error } = await admin.from('site_visits').insert({ company_id: co.id, estimate_id: est.id, title: TITLE });
    if (error) throw new Error(error.message);
    console.log(est.id);
  }
}
