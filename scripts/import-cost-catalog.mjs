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
// [S118 item 8] MARKUP. `--markup-percent <p>` is REQUIRED and applied to every
// unit_cost: cost → integer cents (the CSV carries 2 decimals), then
// round_half_up(cents × (100 + p) / 100) → dollars. Integer arithmetic, so no
// binary-float drift; half a cent always rounds UP (all costs are positive).
// Five worked examples are printed on every run.
//
// [S118 item 8] SQL MODE. `--sql-out <file> --company-id <uuid> --created-by <uuid>`
// writes ONE idempotent statement (INSERT … SELECT … WHERE NOT EXISTS, same name
// normalisation as below) instead of signing in — for a database where no user
// password is held. The rows are the SAME rows this script computes (one code
// path); only the transport differs. No sign-in, no service key.
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
import { readFileSync, existsSync, writeFileSync } from 'node:fs';

const CATEGORIES = new Set(['lumber', 'fasteners', 'electrical', 'plumbing', 'finishes', 'concrete', 'drywall', 'roofing', 'paint', 'hardware', 'insulation', 'other']);
const UNITS = new Set(['each', 'sq_ft', 'linear_ft', 'box', 'bundle', 'bag', 'gallon', 'pair', 'set', 'other']);
const ITEM_TYPES = new Set(['material', 'labor', 'subcontractor', 'equipment', 'other']);
const WRITERS = new Set(['owner', 'admin', 'project_manager']); // cost_catalog insert policy

const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(`--${name}`); return i === -1 ? null : args[i + 1]; };
const APPLY = args.includes('--apply');
const email = arg('email');
const csvPath = arg('csv');
const sqlOut = arg('sql-out');
const companyIdArg = arg('company-id');
const createdByArg = arg('created-by');
const markupArg = arg('markup-percent');
const password = process.env.CATALOG_IMPORT_PASSWORD;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!csvPath || markupArg === null) { console.error('usage: --csv <file> --markup-percent <p> ( --email <user> [--apply] | --sql-out <file> --company-id <uuid> --created-by <uuid> )'); process.exit(2); }
const MARKUP = Number(markupArg);
if (!Number.isInteger(MARKUP) || MARKUP < 0 || MARKUP > 100) { console.error(`--markup-percent must be a whole number 0–100, got "${markupArg}"`); process.exit(2); }
if (sqlOut) {
  if (!UUID.test(companyIdArg ?? '') || !UUID.test(createdByArg ?? '')) { console.error('--sql-out needs --company-id and --created-by as UUIDs'); process.exit(2); }
} else {
  if (!email) { console.error('--email is required unless --sql-out'); process.exit(2); }
  if (!password) { console.error('CATALOG_IMPORT_PASSWORD is not set — the password is never taken as an argument.'); process.exit(2); }
}
/** round_half_up(cents × (100 + p) / 100), in integer cents → dollars. */
function markedUp(cost) {
  const cents = Math.round(cost * 100);
  const num = cents * (100 + MARKUP);
  return Math.floor((num + 50) / 100) / 100;
}

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
if (!sqlOut && (!URL_ || !ANON)) { console.error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY missing'); process.exit(2); }

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
    unit_cost: markedUp(cost),
    source_cost: Math.round(cost * 100) / 100,
    item_type: r.item_type || 'material',
    product_url: r.product_url || null,
    last_verified_at: r.last_verified_at || null,
    notes: r.notes || null,
    cost_code: r.cost_code || null,
    is_favorite: r.is_favorite.toLowerCase() === 'true',
  });
});

// ── Worked examples of the markup (always printed) ─────────────────────────
console.log(`\nMarkup +${MARKUP}% — round half up to the cent (integer cents). Five worked examples:`);
for (const r of [...valid].sort((a, b) => a.source_cost - b.source_cost).filter((_, i, a) => [0, Math.floor(a.length / 4), Math.floor(a.length / 2), Math.floor((3 * a.length) / 4), a.length - 1].includes(i))) {
  console.log(`  ${r.source_cost.toFixed(2).padStart(8)} × 1.${String(MARKUP).padStart(2, '0')} = ${(r.source_cost * (100 + MARKUP) / 100).toFixed(4).padStart(10)} → ${r.unit_cost.toFixed(2).padStart(8)}   ${r.name}`);
}
for (const r of valid) delete r.source_cost;

// ── SQL mode: one idempotent statement, no sign-in ─────────────────────────
if (sqlOut) {
  if (invalid.length) { console.error(`REFUSED: ${invalid.length} invalid rows`); process.exit(1); }
  const lit = (v) => (v === null ? 'NULL' : typeof v === 'boolean' ? (v ? 'true' : 'false') : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
  const cols = ['name', 'category', 'unit_of_measure', 'unit_cost', 'item_type', 'product_url', 'last_verified_at', 'notes', 'cost_code', 'is_favorite'];
  const values = valid.map((r) => `(${cols.map((c) => lit(r[c])).join(', ')})`).join(',\n  ');
  const normSql = (x) => `lower(regexp_replace(btrim(${x}), '\\s+', ' ', 'g'))`;
  const sql = `-- cost_catalog import: ${valid.length} rows, +${MARKUP}%, company ${companyIdArg}, created_by ${createdByArg}. Idempotent by normalised name.
INSERT INTO public.cost_catalog (company_id, created_by, updated_by, ${cols.join(', ')})
SELECT '${companyIdArg}'::uuid, '${createdByArg}'::uuid, '${createdByArg}'::uuid,
       v.name, v.category, v.unit_of_measure, v.unit_cost::numeric, v.item_type, v.product_url, v.last_verified_at::timestamptz, v.notes, v.cost_code, v.is_favorite
FROM (VALUES
  ${values}
) AS v(${cols.join(', ')})
WHERE NOT EXISTS (
  SELECT 1 FROM public.cost_catalog k
  WHERE k.company_id = '${companyIdArg}'::uuid AND k.is_deleted = false
    AND ${normSql('k.name')} = ${normSql('v.name')}
);
`;
  writeFileSync(sqlOut, sql);
  console.log(`\nSQL written: ${sqlOut} (${valid.length} candidate rows; existing names are skipped by the statement itself).\n`);
  process.exit(0);
}

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
// A SET of names (dedup is by name), plus the ROW count — they differ when the
// catalog already holds same-named rows (measured: Sabal Point has 3 rows, 2 names).
const existing = new Set();
let existingRows = 0;
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from('cost_catalog').select('name').eq('is_deleted', false).range(from, from + 999);
  if (error) { console.error(`reading the existing catalog failed: ${error.message}`); process.exit(1); }
  existingRows += (data ?? []).length;
  for (const r of data ?? []) existing.add(norm(r.name));
  if (!data || data.length < 1000) break;
}
const toInsert = valid.filter((r) => !existing.has(norm(r.name)));
const already = valid.length - toInsert.length;

const byCat = {};
for (const r of toInsert) byCat[r.category] = (byCat[r.category] ?? 0) + 1;
console.log(`\n  existing catalog rows    ${existingRows} (${existing.size} distinct names)`);
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
console.log(`\n  INSERTED ${inserted}. Live catalog now ${count} rows (was ${existingRows}).\n`);
