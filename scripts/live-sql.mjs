#!/usr/bin/env node
//
// Read-only SQL against the LINKED Supabase project, via the Management API.
//
// WHY THIS EXISTS [S150]
// ----------------------------------------------------------------------------
// CLAUDE.md and every audit brief say the same thing: verify against `pg_proc`,
// `pg_policies` and the live schema, NOT migration files, because a later
// migration supersedes an earlier body and specs cite the superseded one. S143
// was burned by exactly that drift, and `convert_estimate_to_project` has been
// redefined five times across five migrations.
//
// The two obvious routes are both closed in this Codespace:
//   * `supabase db dump` needs Docker, which is not installed.
//   * A direct Postgres connection needs a connection string; only the REST
//     keys and a Management API token are in the environment.
//
// So this goes through the Management API's query endpoint, which is the same
// thing the Supabase dashboard's SQL editor uses.
//
// ⚠️ REFUSES ANYTHING THAT IS NOT A READ. The guard below is deliberately
// crude and deliberately fails closed: this is an audit tool pointed at a real
// database, and the cost of a false positive (a refused SELECT) is retyping,
// while the cost of a false negative is a mutated table. DDL and DML never go
// through here — migrations do, reviewed and pushed by hand.
//
// Usage:
//   node scripts/live-sql.mjs "select proname from pg_proc limit 5"
//   node scripts/live-sql.mjs --file query.sql
//   node scripts/live-sql.mjs --raw "..."     # print raw JSON, not a table

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Same loader shape as test/live.vitest.config.ts: environment first, file
// second, so an exported variable wins and a missing file is not fatal.
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
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const REF = URL_.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];

// The same guard `test/live-session.ts` applies. An audit tool must not be
// pointable at production by an environment change nobody noticed.
const REQUIRED_REF = 'nmyphyhmfttxkdoposvf'; // framefocus-rebuild-test

if (!TOKEN) {
  console.error('!! SUPABASE_ACCESS_TOKEN is not set.');
  process.exit(1);
}
if (!REF) {
  console.error(`!! Could not read a project ref from NEXT_PUBLIC_SUPABASE_URL (${URL_}).`);
  process.exit(1);
}
if (REF !== REQUIRED_REF) {
  console.error(`!! REFUSING: linked project is ${REF}, not ${REQUIRED_REF} (rebuild-test).`);
  process.exit(1);
}

const args = process.argv.slice(2);
const raw = args.includes('--raw');
const fileIdx = args.indexOf('--file');
const query =
  fileIdx >= 0 ? readFileSync(args[fileIdx + 1], 'utf8') : args.filter((a) => !a.startsWith('--'))[0];

if (!query?.trim()) {
  console.error('!! No query given.');
  process.exit(1);
}

// ⚠️ FAIL CLOSED. Every statement must begin with select/with/show/explain, and
// no statement may contain a write keyword at a word boundary. Comments are
// stripped first so `-- delete` does not trip it and `/* */ DELETE` does not
// hide behind one.
const stripped = query
  .replace(/--[^\n]*/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .trim();

const FORBIDDEN =
  /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|comment|vacuum|reindex|call|do)\b/i;
if (FORBIDDEN.test(stripped)) {
  console.error('!! REFUSED: this tool is read-only and the query contains a write keyword.');
  console.error('!! Schema changes go through a migration, reviewed and pushed by hand.');
  process.exit(1);
}
if (!/^\s*(select|with|show|explain|table)\b/i.test(stripped)) {
  console.error('!! REFUSED: a query must start with SELECT / WITH / SHOW / EXPLAIN / TABLE.');
  process.exit(1);
}

const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query }),
});

const body = await res.text();
if (!res.ok) {
  console.error(`!! ${res.status} ${res.statusText}`);
  console.error(body);
  process.exit(1);
}

if (raw) {
  console.log(body);
} else {
  const rows = JSON.parse(body);
  if (!Array.isArray(rows) || rows.length === 0) {
    console.log('(no rows)');
  } else {
    console.log(JSON.stringify(rows, null, 2));
  }
}
