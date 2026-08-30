import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { COMPANY_TABLES, SURVIVES } from './deletion';

/**
 * ⚠️ THE CENSUS-DIFF GUARD [Q4 ruling — "not optional"]. Every table carrying
 * `company_id` must be in EXACTLY ONE of the deletion walk (`COMPANY_TABLES`)
 * or the survivors list (`SURVIVES`). This is the third detonation of the
 * registry-drift class (deletion-sweep-analysis.md §3a found 23 uncovered
 * tables; before that a missing entry and a stale duplicate) — the entries
 * without this guard just reset the clock.
 *
 * The census is parsed from the GENERATED types, which regenerate on every
 * migration (`npm run db:push`), so the next migration that adds a
 * company-scoped table and forgets the walk goes red HERE, in CI, with the
 * table named — not silently in a customer's deletion.
 */

const databaseTs = readFileSync(
  fileURLToPath(new URL('../../../../packages/shared/types/database.ts', import.meta.url)),
  'utf8'
);

function censusCompanyTables(src: string): { withCompanyId: string[]; all: string[] } {
  const tablesStart = src.indexOf('  Tables: {');
  const viewsStart = src.indexOf('  Views: {');
  expect(tablesStart, 'database.ts shape changed — Tables section not found').toBeGreaterThan(-1);
  expect(viewsStart, 'database.ts shape changed — Views section not found').toBeGreaterThan(
    tablesStart
  );
  const tablesSection = src.slice(tablesStart, viewsStart);

  const withCompanyId: string[] = [];
  const all: string[] = [];
  const re = /^      (\w+): \{\n        Row: \{([\s\S]*?)\n        \}/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tablesSection)) !== null) {
    all.push(m[1]);
    if (/\bcompany_id\b/.test(m[2])) withCompanyId.push(m[1]);
  }
  expect(
    withCompanyId.length,
    'census parsed suspiciously few tables — check the regex'
  ).toBeGreaterThan(80);
  return { withCompanyId, all };
}

describe('the deletion walk covers the schema — every company_id table, exactly once', () => {
  const { withCompanyId: census, all: allTables } = censusCompanyTables(databaseTs);
  const walk = new Set(COMPANY_TABLES);
  const survives = new Set(Object.keys(SURVIVES));

  it('⚠️ no company-scoped table is UNACCOUNTED FOR', () => {
    const missing = census.filter((t) => !walk.has(t) && !survives.has(t));
    expect(
      missing,
      `Tables with company_id in NEITHER the walk NOR SURVIVES — a deletion the ` +
        `policy promises would leave these standing. Add each to COMPANY_TABLES ` +
        `(delete it) or SURVIVES (with the reason): ${missing.join(', ')}`
    ).toEqual([]);
  });

  it('no table is in BOTH lists', () => {
    const both = COMPANY_TABLES.filter((t) => survives.has(t));
    expect(both, 'a table cannot be walked AND survive').toEqual([]);
  });

  it('⚠️ no PHANTOM names — every listed table exists in the schema', () => {
    // The export registry shipped three tables that do not exist
    // (estimate_items, time_entries, timesheets) and nothing went red until
    // runtime. Names are checked against the FULL table census (not just the
    // company-scoped one: platform_admins sits in SURVIVES as documentation
    // and legitimately has no company_id).
    const known = new Set(allTables);
    const phantoms = [...COMPANY_TABLES, ...Object.keys(SURVIVES)].filter((t) => !known.has(t));
    expect(
      phantoms,
      `Listed tables that do not exist in the generated schema: ${phantoms.join(', ')}`
    ).toEqual([]);
  });

  it('no duplicates inside the walk', () => {
    const dupes = COMPANY_TABLES.filter((t, i) => COMPANY_TABLES.indexOf(t) !== i);
    expect(dupes).toEqual([]);
  });
});
