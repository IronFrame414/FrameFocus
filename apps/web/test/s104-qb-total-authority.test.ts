import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { totalMismatch } from '@/lib/quickbooks/reconcile';

/**
 * ⚠️ RULED [Josh, S104]: **this system computes the total; QuickBooks receives
 * it and does not calculate.** The risk the ruling exists to close is an
 * invoice showing one total to a client and another in the books.
 *
 * ⚠️ THE RULING IS ACHIEVABLE, AND `TaxCodeRef: 'NON'` IS WHAT MAKES IT SO.
 * Sending a total is not by itself an instruction to accept that total —
 * QuickBooks Online computes tax server-side from the customer's taxable status
 * and the company's setup. `NON` is the instruction that resolves that
 * computation to zero. Measured against the sandbox at S104, read back from the
 * API: Invoice 145 `TotalAmt 3000` against ours 3000.00 with
 * `TxnTaxDetail {TotalTax: 0}`; Purchases 151/155/156/175 agreed to the cent —
 * on a company running `TaxPrefs.UsingSalesTax: true`.
 *
 * ⚠️ NO DISCREPANCY EXISTS TODAY. This guards the mechanism, not a live bug.
 */
describe('S104-B — totalMismatch()', () => {
  it('passes when the figures agree', () => {
    expect(totalMismatch(3000, 3000, 'invoice 145')).toBeNull();
  });

  it('passes inside half a cent — the same tolerance the lines-vs-total check uses', () => {
    // Both checks must agree about what "equal" means, or one can pass a figure
    // the other would refuse.
    expect(totalMismatch(421.88, 421.8801, 'Purchase 151')).toBeNull();
  });

  it('FAILS TERMINALLY on a real difference, naming both figures and the object', () => {
    const fault = totalMismatch(3000, 3247.5, 'invoice 145');
    expect(fault?.kind, 'a tax-inflated total was accepted').toBe('terminal');
    // The message is read by a person who has to go and find the transaction.
    expect(fault && 'reason' in fault && fault.reason).toMatch(/3247\.50/);
    expect(fault && 'reason' in fault && fault.reason).toMatch(/3000\.00/);
    expect(fault && 'reason' in fault && fault.reason).toMatch(/invoice 145/);
    expect(fault && 'reason' in fault && fault.reason).toMatch(/EXISTS/);
  });

  it('treats an ABSENT TotalAmt as unknown, never as zero', () => {
    // ⚠️ A response that omits the field tells us nothing. Reading the omission
    // as 0 would invent a mismatch on every such reply and fail good pushes.
    expect(totalMismatch(3000, undefined, 'invoice 145')).toBeNull();
  });

  it('a genuine zero is still compared', () => {
    expect(totalMismatch(3000, 0, 'invoice 145')?.kind).toBe('terminal');
    expect(totalMismatch(0, 0, 'invoice 145')).toBeNull();
  });
});

const entitiesTs = readFileSync(
  fileURLToPath(new URL('../lib/quickbooks/entities.ts', import.meta.url)),
  'utf8'
);

describe('S104-C — every money line states its tax position', () => {
  it('sales AND expense lines both carry TaxCodeRef', () => {
    // F12 [S187] did the sales lines. The Purchase path sent no tax field at
    // all and was inheriting QuickBooks' default — which is the same bug F12's
    // own header describes, on the other path. Two sales sites + two expense
    // sites (buildPurchaseBody and the expense-payment Purchase).
    const sites = entitiesTs.match(/TaxCodeRef: NON_TAXABLE/g) ?? [];
    expect(sites.length, 'a money line is inheriting QuickBooks tax defaults').toBe(4);
  });

  it('the void path is NOT total-checked', () => {
    // ⚠️ MEASURED, AND IT WOULD HAVE FAILED EVERY VOID. QuickBooks zeroes a
    // voided invoice's lines and returns TotalAmt 0 while our row keeps its
    // original billed_total — INV-3676: ours 291.44, QuickBooks 0, both
    // correct. handleInvoiceVoid must never call totalMismatch().
    const voidFn = entitiesTs.slice(
      entitiesTs.indexOf('async function handleInvoiceVoid'),
      entitiesTs.indexOf('async function loadExpense')
    );
    expect(voidFn.length, 'handleInvoiceVoid not found — has it been renamed?').toBeGreaterThan(100);
    expect(
      voidFn.includes('totalMismatch'),
      'the void path total-checks, which fails every void'
    ).toBe(false);
  });
});
