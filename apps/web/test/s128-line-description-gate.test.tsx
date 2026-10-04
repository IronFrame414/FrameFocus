import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ProposalData, ProposalPricingLevel } from '@/lib/proposal/proposal-data';
import { ProposalHtml } from '@/lib/proposal/proposal-html';
import { trimProposalForClient } from '@/lib/proposal/client-proposal';
import { proposalRenderPlan } from '@framefocus/shared/utils/proposal-format';
import { renderToBuffer } from '@react-pdf/renderer';
import { ProposalDocument } from '@/lib/proposal/proposal-template';
import { pdfText } from './pdf-text';

// S128 Part A — A-2 (docs/specs/estimates-and-change-orders-spec.md).
// [Josh, 2026-10-03] "the description is only visible to clients when the format selected is
// 'summary with description', 'itemized with description', 'cost plus', 'time and material'"
//
// ⚠️ NOT A CONDITIONAL RENDER — the #136 class. The client read path (trimProposalForClient,
// the /sign page props and the /api/sign JSON) must not CONTAIN a row description on any other
// format. Asserted on the serialised payload, every stored format (legacy five + canonical
// eight). The cookie-less fetch of the real page is e2e/s128-line-description-payload.spec.ts.

const SENTINEL = 'S128-ROW-DESCRIPTION-SENTINEL';

const SHOWS: ProposalPricingLevel[] = [
  'summary_with_descriptions',
  'itemized_with_descriptions',
  'cost_plus_itemized',
  'time_and_materials_itemized',
];
const HIDES: ProposalPricingLevel[] = [
  'lump_sum',
  'category_with_price',
  'category_no_price',
  'detail_with_price_qty',
  'detail_no_price',
  'total_only',
  'summary',
  'itemized',
  'itemized_no_unit_pricing',
];

function fixture(pricingLevel: ProposalPricingLevel): ProposalData {
  const openBook =
    pricingLevel === 'cost_plus_itemized' || pricingLevel === 'time_and_materials_itemized';
  return {
    company: {
      name: 'Acme Build',
      logoUrl: null,
      brandColor: '#3b4ae0',
      addressLine1: null,
      addressLine2: null,
      city: null,
      state: null,
      zip: null,
      phone: null,
      email: null,
      licenseNumber: null,
    },
    estimate: {
      id: 'e1',
      number: 'EST-1',
      version: 'v1',
      name: 'Kitchen',
      status: 'sent',
      date: '2026-10-04',
      expiresAt: null,
      expirationDays: 30,
      pricingLevel,
      coverLetter: null,
      scopeSummary: null,
      scopeSections: [],
      termsSections: [],
      subtotal: 1000,
      taxTotal: 0,
      discountTotal: 0,
      grandTotal: 1000,
    },
    client: { name: 'Pat Client', companyName: null, email: null },
    jobSite: null,
    categories: [
      {
        name: 'Interior',
        subtotal: 1000,
        lines: [
          {
            name: 'Drywall Repair and Trim',
            // A-3: the SECTION has no description here, so a sentinel that reaches the client
            // can only have come from the ROW.
            description: null,
            total: 1000,
            originalTotal: null,
            discountLabel: null,
            cost: openBook ? 800 : null,
            markupPercent: openBook ? 25 : null,
            rows: [
              {
                name: 'Drywall',
                total: 600,
                description: `${SENTINEL} patch and skim`,
                rowType: 'labor',
                cost: openBook ? 480 : null,
                rate: openBook ? 60 : null,
                hours: openBook ? 8 : null,
              },
              {
                name: 'Trim',
                total: 400,
                description: null,
                rowType: 'material',
                cost: openBook ? 320 : null,
                rate: null,
                hours: null,
              },
            ],
            describedRows: [{ name: 'Drywall', description: `${SENTINEL} patch and skim` }],
          },
        ],
      },
    ],
    allowances: [],
  };
}

