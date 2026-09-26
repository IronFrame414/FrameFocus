#!/usr/bin/env node
// Import a cost catalog CSV into ONE company's `cost_catalog`, signed in AS a
// user of that company. [S112 queue D]
//
//   CATALOG_IMPORT_PASSWORD=… node scripts/import-cost-catalog.mjs \
//     --email owner@company.com --csv scripts/data/cost-catalog-….csv          # DRY RUN
//   … same … --apply                                                          # writes
//
// WHY SIGNED IN, NOT THE SERVICE ROLE. `company_id`, `created_by` and
// `updated_by` all DEFAULT from the session (get_my_company_id(), auth.uid()),
// and RLS decides who may insert (cost_catalog_*_manager: Owner/Admin/PM). So
// the company a row lands in is whoever signed in — it cannot be typed wrong,
// and the service key is never needed. Run it once per company, as a user OF
// that company.
//
// DRY RUN BY DEFAULT. Without --apply it reads, validates and reports what it
// WOULD insert, per category, and writes nothing.
//
// IDEMPOTENT. A row whose name (trimmed, case-insensitive) already exists in the
// company's live catalog is skipped, so a second run — or a run after a partial
// failure — inserts only what is missing. It never updates or deletes.
//
// The database's CHECK constraints are the authority on category /
// unit_of_measure / item_type. The sets below MIRROR them (live, rebuild-test,
// 2026-09-26) so a bad row is reported before anything is written; if they ever
// disagree, the insert fails loudly rather than writing a wrong value.
import { createClient } from '../node_modules/@supabase/supabase-js/dist/index.mjs';
import { readFileSync, existsSync } from 'node:fs';

const CATEGORIES = new Set(['lumber', 'fasteners', 'electrical', 'plumbing', 'finishes', 'concrete', 'drywall', 'roofing', 'paint', 'hardware', 'insulation', 'other']);
const UNITS = new Set(['each', 'sq_ft', 'linear_ft', 'box', 'bundle', 'bag', 'gallon', 'pair', 'set', 'other']);
const ITEM_TYPES = new Set(['material', 'labor', 'subcontractor', 'equipment', 'other']);
const WRITERS = new Set(['owner', 'admin', 'project_manager']); // cost_catalog insert policy

const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(`--${name}`); return i === -1 ? null : args[i + 1]; };
const APPLY = args.includes('--apply');
const email = arg('email');
const csvPath = arg('csv');
const password = process.env.CATALOG_IMPORT_PASSWORD;
if (!email || !csvPath) { console.error('usage: --email <user> --csv <file> [--apply]  (password in CATALOG_IMPORT_PASSWORD)'); process.exit(2); }
if (!password) { console.error('CATALOG_IMPORT_PASSWORD is not set — the password is never taken as an argument.'); process.exit(2); }

