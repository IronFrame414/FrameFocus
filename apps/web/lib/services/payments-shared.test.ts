import { describe, it, expect } from 'vitest';
import {
  ageReceivables,
  agingBucketFor,
  canApproveRefund,
  canIssueRefund,
  canRecordPayment,
  clientCreditBalance,
  collectedForJob,
  creditAvailableOnPayment,
  isSettled,
  jobPairing,
  refundNeedsOwnerApproval,
  remainingOnInvoice,
  retainageHeld,
  type AgeableInvoice,
} from '@/lib/services/payments-shared';

// Module 7E1 — the §9 acceptance traces, computed by the shipped functions.
// Every figure asserted here is the figure the spec states.

const live = (amount: number) => ({ amount, is_deleted: false });

function invoice(over: Partial<AgeableInvoice> & Pick<AgeableInvoice, 'id'>): AgeableInvoice {
  return {
    invoice_number: 'INV-0001',
    status: 'sent',
    is_deleted: false,
    issue_date: '2026-06-01',
    amount_receivable: 0,
    retainage_withheld: 0,
    supersedes_invoice_id: null,
    applications: [],
    ...over,
  };
}

describe('§9-A — payment arrives and is applied', () => {
  // INV-0007 sent for $18,000 with $1,800 retained -> receivable $16,200 (7D §15-A)
  const RECEIVABLE = 16200;

  it('a $10,000 check leaves $6,200 remaining — DERIVED, not stored', () => {
    expect(remainingOnInvoice(RECEIVABLE, [live(10000)])).toBe(6200);
  });

  it('the invoice stays OPEN and keeps ageing on the $6,200', () => {
    expect(isSettled(RECEIVABLE, [live(10000)])).toBe(false);
    const summary = ageReceivables(
      [invoice({ id: 'i1', amount_receivable: RECEIVABLE, retainage_withheld: 1800, applications: [live(10000)] })],
      '2026-06-15'
    );
    expect(summary.totalOutstanding).toBe(6200);
    expect(summary.buckets.current).toBe(6200);
  });

  it('THE LOAD-BEARING RULE: the $1,800 retainage does NOT age', () => {
    const summary = ageReceivables(
      [invoice({ id: 'i1', amount_receivable: RECEIVABLE, retainage_withheld: 1800, applications: [live(10000)] })],
      '2026-06-15'
    );
    // Shown separately...
    expect(summary.retainageHeld).toBe(1800);
    // ...and in NO bucket, and not in the outstanding total.
    expect(summary.buckets.current).toBe(6200);
    expect(summary.totalOutstanding).toBe(6200);
    expect(Object.values(summary.buckets).reduce((a, b) => a + b, 0)).toBe(6200);
  });

  it('THE PAIRING: collected $10,000 against spent $7,400 = +$2,600 (§6a)', () => {
    const pairing = jobPairing(10000, 7400);
    expect(pairing.collected).toBe(10000);
    expect(pairing.spent).toBe(7400);
    expect(pairing.difference).toBe(2600);
  });

  it('a PM cannot record a payment; Owner and Admin can (§8)', () => {
    expect(canRecordPayment('owner')).toBe(true);
    expect(canRecordPayment('admin')).toBe(true);
    expect(canRecordPayment('project_manager')).toBe(false);
    expect(canRecordPayment('foreman')).toBe(false);
  });
});

describe('§9-B — ONE check across several invoices', () => {
  // One $25,000 check covering INV-0007 ($6,200 remaining) and INV-0008 ($18,800).
  it('one payment, TWO applications, both invoices satisfied', () => {
    const inv7 = { amount_receivable: 16200, applications: [live(10000), live(6200)] };
    const inv8 = { amount_receivable: 18800, applications: [live(18800)] };

    expect(remainingOnInvoice(inv7.amount_receivable, inv7.applications)).toBe(0);
    expect(remainingOnInvoice(inv8.amount_receivable, inv8.applications)).toBe(0);
    expect(isSettled(inv7.amount_receivable, inv7.applications)).toBe(true);
    expect(isSettled(inv8.amount_receivable, inv8.applications)).toBe(true);

    // The whole $25,000 was applied, so no credit is left over.
    expect(creditAvailableOnPayment(25000, [live(6200), live(18800)])).toBe(0);
  });

  it('the mirror also holds — one invoice takes several payments over time', () => {
    expect(remainingOnInvoice(16200, [live(10000)])).toBe(6200);
    expect(remainingOnInvoice(16200, [live(10000), live(6200)])).toBe(0);
  });

  it('neither invoice appears in aging once satisfied', () => {
    const summary = ageReceivables(
      [
        invoice({ id: 'i7', amount_receivable: 16200, applications: [live(10000), live(6200)] }),
        invoice({ id: 'i8', amount_receivable: 18800, applications: [live(18800)] }),
      ],
      '2026-06-15'
    );
    expect(summary.totalOutstanding).toBe(0);
    expect(summary.invoices).toHaveLength(0);
  });
});