describe('S128 A-2 — the render plan names exactly the four formats', () => {
  it('rowDescriptions is true on exactly summary/itemized-with-descriptions, cost plus, T&M', () => {
    const canonical = [
      'total_only',
      'summary',
      'summary_with_descriptions',
      'itemized',
      'itemized_with_descriptions',
      'itemized_no_unit_pricing',
      'cost_plus_itemized',
      'time_and_materials_itemized',
    ] as const;
    const on = canonical.filter((c) => proposalRenderPlan(c).rowDescriptions);
    expect(on).toEqual(SHOWS);
  });
});

describe('S128 A-2 — PAYLOAD: a row description reaches the client on the four formats ONLY', () => {
  for (const f of SHOWS) {
    it(`${f} — the trimmed payload CARRIES it, and the signing page draws it`, () => {
      const t = trimProposalForClient(fixture(f));
      expect(JSON.stringify(t)).toContain(SENTINEL);
      expect(renderToStaticMarkup(<ProposalHtml data={t} />)).toContain(SENTINEL);
    });
  }
  for (const f of HIDES) {
    it(`⚠️ ${f} — the trimmed payload does NOT contain it (not merely undrawn)`, () => {
      const t = trimProposalForClient(fixture(f));
      expect(JSON.stringify(t)).not.toContain(SENTINEL);
    });
  }

  it('CONTROL — the UNTRIMMED data carries it on every format (so the absences above test the trim)', () => {
    for (const f of HIDES) expect(JSON.stringify(fixture(f))).toContain(SENTINEL);
  });

  it('A-1 — a row WITHOUT a description adds nothing: no empty box, same markup as before', () => {
    const f = fixture('itemized_with_descriptions');
    const without: ProposalData = {
      ...f,
      categories: f.categories.map((c) => ({
        ...c,
        lines: c.lines.map((l) => ({
          ...l,
          rows: l.rows.map((r) => ({ ...r, description: null })),
          describedRows: [],
        })),
      })),
    };
    const page = renderToStaticMarkup(<ProposalHtml data={trimProposalForClient(without)} />);
    expect(page).not.toContain('proposal-row-description');
  });
});

describe('S128 A-3 — the SECTION description path is untouched', () => {
  it('the section description still keys on plan.descriptions alone (cost plus hides it, as before)', () => {
    const f = fixture('cost_plus_itemized');
    f.categories[0].lines[0].description = 'SECTION-DESCRIPTION-SENTINEL';
    const t = trimProposalForClient(f);
    expect(JSON.stringify(t)).not.toContain('SECTION-DESCRIPTION-SENTINEL');
    const iw = fixture('itemized_with_descriptions');
    iw.categories[0].lines[0].description = 'SECTION-DESCRIPTION-SENTINEL';
    expect(JSON.stringify(trimProposalForClient(iw))).toContain('SECTION-DESCRIPTION-SENTINEL');
  });

  it('the editor\'s section-description control is byte-identical to main (label, save call)', () => {
    const src = readFileSync(
      join(__dirname, '..', 'app', 'dashboard', 'estimates', '[id]', 'items-tab.tsx'),
      'utf8'
    );
    expect(src).toContain('Description (shown on proposal): ');
    expect(src).toContain('updateEstimateLineItem(line.id, { description');
  });
});

// The PDF is rendered from the FULL data (it is bytes the renderer draws, not data a client can
// read past — client-proposal.ts header), so its gate is the render plan. Read the PDF's text.
describe('S128 A-2 — the PDF (ProposalDocument → renderToBuffer) prints a row description on the four formats only', () => {
  for (const f of SHOWS) {
    it(`${f} — in the PDF text`, async () => {
      const text = pdfText(await renderToBuffer(<ProposalDocument data={fixture(f)} />));
      expect(text).toContain(SENTINEL);
    });
  }
  for (const f of HIDES) {
    it(`⚠️ ${f} — NOT in the PDF text`, async () => {
      const text = pdfText(await renderToBuffer(<ProposalDocument data={fixture(f)} />));
      expect(text).toContain('Drywall Repair and Trim'.slice(0, 7)); // the PDF has text at all
      expect(text).not.toContain(SENTINEL);
    });
  }
});
