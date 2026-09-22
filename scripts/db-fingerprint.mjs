#!/usr/bin/env node
//
// S108 C2 — regenerate the committed schema fingerprint baseline.
//
//     npm run db:fingerprint
//
// ============================================================================
// ⚠️ WHY A COMMITTED BASELINE, AND NOT "COMPARE TO THE PREVIOUS RUN"
// ============================================================================
// Comparing each run to the last one detects CHANGE, not CORRECTNESS. A drift
// applied on Monday becomes the new normal on Tuesday, and every run after that
// is green over a database nobody agreed to. The baseline has to be a thing a
// human committed.
//
// ⚠️ WHY IT IS GENERATED FROM REBUILD-TEST AND NOT REPLAYED FROM THE MIGRATION
// FILES. `scripts/db-replay-schema.py` (npm run db:verify) is a REGEX DDL
// PARSER. It can derive tables, columns, NOT NULL, CHECK, UNIQUE and FK, and it
// says so; it cannot reconstruct an RLS policy's compiled `qual` text, a
// trigger definition, or a function body. Its own docstring also records that
// the first FIVE discrepancies it ever reported were bugs in the parser rather
// than drift — so a second, more ambitious parser is the wrong instrument.
//
// Generating from rebuild-test is legitimate ONLY BECAUSE the two agree.
// Measured 2026-09-22, both sides, on every dimension the replay CAN check:
//
//     tables 123 · columns 1918 · NOT NULL 772 · CHECK 230 · UNIQUE 42 · FK 566
//
// identical between a replay of the 222 migration files and the live
// rebuild-test catalogue. THAT AGREEMENT IS THIS BASELINE'S WARRANT. It is
// re-asserted on every regeneration below, and the script REFUSES to write if
// it cannot be shown — because a drifted rebuild-test would otherwise quietly
// become the standard the production check is measured against.
//
// ⚠️ REFUSES ANY PROJECT THAT IS NOT REBUILD-TEST. Same guard as
// scripts/live-sql.mjs, for the same reason: a baseline captured from
// production would make production definitionally drift-free.
//
// ⚠️ THE OUTPUT PATH. Josh ruled `scripts/.db-fingerprint.json`. It is written
// there — and ALSO to apps/web/lib/schema-fingerprint-baseline.json, which is
// the copy the cron route imports. The duplication is deliberate and is not
// drift-prone, because this script writes both in one pass and the route's
// test asserts they are byte-identical. The reason the route cannot read the
// scripts/ copy: Vercel's serverless bundle contains only files traced from
// inside apps/web, so a read of ../../scripts/ succeeds locally and returns
// ENOENT in production — the worst possible failure for a drift detector,
// since it would look like "no drift".
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const REQUIRED_REF = 'nmyphyhmfttxkdoposvf'; // framefocus-rebuild-test

function loadEnv() {
  try {
    const raw = readFileSync(join(root, 'apps/web/.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      const value = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
      if (process.env[m[1]] === undefined) process.env[m[1]] = value;
    }
  } catch {
    /* environment may already carry them */
  }
}
loadEnv();

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').match(
  /https:\/\/([a-z0-9]+)\.supabase\.co/
)?.[1];

if (!TOKEN) {
  console.error('!! SUPABASE_ACCESS_TOKEN is not set.');
  process.exit(1);
}
if (REF !== REQUIRED_REF) {
  console.error(`!! REFUSING: linked project is ${REF ?? '(none)'}, not ${REQUIRED_REF}.`);
  console.error('!! A baseline captured anywhere else makes that database definitionally clean.');
  process.exit(1);
}

async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}\n${body}`);
  return JSON.parse(body);
}

// ── 1. The warrant: the replay and the live catalogue must still agree ──────
console.log('==> Re-asserting the baseline\'s warrant (db:verify vs the live catalogue)…');
execFileSync('python3', [join(root, 'scripts/db-replay-schema.py')], { stdio: 'inherit' });
const expected = JSON.parse(
  readFileSync(process.env.DB_VERIFY_OUT ?? join(root, 'scripts/.db-expected.json'), 'utf8')
);

const [live] = await query(readFileSync(join(root, 'scripts/db-verify.sql'), 'utf8'));

// ⚠️ THE REPLAY EMITS LISTS AND A KEYED MAP, NOT COUNTS — so these are derived,
// and derived DEFENSIVELY. `tables`/`columns`/`not_null` are arrays;
// `constraints` is a map of "table.conname" -> 'fk' | 'check' | 'pk' | 'unique'.
// A shape change in the replay must make this FAIL LOUDLY rather than silently
// compare `undefined` to a number and pass, which is exactly how a guard turns
// into a no-op nobody notices.
function len(x, field) {
  if (!Array.isArray(x)) throw new Error(`db:verify output field "${field}" is not an array — the replay's shape changed; fix this comparison rather than removing it.`);
  return x.length;
}
if (!expected.constraints || typeof expected.constraints !== 'object' || Array.isArray(expected.constraints)) {
  throw new Error('db:verify output field "constraints" is not a keyed map — the replay\'s shape changed.');
}
const byType = { fk: 0, check: 0, pk: 0, unique: 0 };
for (const v of Object.values(expected.constraints)) {
  if (!(v in byType)) throw new Error(`db:verify emitted an unknown constraint type "${v}" — extend this comparison.`);
  byType[v] += 1;
}
const replayCounts = {
  tables: len(expected.tables, 'tables'),
  columns: len(expected.columns, 'columns'),
  not_null: len(expected.not_null, 'not_null'),
  checks: byType.check,
  uniques: byType.unique,
  fks: byType.fk,
};
const mismatches = [];
for (const [k, v] of Object.entries(replayCounts)) {
  if (Number(v) !== Number(live[k])) mismatches.push(`${k}: replay ${v} vs live ${live[k]}`);
}
if (mismatches.length) {
  console.error('\n!! REFUSING TO WRITE A BASELINE.');
  console.error('!! rebuild-test and the migration tree DO NOT agree, so rebuild-test is not');
  console.error('!! a legitimate source for the fingerprint. Chase each line to a migration:');
  for (const m of mismatches) console.error(`     - ${m}`);
  process.exit(1);
}
console.log('    agreement confirmed on all six replayable dimensions.');

// ── 2. The fingerprint itself ───────────────────────────────────────────────
const [row] = await query('SELECT public.schema_fingerprint() AS fp');
const fp = row.fp;

const payload = {
  _: 'S108 C2 baseline. Regenerate with `npm run db:fingerprint` and commit in the SAME commit as any migration.',
  generated_from: REQUIRED_REF,
  generated_at: new Date().toISOString(),
  ...fp,
};
const json = JSON.stringify(payload, null, 2) + '\n';

const canonical = join(root, 'scripts/.db-fingerprint.json');
const appCopy = join(root, 'apps/web/lib/schema-fingerprint-baseline.json');
writeFileSync(canonical, json);
writeFileSync(appCopy, json);

console.log(`\n==> Baseline written (identical bytes to both):`);
console.log(`      ${canonical}`);
console.log(`      ${appCopy}   <- the copy the cron route imports`);
for (const k of ['policies', 'triggers', 'functions', 'constraints']) {
  console.log(`    ${k.padEnd(12)} n=${String(fp[k].n).padStart(4)}  md5=${fp[k].md5}`);
}
console.log(`    latest migration: ${fp.latest_migration}`);
console.log('\n⚠️  COMMIT BOTH FILES IN THE SAME COMMIT AS THE MIGRATION THAT MOVED THEM.');
