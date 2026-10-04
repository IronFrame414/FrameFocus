import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ProposalData, ProposalPricingLevel } from '@/lib/proposal/proposal-data';
import { ProposalHtml } from '@/lib/proposal/proposal-html';
import { trimProposalForClient } from '@/lib/proposal/client-proposal';

// [S112, RULED Josh] "trim on the server to exactly what the chosen format
// shows. This is #136 and it breaks the S164 ruling that a lump-sum client gets
// no line-level price."
//
// For EVERY stored format (legacy five + canonical eight):
//   1. PARITY — the signing page rendered from the trimmed data is byte-for-byte
//      the page rendered from the full data. Nothing the client SEES was removed.
//   2. PAYLOAD — the money the format does not show is not in the trimmed data.
// A control proves the parity check can fail.

const FORMATS: ProposalPricingLevel[] = [
  'lump_sum',
  'category_with_price',
  'category_no_price',
  'detail_with_price_qty',
  'detail_no_price',
  'total_only',
  'summary',
  'summary_with_descriptions',
  'itemized',
  'itemized_with_descriptions',
  'itemized_no_unit_pricing',
  'cost_plus_itemized',
  'time_and_materials_itemized',
];

/** Distinct figures, so any one of them appearing in a payload is identifiable. */
function fixture(pricingLevel: ProposalPricingLevel): ProposalData {
  const openBook =
    pricingLevel === 'cost_plus_itemized' || pricingLevel === 'time_and_materials_itemized';
  return {
    company: {
      name: 'Acme Build',
      logoUrl: null,
      brandColor: '#3b4ae0',
      addressLine1: '1 Main',
      addressLine2: null,
      city: 'Tampa',
      state: 'FL',
      zip: '33601',
      phone: null,
      email: null,
      licenseNumber: null,
    },
    estimate: {
      id: 'e1',
      number: 'EST-1',
      version: 'v1.1',
      name: 'Kitchen',
      status: 'sent',
      date: '2026-09-01',
      expiresAt: null,
      expirationDays: 30,
      pricingLevel,
      coverLetter: null,
      scopeSummary: null,
      scopeSections: [],
      termsSections: [],
      subtotal: 11111.11,
      taxTotal: 777.77,
      discountTotal: 222.22,
      grandTotal: 11666.66,
    },
    client: { name: 'Pat Client', companyName: null, email: null },
    jobSite: null,
    categories: [
      {
        name: 'Framing',
        subtotal: 6543.21,
        lines: [
          {
            name: 'Walls',
            description: 'Frame the new walls',
            total: 4321.09,
            originalTotal: 4500.01,
            discountLabel: '4%',
            cost: openBook ? 3001.23 : null,
            markupPercent: openBook ? 20 : null,
            rows: [
              {
                name: 'Carpenter',
                total: 1999.19,
                // [S128 Part A] a ROW description — parity must hold with it present.
                description: 'Rough framing, two days',
                rowType: 'labor',
                cost: openBook ? 1500.15 : null,
                rate: openBook ? 75.5 : null,
                hours: openBook ? 20 : null,
              },
              {
                name: 'Studs',
                total: 2321.9,
                description: null,
                rowType: 'material',
                cost: openBook ? 1501.08 : null,
                rate: null,
                hours: null,
              },
            ],
            describedRows: [{ name: 'Carpenter', description: 'Rough framing, two days' }],
          },
        ],
      },
      {
        name: 'Drywall',
        subtotal: 4567.89,
        lines: [
          {
            name: 'Hang and finish',
            description: 'Level 4 finish',
            total: 4567.89,
            originalTotal: null,
            discountLabel: null,
            cost: openBook ? 3333.33 : null,
            markupPercent: openBook ? 25 : null,
            rows: [
              {
                name: 'Board',
                total: 4567.89,
                description: '5/8 type X on the garage wall',
                rowType: 'material',
                cost: openBook ? 3333.33 : null,
                rate: null,
                hours: null,
              },
            ],
            describedRows: [{ name: 'Board', description: '5/8 type X on the garage wall' }],
          },
        ],
      },
    ],
    allowances: [{ name: 'Tile', lineName: 'Floor', amount: 850.5 }],
  };
}

const html = (d: Parameters<typeof ProposalHtml>[0]['data']) =>
  renderToStaticMarkup(<ProposalHtml data={d} />);

/** Every money figure of the tree, for payload assertions. */
function treeMoney(d: ReturnType<typeof trimProposalForClient>) {
  const out: number[] = [];
  for (const c of d.categories) {
    if (c.subtotal != null) out.push(c.subtotal);
    for (const l of c.lines) {
      for (const v of [l.total, l.originalTotal, l.cost]) if (v != null) out.push(v);
      for (const r of l.rows) for (const v of [r.total, r.cost, r.rate]) if (v != null) out.push(v);
    }
  }
  return out;
}

describe('S112 client proposal — PARITY: the client sees exactly what the full data drew', () => {
  for (const f of FORMATS) {
    it(`${f} — identical signing-page markup from full and trimmed data`, () => {
      const full = fixture(f);
      expect(html(trimProposalForClient(full))).toBe(html(full));
    });
  }

  it('CONTROL — an OVER-trimmed payload (subtotals dropped on itemized) changes the markup', () => {
    const full = fixture('itemized');
    const over = trimProposalForClient(full);
    over.categories = over.categories.map((c) => ({ ...c, subtotal: null }));
    expect(html(over)).not.toBe(html(full));
  });
});

