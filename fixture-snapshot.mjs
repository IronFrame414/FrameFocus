// Read-only fixture census. Run before and after the battery; the two must match.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const raw = readFileSync('apps/web/.env.local', 'utf8');
const env = {};
for (const l of raw.split('\n')) { const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(l); if (m) env[m[1]] = m[2].trim(); }
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const out = {};
async function count(table, filters = {}) {
  let q = db.from(table).select('id', { count: 'exact', head: true });
  for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
  const { count: c, error } = await q;
  return error ? `ERR:${error.message}` : c;
}
out.companies = await count('companies');
out.projects = await count('projects');
out.projects_live = await count('projects', { is_deleted: false });
out.project_assignments = await count('project_assignments');
out.project_contacts = await count('project_contacts');
out.contacts = await count('contacts');
out.profiles = await count('profiles');
out.company_members = await count('company_members');
out.change_orders = await count('change_orders');
out.invoices = await count('invoices');
out.invoice_lines = await count('invoice_lines');
out.chat_threads = await count('chat_threads');
out.chat_messages = await count('chat_messages');
out.files = await count('files');
out.co_signing_sessions = await count('co_signing_sessions');
out.estimates = await count('estimates');
out.client_contracts = await count('client_contracts');

// Named identities, so a rename is caught as well as a count change.
const { data: companies } = await db.from('companies').select('id, name, slug').order('id');
out.company_names = (companies ?? []).map((c) => `${c.slug}|${c.name}`).sort();
const { data: projects } = await db.from('projects').select('id, name, status').eq('is_deleted', false).order('id');
out.project_names = (projects ?? []).map((p) => `${p.name}|${p.status}`).sort();
const { data: assigns } = await db.from('project_assignments').select('project_id, member_id').order('project_id');
out.assignment_pairs = (assigns ?? []).map((a) => `${a.project_id}:${a.member_id}`).sort();

console.log(JSON.stringify(out, null, 2));
