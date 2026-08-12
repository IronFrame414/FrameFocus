#!/usr/bin/env node
/**
 * TL-1 — how fast can we actually read a company's files out of storage?
 *
 * ⚠️ THIS SCRIPT EXISTS BECAUSE THE NUMBER DECIDED A RULING AND WAS NOT
 * REPRODUCIBLE. S137 measured 1.07 MB/s and used it to conclude that the
 * 7-day pre-expiry window is not the binding constraint (a ~35x margin) and
 * that `maxDuration = 300` is. That number lived only in a session log, with
 * the method described in prose and no way to re-run it. A figure that decides
 * a ruling should be challengeable by running something.
 *
 * METHOD, stated so it can be argued with: sequential downloads, one
 * connection, service role, from wherever this is run. Parallelism would
 * improve it; production egress may differ from a Codespace.
 *
 * USAGE (from the repo root):
 *   node --env-file=apps/web/.env.local scripts/measure-export-throughput.mjs
 *
 * Optional: --bucket=project-files --limit=200
 *
 * ⚠️ READ-ONLY, and it REFUSES to run against anything but rebuild-test.
 * Downloading every file in a production tenant to time it is not a
 * measurement, it is an incident.
 */
import { createRequire } from 'node:module';

const require_ = createRequire(new URL('../apps/web/', import.meta.url));
const { createClient } = require_('@supabase/supabase-js');

const REQUIRED_PROJECT_REF = 'nmyphyhmfttxkdoposvf'; // framefocus-rebuild-test

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : fallback;
};

const BUCKET = arg('bucket', 'project-files');
const LIMIT = Number(arg('limit', '0')) || Infinity;

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_ || !SERVICE) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Run with: node --env-file=apps/web/.env.local scripts/measure-export-throughput.mjs'
  );
  process.exit(1);
}
if (!URL_.includes(REQUIRED_PROJECT_REF)) {
  console.error(`REFUSING TO RUN: ${URL_} is not rebuild-test (${REQUIRED_PROJECT_REF}).`);
  process.exit(1);
}

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });

async function walk(prefix, out) {
  const { data, error } = await admin.storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (error) throw new Error(`list ${prefix}: ${error.message}`);
  for (const entry of data ?? []) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id === null) await walk(path, out);
    else out.push({ path, size: entry.metadata?.size ?? 0 });
  }
}

const files = [];
await walk('', files);
const subject = files.slice(0, LIMIT === Infinity ? files.length : LIMIT);

console.log(`bucket:   ${BUCKET}`);
console.log(`objects:  ${subject.length} of ${files.length}`);

const startedAt = process.hrtime.bigint();
let bytes = 0;
let downloaded = 0;
let failed = 0;

for (const f of subject) {
  const { data, error } = await admin.storage.from(BUCKET).download(f.path);
  if (error || !data) {
    failed += 1;
    continue;
  }
  bytes += (await data.arrayBuffer()).byteLength;
  downloaded += 1;
}

const seconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
const mb = bytes / 1048576;
const rate = mb / seconds;
const perFile = seconds / Math.max(downloaded, 1);

console.log('');
console.log(`downloaded:   ${downloaded} files (${failed} failed)`);
console.log(`bytes:        ${mb.toFixed(2)} MB`);
console.log(`elapsed:      ${seconds.toFixed(2)} s`);
console.log(`RATE:         ${rate.toFixed(2)} MB/s, ${perFile.toFixed(3)} s/file`);
console.log('');

// Extrapolations use the SAME company shapes as the S137 table so the two are
// directly comparable rather than merely similar.
const shapes = [
  { name: 'small', files: 120, gb: 0.3 },
  { name: 'mid', files: 2100, gb: 4 },
  { name: 'large', files: 8500, gb: 18 },
];
console.log('extrapolated wall-clock (whichever of size/count binds):');
for (const s of shapes) {
  const bySize = (s.gb * 1024) / rate;
  const byCount = s.files * perFile;
  const secs = Math.max(bySize, byCount);
  console.log(
    `  ${s.name.padEnd(6)} ~${s.files} files, ${s.gb} GB -> ${(secs / 60).toFixed(0)} min ` +
      `(${(secs / 3600).toFixed(2)} h)`
  );
}

const WINDOW_HOURS = 168; // the 7-day pre-expiry export window
const largeHours = Math.max((18 * 1024) / rate, 8500 * perFile) / 3600;
console.log('');
console.log(
  `against the ${WINDOW_HOURS}h window, the large case has a ~${(WINDOW_HOURS / largeHours).toFixed(0)}x margin`
);
console.log(
  `invocations needed at maxDuration=300s: ~${Math.ceil((largeHours * 3600) / 240)} ` +
    '(240s of usable budget per run — this is the binding constraint, not the window)'
);
