import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * ⚠️ EVERY QUICKBOOKS LINK WRITE-BACK MUST CHECK ITS ERROR [S104].
 *
 * ----------------------------------------------------------------------------
 * WHY A SOURCE-SHAPE TEST AND NOT A BEHAVIOURAL ONE
 * ----------------------------------------------------------------------------
 * The defect this guards is an ABSENCE — nine `.update()` calls that never
 * destructured `{ error }`. An absence cannot be caught by exercising the happy
 * path, and the failing path needs a live QuickBooks push to reach. So this
 * reads the source, the same way `s187-qb-link-census.test.ts` reads the
 * generated types: the next writer that forgets goes red HERE, with its table
 * named, rather than silently in a customer's books.
 *
 * ⚠️ WHAT THE ABSENCE COST, so nobody softens this into a warning. A rejected
 * write meant: the object EXISTS in QuickBooks, `qb_*_id` was never stored, and
 * the handler returned `{ kind: 'pushed' }` — so `markPushed()` closed the queue
 * row over it. An orphaned financial record, invisible on both sides. The
 * rejection was real: `expense_payments_retainage_rate_recorded_check` was
 * `NOT VALID` and 7 of 17 rows violated it, which made any UPDATE to them fail.
 *
 * See `lib/quickbooks/reconcile.ts` for why the error check had to ship
 * alongside `adoptExisting*()` rather than before it.
 */

const entitiesTs = readFileSync(
  fileURLToPath(new URL('../lib/quickbooks/entities.ts', import.meta.url)),
  'utf8'
);

/** The tables `entities.ts` writes a QuickBooks link back to. */
const LINK_TABLES = [
  'invoices',
  'client_payments',
  'client_refunds',
  'expenses',
  'expense_payments',
] as const;

describe('S104-A — no unchecked QuickBooks link write survives in entities.ts', () => {
  it.each(LINK_TABLES)(
    'writes to %s go through recordLink(), never a bare ctx.admin update',
    (table) => {
      // The exact shape the nine defective writers had. Matching it at all is
      // the failure — there is no acceptable instance of it on these tables.
      const bare = new RegExp(
        String.raw`ctx\.admin\s*\n?\s*\.from\('${table}'\)\s*\n?\s*\.update\(`,
        'g'
      );
      const hits = entitiesTs.match(bare) ?? [];
      expect(
        hits.length,
        `${table}: ${hits.length} unchecked ctx.admin update(s). A QuickBooks link write ` +
          `MUST use recordLink() from lib/quickbooks/reconcile.ts so a rejected write ` +
          `fails the queue row instead of reporting a push that did not land.`
      ).toBe(0);
    }
  );

  it('every recordLink() call names the QuickBooks object in its message', () => {
    // The 5th argument is what a bookkeeper searches for. `recordLink(...)`
    // without it would produce "could not save" over a transaction that exists.
    const calls = entitiesTs.match(/recordLink\(/g) ?? [];
    expect(calls.length, 'recordLink() is not being used at all').toBeGreaterThanOrEqual(9);

    // Every call site must carry a template literal describing the object.
    const described = entitiesTs.match(/`(invoice|payment|Purchase|\$\{responseKey\}) \$\{/g) ?? [];
    expect(
      described.length,
      'a recordLink() call has no QuickBooks-object description'
    ).toBeGreaterThanOrEqual(9);
  });

  it('a create that can be retried adopts an existing object rather than duplicating it', () => {
    // ⚠️ THE PAIRING IS THE POINT [Josh, S104]. Checking the error turns a
    // silent wrong state into a RETRYABLE one, and QuickBooks has no PUT — a
    // retried create is a second financial record. Each of the three create
    // handlers that can now fail after reaching Intuit must guard on
    // `row.attempts > 0` first.
    const guards = entitiesTs.match(/if \(row\.attempts > 0\) \{/g) ?? [];
    expect(
      guards.length,
      'a create handler can fail after reaching QuickBooks and has no adoption guard — ' +
        'a retry would duplicate the record'
    ).toBeGreaterThanOrEqual(3);
  });

  it('Purchases carry the [FF:<id>] marker, because they have no natural key of ours', () => {
    // An invoice is adoptable by DocNumber. A Purchase is not adoptable by
    // anything unless we put something there.
    expect(
      entitiesTs.includes('withMarker('),
      'no PrivateNote marker is stamped — an orphaned Purchase would be unmatchable'
    ).toBe(true);
  });
});
