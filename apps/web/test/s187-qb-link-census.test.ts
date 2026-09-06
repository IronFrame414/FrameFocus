import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { QB_LINK_EXEMPT, QB_LINK_RESETS } from '@/lib/quickbooks/disconnect-resets';

/**
 * ⚠️ THE QUICKBOOKS LINK CENSUS [S187]. Every `qb_%_id` column in the schema
 * must be in EXACTLY ONE of the disconnect reset list (`QB_LINK_RESETS`) or the
 * exempt map (`QB_LINK_EXEMPT`, with a stated reason).
 *
 * ----------------------------------------------------------------------------
 * ⚠️ WHY THIS EXISTS — THREE MIGRATIONS DRIFTED BEFORE ANYONE NOTICED
 * ----------------------------------------------------------------------------
 * `clearEntityLinks` was a hand-maintained list, and three migrations added
 * link columns without touching it:
 *
 *     expenses.qb_purchase_id                  M-G  (20261400000000)
 *     expense_payments.qb_purchase_id          M-L  (20261450000000)
 *     time_clock_sessions.qb_time_activity_id       (20260924000000)
 *
 * The consequence is not untidiness. The user chooses "clear the links" and is
 * told the app forgets; a surviving id means the next edit pushes a FULL-OBJECT
 * update at that id, and after a reconnect to a different QuickBooks company —
 * ids being small per-realm sequentials — it lands on an unrelated transaction
 * and overwrites every field of it.
 *
 * ⚠️ MODELLED ON `lib/trial/deletion-census.test.ts`, which does exactly this
 * for the trial-deletion walk and which caught M-J's two missing tables. Same
 * mechanism, same reason: parse the GENERATED types, which regenerate on every
 * migration, so the next one that forgets goes red HERE with the column named —
 * not silently in a customer's books.
 */

const databaseTs = readFileSync(
  fileURLToPath(new URL('../../../packages/shared/types/database.ts', import.meta.url)),
  'utf8'
);

/** Every `table.column` in the generated types matching `qb_%_id`. */
function censusLinkColumns(src: string): string[] {
  const tablesStart = src.indexOf('  Tables: {');
  const viewsStart = src.indexOf('  Views: {');
  expect(tablesStart, 'database.ts shape changed — Tables section not found').toBeGreaterThan(-1);
  expect(viewsStart, 'database.ts shape changed — Views section not found').toBeGreaterThan(
    tablesStart
  );
  const tablesSection = src.slice(tablesStart, viewsStart);

  const found: string[] = [];
  const tableRe = /^      (\w+): \{\n        Row: \{([\s\S]*?)\n        \}/gm;
  let m: RegExpExecArray | null;
  while ((m = tableRe.exec(tablesSection)) !== null) {
    const table = m[1];
    for (const col of m[2].matchAll(/^\s{10}(qb_\w+_id)\??:/gm)) {
      found.push(`${table}.${col[1]}`);
    }
  }
  return found.sort();
}

/** table.column for everything the reset list actually nulls. */
function resetColumns(): string[] {
  const out: string[] = [];
  for (const [table, patch] of QB_LINK_RESETS) {
    for (const col of Object.keys(patch)) {
      if (/^qb_\w+_id$/.test(col)) out.push(`${table}.${col}`);
    }
  }
  return out.sort();
}

describe('S187 — every QuickBooks link column is reset on disconnect, or exempt with a reason', () => {
  const census = censusLinkColumns(databaseTs);

  it('the census finds the link columns at all (guards the regex, not the code)', () => {
    // ⚠️ A CENSUS THAT PARSES NOTHING PASSES EVERYTHING. If the generator's
    // formatting changes, this is the assertion that says so instead of the
    // suite going quietly green.
    expect(census.length, `parsed suspiciously few qb_*_id columns: ${census.join(', ')}`)
      .toBeGreaterThanOrEqual(10);
    expect(census).toContain('contacts.qb_customer_id');
    expect(census).toContain('invoices.qb_invoice_id');
  });

  it('⚠️ no link column is UNACCOUNTED FOR', () => {
    const reset = new Set(resetColumns());
    const exempt = new Set(Object.keys(QB_LINK_EXEMPT));

    const missing = census.filter((c) => !reset.has(c) && !exempt.has(c));

    expect(
      missing,
      'These qb_*_id columns are in NEITHER the disconnect reset list NOR the exempt map. ' +
        'A link that survives "clear the links" will push a full-object update at a stale id — ' +
        'and after a reconnect to a different QuickBooks company that overwrites an unrelated ' +
        'transaction. Add each to QB_LINK_RESETS (clear it) or QB_LINK_EXEMPT (with the reason): ' +
        missing.join(', ')
    ).toEqual([]);
  });

  it('⚠️ no column is in BOTH lists — the two must not disagree', () => {
    const reset = new Set(resetColumns());
    const both = Object.keys(QB_LINK_EXEMPT).filter((c) => reset.has(c));
    expect(both, `claimed exempt AND reset: ${both.join(', ')}`).toEqual([]);
  });

  it('every exemption states a reason', () => {
    // ⚠️ THE REASON IS THE POINT. "Not a link" without a why is how the next
    // column gets waved through.
    for (const [col, why] of Object.entries(QB_LINK_EXEMPT)) {
      expect(why.trim().length, `${col} is exempt with no reason given`).toBeGreaterThan(15);
    }
  });

  it('every exempt entry names a column that still exists', () => {
    // A stale exemption is the mirror of a stale reset: it silently excuses a
    // column that was renamed or dropped, and would excuse a NEW column that
    // happened to reuse the name.
    for (const col of Object.keys(QB_LINK_EXEMPT)) {
      expect(census, `exempt entry ${col} matches no column in the schema`).toContain(col);
    }
  });

  it('every reset table/column pair names a column that still exists', () => {
    for (const col of resetColumns()) {
      expect(census, `reset entry ${col} matches no column in the schema`).toContain(col);
    }
  });
});
