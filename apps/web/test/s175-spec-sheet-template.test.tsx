import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { pdfText } from './pdf-text';
import { brand } from '@/lib/brand';
import {
  SelectionSpecSheetDocument,
} from '@/lib/selections/spec-sheet-template';
import type { SelectionSpecSheetData } from '@/lib/selections/spec-sheet-data';

// ============================================================================
// Stage 6 — the specifications sheet, asserted on a REAL rendered PDF.
// [S175 item 4] Spec §7.3, §9.4.
// ============================================================================
//
// These are the four rulings, each as a test that fails if the sheet stops
// obeying it. They are asserted on the rendered document rather than on the
// data, because every one of them is a claim about what the PAGE says:
//
//   Q4.3  approved only, stamped "Approved as of <date>"
//   Q4.4  a client-supplied selection is LISTED and MARKED, never blanked
//   §9.4  NO MONEY — no currency figure anywhere in the document
//   brand every client-facing PDF is white-label: the CONTRACTOR's name, never
//         the product's (lib/brand.ts states this in its own words)
//
// ⚠️ THE LAYOUT ITSELF IS NOT ASSERTED HERE AND CANNOT BE. A PDF template can
// satisfy every one of these and still be wrong on the page. That half is
// Josh's, and it is recorded as unverified in the S175 log.
// ============================================================================

const IMG =
  'data:image/png;base64,' +
  // 1x1 transparent PNG
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function makeData(overrides: Partial<SelectionSpecSheetData> = {}): SelectionSpecSheetData {
  return {
    company: {
      name: 'Bishop Contracting',
      logoUrl: null,
      brandColor: '#1a56db',
      addressLine1: '14 Maple St',
      addressLine2: null,
      city: 'Denver',
      state: 'CO',
      zip: '80202',
      phone: '303-555-0100',
      email: 'office@bishop.example',
      licenseNumber: 'CO-114',
      timezone: 'America/Denver',
    },
    project: { id: 'p1', name: 'Maple St Remodel' },
    clientName: 'Dana Reyes',
    areas: [
      {
        id: 'a1',
        name: 'Kitchen',
        selections: [
          {
            id: 's1',
            name: 'Countertop',
            description: 'Perimeter and island.',
            clientSupplied: false,
            approvedAt: '2026-08-14T17:00:00.000Z',
            chosen: [
              {
                name: 'Calacatta Gold quartz',
                specDetail: '3cm, eased edge, undermount cutout',
                linkUrl: 'https://example.test/quartz',
                imageDataUri: IMG,
              },
            ],
          },
          {
            id: 's2',
            name: 'Cabinet pulls',
            description: null,
            clientSupplied: true,
            approvedAt: '2026-08-15T17:00:00.000Z',
            chosen: [
              {
                name: 'Emtek Trail 4in',
                specDetail: 'Satin brass',
                linkUrl: null,
                imageDataUri: null,
              },
            ],
          },
        ],
      },
    ],
    selectionCount: 2,
    approvedAsOf: '2026-08-26T15:00:00.000Z',
    imagesOmitted: 0,
    ...overrides,
  };
}

describe('specifications sheet — the component tree', () => {
  it('Q4.3 — carries the "Approved as of <date>" stamp', () => {
    const html = renderToString(<SelectionSpecSheetDocument data={makeData()} />);
    expect(html).toContain('Approved as of August 26, 2026');
  });

  it('Q4.3 — says in words that unapproved selections are not on it', () => {
    const html = renderToString(<SelectionSpecSheetDocument data={makeData()} />);
    expect(html).toContain('Selections still being chosen are not on this sheet.');
  });

  it('Q4.4 — a client-supplied selection is LISTED and MARKED, not blanked', () => {
    const html = renderToString(<SelectionSpecSheetDocument data={makeData()} />);
    expect(html).toContain('Cabinet pulls');
    expect(html).toContain('Emtek Trail 4in');
    expect(html).toContain('Supplied by client — no charge');
  });

  it('renders the chosen option, its spec detail and its link', () => {
    const html = renderToString(<SelectionSpecSheetDocument data={makeData()} />);
    expect(html).toContain('Calacatta Gold quartz');
    expect(html).toContain('3cm, eased edge, undermount cutout');
    expect(html).toContain('https://example.test/quartz');
  });

  it('an empty project renders a sheet that says so, rather than an empty page', () => {
    const html = renderToString(
      <SelectionSpecSheetDocument data={makeData({ areas: [], selectionCount: 0 })} />
    );
    expect(html).toContain('This sheet lists approved selections only.');
  });
});

describe('specifications sheet — the real PDF', () => {
  it('renders, and the ruled strings survive the layout and font pipeline', async () => {
    const buf = await renderToBuffer(<SelectionSpecSheetDocument data={makeData()} />);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    const text = pdfText(buf);
    expect(text).toContain('Specifications');
    expect(text).toContain('Maple St Remodel');
    expect(text).toContain('Approved as of August 26, 2026');
    expect(text).toContain('Supplied by client');
  });

  /**
   * ⚠️ THE NO-MONEY TEST, AND IT IS THE IMPORTANT ONE.
   *
   * §7.3 "One rendering, no costs" and §9.4 "No money" are not a layout
   * preference — the sheet is filed under `files.category = 'selections'`, and
   * `files_select_non_client` gates only contracts/change_orders/invoices, so a
   * FOREMAN, a CREW MEMBER and a SUBCONTRACTOR who can view the project can
   * read this row. A sell figure on it would hand those three roles a sell
   * amount at the DATABASE — the Financial Visibility Floor breached by a
   * document rather than by a policy, which is the kind nobody probes for.
   *
   * `SelectionSpecSheetData` carries no field that could hold a figure, so this
   * asserts the OTHER half: that no literal in the template introduces one.
   */
  it('§9.4 — no currency figure appears anywhere in the document', async () => {
    const buf = await renderToBuffer(<SelectionSpecSheetDocument data={makeData()} />);
    const text = pdfText(buf);
    expect(text).not.toMatch(/\$\s*[\d,]/);
    // The words a money block would be introduced with, before the figure
    // arrives. A sheet that starts saying these is on its way to a price.
    for (const word of ['Allowance', 'Variance', 'Markup', 'Subtotal', 'Total', 'Price']) {
      expect(text, `"${word}" reached the specifications sheet`).not.toContain(word);
    }
  });

  it('white-label — the CONTRACTOR is named and the product is not', async () => {
    const buf = await renderToBuffer(<SelectionSpecSheetDocument data={makeData()} />);
    const text = pdfText(buf);
    expect(text).toContain('Bishop Contracting');
    expect(text).not.toContain(brand.name);
    expect(text).not.toContain('FrameFocus');
  });
});