// Environment: the app's own public URL + anon key (what a browser would use).
const envFile = new URL('../apps/web/.env.local', import.meta.url);
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = /^\s*([A-Za-z_]\w*)\s*=\s*(.*)$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
}
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!URL_ || !ANON) { console.error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY missing'); process.exit(2); }

// ── CSV (RFC 4180: quoted fields, doubled quotes, commas inside quotes) ──────
function parseCsv(text) {
  const rows = []; let row = []; let field = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const [header, ...body] = parseCsv(readFileSync(csvPath, 'utf8'));
const EXPECTED = ['name', 'category', 'unit_of_measure', 'unit_cost', 'item_type', 'product_url', 'last_verified_at', 'notes', 'cost_code', 'is_favorite'];
if (header.join(',') !== EXPECTED.join(',')) { console.error(`unexpected header:\n  ${header.join(',')}\nexpected:\n  ${EXPECTED.join(',')}`); process.exit(2); }

const norm = (s) => s.trim().replace(/\s+/g, ' ').toLowerCase();
const valid = []; const invalid = [];
const seenInFile = new Set();
body.forEach((cols, i) => {
  const line = i + 2; // 1-based, after the header
  const r = Object.fromEntries(EXPECTED.map((k, j) => [k, (cols[j] ?? '').trim()]));
  const problems = [];
  if (!r.name) problems.push('empty name');
  if (!CATEGORIES.has(r.category)) problems.push(`category "${r.category}"`);
  if (!UNITS.has(r.unit_of_measure)) problems.push(`unit_of_measure "${r.unit_of_measure}"`);
  if (!ITEM_TYPES.has(r.item_type || 'material')) problems.push(`item_type "${r.item_type}"`);
  const cost = Number(r.unit_cost);
  if (r.unit_cost === '' || !Number.isFinite(cost) || cost < 0) problems.push(`unit_cost "${r.unit_cost}"`);
  if (r.last_verified_at && Number.isNaN(Date.parse(r.last_verified_at))) problems.push(`last_verified_at "${r.last_verified_at}"`);
  if (!['', 'true', 'false'].includes(r.is_favorite.toLowerCase())) problems.push(`is_favorite "${r.is_favorite}"`);
  if (r.name && seenInFile.has(norm(r.name))) problems.push('duplicate name within the file');
  if (r.name) seenInFile.add(norm(r.name));
  if (problems.length) { invalid.push({ line, name: r.name, problems }); return; }
  valid.push({
    name: r.name,
    category: r.category,
    unit_of_measure: r.unit_of_measure,
    unit_cost: Math.round(cost * 100) / 100,
    item_type: r.item_type || 'material',
    product_url: r.product_url || null,
    last_verified_at: r.last_verified_at || null,
    notes: r.notes || null,
    cost_code: r.cost_code || null,
    is_favorite: r.is_favorite.toLowerCase() === 'true',
  });
});

// ── Sign in AS the company user ─────────────────────────────────────────────
const db = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: auth, error: authErr } = await db.auth.signInWithPassword({ email, password });
if (authErr) { console.error(`sign-in failed for ${email}: ${authErr.message}`); process.exit(1); }
const { data: me, error: meErr } = await db.from('profiles').select('role, company_id, companies(name)').eq('user_id', auth.user.id).single();
if (meErr || !me) { console.error(`no profile for ${email}: ${meErr?.message}`); process.exit(1); }
const company = me.companies?.name ?? me.company_id;

console.log(`\nCost catalog import — ${APPLY ? 'APPLY' : 'DRY RUN (nothing is written)'}`);
console.log(`  database   ${new URL(URL_).host}`);
console.log(`  signed in  ${email} (${me.role})`);
console.log(`  company    ${company}  [${me.company_id}]`);
console.log(`  file       ${csvPath} — ${body.length} data rows`);

if (!WRITERS.has(me.role)) {
  console.error(`\n  REFUSED: role "${me.role}" cannot add catalog items (Owner, Admin or Project Manager only).`);
  process.exit(1);
}

// Existing live catalog for THIS company (RLS scopes the read to it).
const existing = new Set();
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from('cost_catalog').select('name').eq('is_deleted', false).range(from, from + 999);
  if (error) { console.error(`reading the existing catalog failed: ${error.message}`); process.exit(1); }
  for (const r of data ?? []) existing.add(norm(r.name));
  if (!data || data.length < 1000) break;
}
const toInsert = valid.filter((r) => !existing.has(norm(r.name)));
const already = valid.length - toInsert.length;

const byCat = {};
for (const r of toInsert) byCat[r.category] = (byCat[r.category] ?? 0) + 1;
console.log(`\n  existing catalog items   ${existing.size}`);
console.log(`  valid rows in file       ${valid.length}`);
console.log(`  invalid rows (skipped)   ${invalid.length}`);
for (const x of invalid) console.log(`    line ${x.line} "${x.name}": ${x.problems.join('; ')}`);
console.log(`  already present (skip)   ${already}`);
console.log(`  WOULD INSERT             ${toInsert.length}`);
for (const [c, n] of Object.entries(byCat).sort()) console.log(`    ${c.padEnd(12)} ${n}`);

if (!APPLY) {
  console.log('\n  Dry run only. Re-run with --apply to write these rows.\n');
  process.exit(invalid.length ? 1 : 0);
}
if (invalid.length) { console.error('\n  REFUSED: fix the invalid rows first — nothing written.'); process.exit(1); }

let inserted = 0;
for (let i = 0; i < toInsert.length; i += 100) {
  const batch = toInsert.slice(i, i + 100);
  const { data, error } = await db.from('cost_catalog').insert(batch).select('id');
  if (error) { console.error(`\n  batch at ${i} failed: ${error.message} — ${inserted} inserted before it; re-run to resume (idempotent).`); process.exit(1); }
  inserted += data.length;
}
const { count } = await db.from('cost_catalog').select('id', { count: 'exact', head: true }).eq('is_deleted', false);
console.log(`\n  INSERTED ${inserted}. Live catalog now ${count} (was ${existing.size}).\n`);
