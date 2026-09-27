// [S181c, #2-pe] Enumerate `<client>.from('<table>').insert(...)...select(...)`
// statements in the live tests: the shape whose RETURNING makes Postgres judge
// the new row by the SELECT policy, so an off-scope refusal measures the READ
// arm, not the write arm.
//
//   node scripts/enum-insert-select-negatives.mjs [--all]
//
// Prints the total, the split by client variable, and every user-session
// statement (client ≠ `admin`) followed within 25 lines by a refusal-shaped
// assertion. `--all` prints every user-session statement instead.
//
// ⚠️ A SEARCH, NOT A CLASSIFIER. It cannot tell an off-scope negative from an
// in-scope one: that needs the SELECT policy of the target table read against
// the session's role, done by hand (see #2-pe). The heuristic also MISSES
// refusals written as `expect(error ?? data?.length === 0).toBeTruthy()`. And
// it does NOT see `.from(<variable>)` calls or `.upsert()`; the #2-pe item
// states those counts as residuals.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = new URL('../apps/web/test/', import.meta.url).pathname;
const ALL = process.argv.includes('--all');
const SERVICE = new Set(['admin']);
const NEG =
  /(toBe\(0\)|toHaveLength\(0\)|toEqual\(\[0|toBeLessThanOrEqual\(0\)|not\.toBeNull\(\)|row-level security|violates|\.toThrow)/;
const START =
  /(\b[A-Za-z_$][\w$]*)\s*(?:\n\s*)?\.from\(\s*['"`]([\w.]+)['"`]\s*\)\s*(?:\n\s*)?\.insert\(/g;

const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.live.ts'))
  .sort();
const rows = [];
for (const f of files) {
  const src = readFileSync(join(DIR, f), 'utf8');
  const lines = src.split('\n');
  START.lastIndex = 0;
  let m;
  while ((m = START.exec(src))) {
    let i = m.index + m[0].length;
    let depth = 1;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === '(' || c === '{' || c === '[') depth++;
      else if (c === ')' || c === '}' || c === ']') depth--;
      else if (c === ';' && depth <= 0) break;
      if (depth < 0) break;
    }
    if (!/\.select\(/.test(src.slice(m.index + m[0].length, i))) continue;
    const line = src.slice(0, m.index).split('\n').length;
    const endLine = src.slice(0, i).split('\n').length;
    const after = lines.slice(endLine, endLine + 25).join('\n');
    rows.push({ file: f, line, client: m[1], table: m[2], negative: NEG.test(after) });
  }
}

const byClient = {};
for (const r of rows) byClient[r.client] = (byClient[r.client] ?? 0) + 1;
const user = rows.filter((r) => !SERVICE.has(r.client));
const shown = ALL ? user : user.filter((r) => r.negative);
console.log(`live files scanned: ${files.length}`);
console.log(`insert().select() statements: ${rows.length}`);
console.log(`by client variable: ${JSON.stringify(byClient)}`);
console.log(
  `user-session statements: ${user.length} in ${new Set(user.map((r) => r.file)).size} files`
);
console.log(
  `${ALL ? 'all user-session' : 'followed by a refusal-shaped assertion'}: ${shown.length} in ${new Set(shown.map((r) => r.file)).size} files`
);
for (const r of shown) console.log(`  ${r.file}:${r.line}  ${r.client}.${r.table}`);
