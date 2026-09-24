import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTE_CONTRACTS, type RouteContract } from '@/lib/api-contracts/registry';

// ============================================================================
// S110 F — A ROUTE'S RESPONSE CONTRACT CANNOT BREAK A CONSUMER SILENTLY AGAIN.
// [RULED Josh, S110.] The registry, and why, is lib/api-contracts/registry.ts.
//
// ⚠️ THE WALK IS NEVER TRUNCATED. #161's consumer search went through
// `head -10` and stopped one hit short of the file it broke. This walks every
// .ts/.tsx under the five roots and states the count it read, so a walk that
// silently read nothing fails instead of passing on zero files.
// ============================================================================

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const ROOTS = ['app', 'components', 'lib', 'e2e', 'test'];
const SKIP_DIRS = new Set(['node_modules', '.next', 'test-results', 'playwright-report']);
// The registry names every path; this test quotes them. Neither is a consumer.
const SELF = new Set(['lib/api-contracts/registry.ts', 'test/s110-route-contracts.test.ts']);

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(relative(webRoot, full).split('\\').join('/'));
  }
}

/** Block and line comments out; `https://` survives (the `:` guard). */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}

const FILES: string[] = [];
for (const r of ROOTS) walk(join(webRoot, r), FILES);
const CODE = new Map(FILES.map((f) => [f, stripComments(readFileSync(join(webRoot, f), 'utf8'))]));

export function consumersOf(c: RouteContract, code: Map<string, string> = CODE): string[] {
  return [...code.entries()]
    .filter(([f, src]) => f !== c.route && !SELF.has(f) && c.pattern.test(src))
    .map(([f]) => f)
    .sort();
}

/** The fields a route module produces, by its declared source. */
export function fieldsProducedBy(c: RouteContract, src: string): Set<string> {
  const code = stripComments(src);
  if (c.fieldSource === 'select') {
    // Every `.select('…')` in the module: a field counts only if EVERY select
    // carries it (GET and POST return the same row shape).
    const selects = [...code.matchAll(/\.select\(\s*'([^']*)'/g)].map(
      (m) => new Set(m[1].split(',').map((col) => col.trim()).filter(Boolean))
    );
    if (selects.length === 0) return new Set();
    return new Set([...selects[0]].filter((col) => selects.every((s) => s.has(col))));
  }
  // 'json': the keys of every object literal passed to NextResponse.json(…).
  const keys = new Set<string>();
  let i = code.indexOf('NextResponse.json(');
  while (i >= 0) {
    const open = code.indexOf('{', i);
    let depth = 0;
    let j = open;
    for (; j < code.length; j++) {
      if (code[j] === '{') depth++;
      else if (code[j] === '}' && --depth === 0) break;
    }
    const body = code.slice(open + 1, j);
    // Top-level keys only: `key:` or shorthand `key,` / `key }`.
    let d = 0;
    let top = '';
    for (const ch of body) {
      if (ch === '{' || ch === '(' || ch === '[') d++;
      else if (ch === '}' || ch === ')' || ch === ']') d--;
      else if (d === 0) top += ch;
    }
    for (const m of top.matchAll(/(?:^|,)\s*(\w+)\s*(?=[:,]|$)/g)) keys.add(m[1]);
    i = code.indexOf('NextResponse.json(', j);
  }
  return keys;
}

describe('S110 F — the walk itself', () => {
  it('read a real tree — not zero files (a probe that cannot fail is worthless)', () => {
    // Stated count, not a pass on an empty walk. 400 is a floor far below today's tree.
    expect(FILES.length).toBeGreaterThan(400);
    expect(CODE.get('components/site-visits/site-visit-record.tsx')).toBeTruthy();
  });
});

describe.each(ROUTE_CONTRACTS.map((c) => [c.route, c] as const))('S110 F — contract: %s', (_route, c) => {
  const routeSrc = readFileSync(join(webRoot, c.route), 'utf8');

  it('1. the CONSUMER SET matches the registry exactly — a new consumer must be registered', () => {
    const found = consumersOf(c);
    const registered = Object.keys(c.consumers).sort();
    const unregistered = found.filter((f) => !registered.includes(f));
    const stale = registered.filter((f) => !found.includes(f));
    expect(unregistered, `unregistered consumers of ${c.route} — add them to lib/api-contracts/registry.ts`).toEqual([]);
    expect(stale, `registered consumers of ${c.route} that no longer reference it`).toEqual([]);
    expect(found.length).toBeGreaterThan(0);
  });

  it('2a. every registered field is still PRODUCED by the route', () => {
    const produced = fieldsProducedBy(c, routeSrc);
    const missing = c.fields.filter((f) => !produced.has(f));
    expect(missing, `${c.route} no longer returns these — its consumers are listed in the registry`).toEqual([]);
  });

  it('2b. every field a consumer reads is a registered field of the route', () => {
    const bad = Object.entries(c.consumers).flatMap(([file, fields]) =>
      fields.filter((f) => !c.fields.includes(f)).map((f) => `${file} reads '${f}'`)
    );
    expect(bad, `consumers of ${c.route} depend on fields the route does not declare`).toEqual([]);
  });
});