describe('S112 client proposal — PAYLOAD: withheld money is not in the data', () => {
  it('lump_sum / total_only — NO category, line or row figure at all (S164)', () => {
    for (const f of ['lump_sum', 'total_only'] as const) {
      const t = trimProposalForClient(fixture(f));
      expect(t.categories, f).toEqual([]);
      const json = JSON.stringify(t);
      for (const n of ['6543.21', '4567.89', '4321.09', '4500.01', '1999.19', '2321.9'])
        expect(json, `${f} leaks ${n}`).not.toContain(n);
    }
  });

  it('summary / category formats — category subtotals at most, never a line or row figure', () => {
    for (const f of ['summary', 'category_with_price', 'category_no_price'] as const) {
      const t = trimProposalForClient(fixture(f));
      for (const c of t.categories) expect(c.lines, f).toEqual([]);
    }
    // [S112, RULED Josh] _Superseded:_ summary_with_descriptions was in the list
    // above ("carries no lines") — that encoded the page that wrongly hid its
    // descriptions. It now carries each DESCRIBED line: name + description,
    // and still no line or row FIGURE, which is this test's actual claim.
    const swd = trimProposalForClient(fixture('summary_with_descriptions'));
    const lines = swd.categories.flatMap((c) => c.lines);
    expect(lines.length, 'described lines must be carried').toBeGreaterThan(0);
    for (const l of lines) {
      expect(l.description, 'only described lines').toBeTruthy();
      expect([l.total, l.originalTotal, l.cost, l.markupPercent, l.discountLabel]).toEqual([
        null,
        null,
        null,
        null,
        null,
      ]);
      expect(l.rows).toEqual([]);
    }
    expect(
      trimProposalForClient(fixture('category_no_price')).categories.every(
        (c) => c.subtotal === null
      )
    ).toBe(true);
  });

  it('itemized_no_unit_pricing / detail_no_price — no line or row price', () => {
    for (const f of ['itemized_no_unit_pricing', 'detail_no_price'] as const) {
      const t = trimProposalForClient(fixture(f));
      for (const c of t.categories)
        for (const l of c.lines) {
          expect([l.total, l.originalTotal], f).toEqual([null, null]);
          for (const r of l.rows) expect(r.total, f).toBeNull();
        }
    }
  });

  it('non-open-book formats never carry cost, rate or markup', () => {
    for (const f of FORMATS.filter(
      (x) => !x.startsWith('cost_plus') && !x.startsWith('time_and')
    )) {
      const t = trimProposalForClient(fixture(f));
      for (const c of t.categories)
        for (const l of c.lines) {
          expect([l.cost, l.markupPercent], f).toEqual([null, null]);
          for (const r of l.rows) expect([r.cost, r.rate, r.hours], f).toEqual([null, null, null]);
        }
    }
  });

  it('estimate.taxTotal is drawn by neither renderer, so it is never sent', () => {
    for (const f of FORMATS) expect(trimProposalForClient(fixture(f)).estimate.taxTotal).toBeNull();
  });

  it('CONTROL — the untrimmed lump-sum payload DOES carry the breakdown (what S112 found)', () => {
    const full = fixture('lump_sum');
    expect(JSON.stringify(full)).toContain('4321.09');
    expect(treeMoney(trimProposalForClient(full))).toEqual([]);
  });
});

describe('[S112, RULED Josh] Summary with Descriptions SHOWS its line descriptions — the client signs what they see', () => {
  it('the signing page draws each description, from full AND trimmed data', () => {
    for (const d of [fixture('summary_with_descriptions'), trimProposalForClient(fixture('summary_with_descriptions'))]) {
      const page = html(d);
      expect(page).toContain('Frame the new walls');
      expect(page).toContain('Level 4 finish');
      // Names give the description its context…
      expect(page).toContain('Walls');
      // …but the format prices CATEGORIES only: no line total is drawn.
      expect(page).not.toContain('4,500.01');
    }
    // CONTROL for the line above: the itemized page DOES draw that line price
    // (Walls is discounted, so the drawn figure is its original, 4,500.01) — so
    // the not.toContain is testing something. It first used 4,321.09, which no
    // page draws; this control is what caught that.
    expect(html(fixture('itemized'))).toContain('4,500.01');
  });

  it('CONTROL — plain Summary draws no description (the block keys on the plan, not on the data)', () => {
    const page = html(fixture('summary'));
    expect(page).not.toContain('Frame the new walls');
    expect(page).not.toContain('Level 4 finish');
  });

  it('a line WITHOUT a description is neither drawn nor carried', () => {
    const f = fixture('summary_with_descriptions');
    // [S128] "without a description" now means neither the SECTION's nor any ROW's:
    // a section with a described row is drawn (Part A). _Superseded setup: the
    // copy kept line 0's rows, which now carry a description._
    f.categories[0].lines.push({
      ...f.categories[0].lines[0],
      name: 'Undescribed extra',
      description: null,
      describedRows: [],
    });
    expect(html(f)).not.toContain('Undescribed extra');
    const carried = trimProposalForClient(f).categories.flatMap((c) => c.lines.map((l) => l.name));
    expect(carried).not.toContain('Undescribed extra');
    expect(carried).toContain('Walls');
  });

  it('[S128 Part A] a section with no description of its own but a DESCRIBED ROW is drawn and carried', () => {
    const f = fixture('summary_with_descriptions');
    f.categories[0].lines.push({
      ...f.categories[0].lines[0],
      name: 'Row-described only',
      description: null,
      describedRows: [{ name: 'Trim carpenter', description: 'Casing at every door' }],
    });
    for (const d of [f, trimProposalForClient(f)]) {
      const page = html(d);
      expect(page).toContain('Row-described only');
      expect(page).toContain('Casing at every door');
    }
  });
});