describe('§9-C — overpayment, mid-job then final', () => {
  it('MID-JOB: $6,200 invoice paid $6,500 leaves a $300 CREDIT on account', () => {
    // The application can only ever cover what was owed (P-4)...
    expect(remainingOnInvoice(6200, [live(6200)])).toBe(0);
    // ...so the surplus stays UNAPPLIED on the payment — that IS the credit.
    expect(creditAvailableOnPayment(6500, [live(6200)])).toBe(300);
  });

  it('the credit is never auto-applied — it sits until a user places it (§3)', () => {
    // Nothing in this module applies a credit; it only reports what is available.
    const balance = clientCreditBalance([
      { id: 'p1', amount: 6500, applications: [live(6200)] },
    ]);
    expect(balance).toBe(300);
  });

  it('FINAL: $4,000 invoice paid $4,300 — the $300 surplus has nowhere to go', () => {
    expect(remainingOnInvoice(4000, [live(4000)])).toBe(0);
    expect(creditAvailableOnPayment(4300, [live(4000)])).toBe(300);
    // With no invoice left to credit against this becomes a REFUND (§5) —
    // a RefundReceipt, cash leaving, not a CreditMemo.
    expect(canIssueRefund('owner')).toBe(true);
    expect(canIssueRefund('admin')).toBe(true);
    expect(canIssueRefund('project_manager')).toBe(false);
  });

  it('an ADMIN-initiated refund needs OWNER approval (§5)', () => {
    expect(refundNeedsOwnerApproval('admin')).toBe(true);
    expect(refundNeedsOwnerApproval('owner')).toBe(false);
    expect(canApproveRefund('owner')).toBe(true);
    expect(canApproveRefund('admin')).toBe(false);
  });

  it('a soft-deleted payment removes its own credit — derivation self-corrects', () => {
    const balance = clientCreditBalance([
      { id: 'p1', amount: 6500, is_deleted: true, applications: [] },
      { id: 'p2', amount: 4300, applications: [live(4000)] },
    ]);
    expect(balance).toBe(300);
  });
});

describe('§9-E — retainage release at completion (REAL, $1,000,000 job)', () => {
  // Nine months of draws on a ~$1,000,000 contract at 10% retainage.
  // Each invoice's receivable was net of its 10%; $100,000 accrued as held.
  const draws = Array.from({ length: 9 }, (_, i) =>
    invoice({
      id: `d${i}`,
      invoice_number: `INV-00${i + 1}`,
      issue_date: '2026-01-15',
      // Each draw: $111,111.11 billed, 10% held -> receivable $100,000
      amount_receivable: 100000,
      retainage_withheld: 11111.11,
      applications: [live(100000)], // every draw was paid in full
    })
  );

  it('$100,000 accrues as retainage held across the nine draws', () => {
    // 9 x 11,111.11 = 99,999.99 — the real-world figure rounds to $100,000.
    expect(retainageHeld(draws)).toBe(99999.99);
  });

  it('and NONE of it ever entered a 30/60/90 bucket — even after nine months', () => {
    const summary = ageReceivables(draws, '2026-09-30');
    expect(summary.totalOutstanding).toBe(0);
    expect(summary.buckets.d90_plus).toBe(0);
    expect(summary.retainageHeld).toBe(99999.99);
    // This is the point: aging the GROSS invoices would have shown six figures
    // overdue for the entire job, on money the client was entitled to hold.
  });

  it('the release invoice bills the held amount and then nothing is held', () => {
    const release = invoice({
      id: 'rel',
      invoice_number: 'INV-0010',
      amount_receivable: 100000,
      retainage_withheld: 0, // a release invoice holds nothing back itself
      applications: [live(100000)],
    });
    expect(retainageHeld([release])).toBe(0);
    expect(isSettled(release.amount_receivable, release.applications)).toBe(true);
  });

  it('a VOIDED invoice holds no retainage — it billed nothing', () => {
    expect(
      retainageHeld([
        { status: 'voided', is_deleted: false, retainage_withheld: 5000 },
        { status: 'sent', is_deleted: false, retainage_withheld: 1800 },
      ])
    ).toBe(1800);
  });
});

