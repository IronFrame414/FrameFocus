import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { InvoiceDocument } from '@/lib/invoices/invoice-template';
import type { InvoicePdfData } from '@/lib/invoices/invoice-data';
import { presentInvoice } from '@framefocus/shared/utils/invoice-derivation';

// THE FIRST PDF RENDER TEST IN THE REPO.
//
// Every template shipped so far (invoice, change order, delivery, safety,
// daily log) could break at render time with type-check, tests and build all
// green — @react-pdf components are typed loosely and a bad style object or a
// null reaching a <Text> only fails when something actually renders it.
//
// WHY IT WAS MISSING, and how it is possible now: Vitest 4 transforms through
// oxc and silently ignores the `esbuild.jsx` option, so a .tsx test could not
// compile at all. The live-harness runner already solved that with
// `oxc: { jsx: { runtime: 'automatic' } }`; the same setting is now in
// vitest.config.ts, which is what lets this file exist.
//
// This renders through react-dom rather than @react-pdf's own renderer: it
// exercises the component tree, the conditionals and every value that reaches a
// text node — which is where template bugs live — without spawning a PDF
// process on every test run.

const LINES = [
  {
    description: 'Framing',
    category: 'material' as const,
    costBasis: 800,
    amount: 1000,
    lineType: 'derived_cost' as const,
  },
];

function data(
  over: Partial<InvoicePdfData['invoice']> = {},
  lines: typeof LINES = LINES
): InvoicePdfData {
  const level = (over.presentationLevel ?? 'full_detail') as 'full_detail';
  return {
    company: {
      name: 'Sabal Point Construction',
      logoUrl: null,
      brandColor: '#1a56db',
      addressLine1: '1 Test Way',
      addressLine2: null,
      city: 'Columbus',
      state: 'OH',
      zip: '43004',
      phone: '555-0100',
      email: 'billing@example.invalid',
      licenseNumber: 'LIC-1',
      timezone: 'America/New_York',
    },
    client: {
      name: 'Test Client',
      companyName: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      state: null,
      zip: null,
    },
    project: { name: 'Test job', number: 'PRJ-001' },
    // Built with the SHIPPED presenter, so the fixture cannot drift from what
    // the real PDF path produces.
    presented: presentInvoice(lines as never, level),
    isDraft: (over.status ?? 'sent') === 'draft',
    invoice: {
      id: 'i1',
      number: 'INV-0001',
      title: 'Progress billing',
      status: 'sent',
      issueDate: '2026-06-01',
      dueDate: null,
      isDeposit: false,
      presentationLevel: 'full_detail',
      retainagePercent: null,
      retainageWithheld: 0,
      billedTotal: 1000,
      amountReceivable: 1000,
      notes: null,
      ...over,
    },
    generatedAt: '2026-06-01T12:00:00.000Z',
  } as unknown as InvoicePdfData;
}

const render = (d: InvoicePdfData) => renderToString(InvoiceDocument({ data: d }) as never);

describe('invoice template — it renders at all', () => {
  it('renders a sent invoice without throwing', () => {
    expect(() => render(data())).not.toThrow();
  });

  it('renders a DRAFT — the watermarked, unnumbered variant', () => {
    // The draft path has its own branches (no number, the "not a bill" notice)
    // and is the one a client must never mistake for a bill.
    const html = render(data({ status: 'draft', number: null }));
    expect(html).toMatch(/DRAFT/);
    expect(html).toMatch(/not a bill/i);
  });

  it('renders every presentation level', () => {
    for (const level of ['full_detail', 'by_section', 'lump_sum'] as const) {
      expect(() => render(data({ presentationLevel: level })), level).not.toThrow();
    }
  });

  it('renders with retainage withheld', () => {
    const html = render(data({ retainagePercent: 10, retainageWithheld: 100, amountReceivable: 900 }));
    expect(html).toMatch(/etainage/);
  });
});

describe('invoice template — payment terms print (7D open item #3)', () => {
  it('a NULL due date prints "Due on receipt", never a blank', () => {
    const html = render(data({ dueDate: null }));
    expect(html).toMatch(/Terms/);
    expect(html).toMatch(/Due on receipt/);
  });

  it('a set due date prints the date', () => {
    const html = render(data({ dueDate: '2026-07-01' }));
    expect(html).toMatch(/Terms/);
    expect(html).toMatch(/July 1, 2026/);
    expect(html).not.toMatch(/Due on receipt/);
  });
});

describe('invoice template — nulls that used to be assumed present', () => {
  it('survives a client with no address and a company with no logo', () => {
    const d = data();
    (d as { client: unknown }).client = {
      name: 'Bare Client', companyName: null,
      addressLine1: null, addressLine2: null, city: null, state: null, zip: null,
    };
    expect(() => render(d)).not.toThrow();
  });

  it('survives an invoice with no lines and no title', () => {
    expect(() => render(data({ title: null }, []))).not.toThrow();
  });
});