describe('§6 — aging buckets and the reissue clock', () => {
  it('buckets at 30 / 60 / 90 days', () => {
    expect(agingBucketFor('2026-06-01', '2026-06-01')).toBe('current');
    expect(agingBucketFor('2026-06-01', '2026-07-01')).toBe('current'); // day 30
    expect(agingBucketFor('2026-06-01', '2026-07-02')).toBe('d31_60'); // day 31
    expect(agingBucketFor('2026-06-01', '2026-07-31')).toBe('d31_60'); // day 60
    expect(agingBucketFor('2026-06-01', '2026-08-01')).toBe('d61_90'); // day 61
    expect(agingBucketFor('2026-06-01', '2026-08-30')).toBe('d61_90'); // day 90
    expect(agingBucketFor('2026-06-01', '2026-08-31')).toBe('d90_plus'); // day 91
  });

  it('acceptance #14 — a reissue ages from its OWN date and SURFACES the link', () => {
    const voided = invoice({
      id: 'old',
      invoice_number: 'INV-0007',
      status: 'voided',
      issue_date: '2026-04-01',
      amount_receivable: 6200,
    });
    const successor = invoice({
      id: 'new',
      invoice_number: 'INV-0009',
      status: 'sent',
      issue_date: '2026-06-10', // its own, fresh date
      amount_receivable: 6200,
      supersedes_invoice_id: 'old',
    });

    const summary = ageReceivables([voided, successor], '2026-06-15');

    // The withdrawn original does not age at all...
    expect(summary.invoices.map((i) => i.id)).toEqual(['new']);
    // ...and the successor is CURRENT, not 70+ days overdue.
    expect(summary.invoices[0].bucket).toBe('current');
    expect(summary.invoices[0].ageDays).toBe(5);
    // The mitigation: the link to the voided original stays visible.
    expect(summary.invoices[0].supersedesInvoiceId).toBe('old');
  });

  it('a DRAFT never ages — it was never a demand', () => {
    const summary = ageReceivables(
      [invoice({ id: 'd', status: 'draft', issue_date: '2026-01-01', amount_receivable: 5000 })],
      '2026-06-15'
    );
    expect(summary.totalOutstanding).toBe(0);
  });

  it('sorts the oldest debt first', () => {
    const summary = ageReceivables(
      [
        invoice({ id: 'young', issue_date: '2026-06-01', amount_receivable: 100 }),
        invoice({ id: 'old', issue_date: '2026-01-01', amount_receivable: 200 }),
      ],
      '2026-06-15'
    );
    expect(summary.invoices.map((i) => i.id)).toEqual(['old', 'young']);
    expect(summary.buckets.d90_plus).toBe(200);
    expect(summary.buckets.current).toBe(100);
  });
});

describe('§6a — the pairing, and what must NOT leak into it', () => {
  it('collected is Σ APPLICATIONS on the job — not billed, not earned', () => {
    const collected = collectedForJob([
      { applications: [live(10000)] },
      { applications: [live(6200), live(18800)] },
    ]);
    expect(collected).toBe(35000);
  });

  it('an unapplied surplus is NOT collected against the job', () => {
    // $6,500 paid, $6,200 applied — only the applied part is revenue on the job.
    expect(collectedForJob([{ applications: [live(6200)] }])).toBe(6200);
  });

  it('reports when the spent side is incomplete rather than showing a low figure', () => {
    const gated = jobPairing(10000, 0, false);
    expect(gated.spentComplete).toBe(false);
    expect(gated.difference).toBe(10000);
  });

  it('a negative difference reads as a loss, not an error', () => {
    expect(jobPairing(10000, 12500).difference).toBe(-2500);
  });
});
