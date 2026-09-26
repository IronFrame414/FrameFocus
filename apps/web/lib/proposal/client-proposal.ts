import {
  proposalRenderPlan,
  resolveProposalFormat,
} from '@framefocus/shared/utils/proposal-format';
import type { ProposalData, ProposalLine, ProposalRow } from './proposal-data';

// [S112, RULED Josh] THE PROPOSAL A CLIENT RECEIVES IS WHAT THE FORMAT SHOWS.
//
// "PROPOSAL PAYLOAD — yes, trim on the server to exactly what the chosen format
// shows. This is #136 and it breaks the S164 ruling that a lump-sum client gets
// no line-level price. Not optional."
//
// _Superseded, quoted from proposal-data.ts:_ "the data layer always supplies
// the full category → line → row tree and lets the renderer hide." The renderer
// hid it; the signing page's props and GET /api/sign/[token] still carried every
// category subtotal, line total and row total — on lump sum and total-only too.
// A client who opened the page source or the JSON saw the breakdown the format
// withholds.
//
// This runs at the two CLIENT boundaries only (the /sign page props and the
// /api/sign JSON). The staff preview and the PDF renderer keep the full tree:
// the PDF is bytes the renderer draws, not data the client can read past.
//
// The rules come from the SAME render plan both renderers switch on
// (proposalRenderPlan) plus the legacy five's own renderer branches, so what is
// kept is exactly what is drawn. test/s112-client-proposal.test.tsx renders the
// signing page from the full and the trimmed data for every format and
// requires identical markup — the proof that nothing drawn was removed.
//
// Text is kept only where it is drawn too (line descriptions only when the
// format prints them). estimate.taxTotal is drawn by neither renderer.

export interface ClientProposalRow {
  name: string;
  total: number | null;
  rowType: string;
  /** Always null in trimmed output; typed wider so the renderer can take either shape. */
  cost: number | null;
  rate: number | null;
  hours: number | null;
}

export interface ClientProposalLine {
  name: string;
  description: string | null;
  total: number | null;
  originalTotal: number | null;
  discountLabel: string | null;
  cost: number | null;
  markupPercent: number | null;
  rows: ClientProposalRow[];
}

export interface ClientProposalCategory {
  name: string;
  subtotal: number | null;
  lines: ClientProposalLine[];
}

export type ClientProposalData = Omit<ProposalData, 'estimate' | 'categories'> & {
  estimate: Omit<ProposalData['estimate'], 'taxTotal'> & { taxTotal: null };
  categories: ClientProposalCategory[];
};

type Shape = {
  categories: 'none' | 'names' | 'full';
  /** Category subtotals drawn (every canonical category/itemized/cost-plus header;
   *  the legacy *_with_price levels). */
  subtotals: boolean;
  linePrices: boolean;
  descriptions: boolean;
  rows: 'none' | 'names' | 'names_prices' | 'time_and_materials';
  openBook: boolean;
};

function shapeFor(stored: string): Shape {
  const info = resolveProposalFormat(stored);
  if (info.legacy) {
    switch (stored) {
      case 'lump_sum':
        return {
          categories: 'none',
          subtotals: false,
          linePrices: false,
          descriptions: false,
          rows: 'none',
          openBook: false,
        };
      case 'category_with_price':
        return {
          categories: 'names',
          subtotals: true,
          linePrices: false,
          descriptions: false,
          rows: 'none',
          openBook: false,
        };
      case 'category_no_price':
        return {
          categories: 'names',
          subtotals: false,
          linePrices: false,
          descriptions: false,
          rows: 'none',
          openBook: false,
        };
      case 'detail_with_price_qty':
        return {
          categories: 'full',
          subtotals: true,
          linePrices: true,
          descriptions: true,
          rows: 'names_prices',
          openBook: false,
        };
      case 'detail_no_price':
        return {
          categories: 'full',
          subtotals: false,
          linePrices: false,
          descriptions: true,
          rows: 'names',
          openBook: false,
        };
    }
  }
  const plan = proposalRenderPlan(info.code);
  switch (plan.layout) {
    case 'total':
      return {
        categories: 'none',
        subtotals: false,
        linePrices: false,
        descriptions: false,
        rows: 'none',
        openBook: false,
      };
    case 'category':
      return {
        categories: 'names',
        subtotals: true,
        linePrices: false,
        descriptions: false,
        rows: 'none',
        openBook: false,
      };
    case 'itemized':
      return {
        categories: 'full',
        subtotals: true,
        linePrices: plan.linePrices,
        descriptions: plan.descriptions,
        rows: 'none',
        openBook: false,
      };
    case 'cost_plus':
      return {
        categories: 'full',
        subtotals: true,
        linePrices: true,
        descriptions: plan.descriptions,
        rows: 'none',
        openBook: true,
      };
    case 'time_and_materials':
      return {
        categories: 'full',
        subtotals: false,
        linePrices: false,
        descriptions: false,
        rows: 'time_and_materials',
        openBook: true,
      };
  }
}

function trimRow(r: ProposalRow, s: Shape): ClientProposalRow {
  const tm = s.rows === 'time_and_materials';
  return {
    name: r.name,
    rowType: tm ? r.rowType : '',
    total: s.rows === 'names_prices' || tm ? r.total : null,
    cost: null,
    rate: tm && r.rowType === 'labor' ? r.rate : null,
    hours: tm && r.rowType === 'labor' ? r.hours : null,
  };
}

function trimLine(l: ProposalLine, s: Shape): ClientProposalLine {
  const tm = s.rows === 'time_and_materials';
  return {
    name: tm ? '' : l.name,
    description: s.descriptions ? l.description : null,
    total: s.linePrices ? l.total : null,
    originalTotal: s.linePrices && !s.openBook ? l.originalTotal : null,
    discountLabel: s.linePrices && !s.openBook ? l.discountLabel : null,
    cost: s.openBook && !tm ? l.cost : null,
    markupPercent: s.openBook && !tm ? l.markupPercent : null,
    rows: s.rows === 'none' ? [] : l.rows.map((r) => trimRow(r, s)),
  };
}

/** The proposal as a CLIENT may receive it: exactly what its format draws. */
export function trimProposalForClient(data: ProposalData): ClientProposalData {
  const s = shapeFor(data.estimate.pricingLevel);
  const tm = s.rows === 'time_and_materials';
  const categories: ClientProposalCategory[] =
    s.categories === 'none'
      ? []
      : data.categories.map((c) => ({
          name: tm ? '' : c.name,
          subtotal: s.subtotals ? c.subtotal : null,
          lines: s.categories === 'full' ? c.lines.map((l) => trimLine(l, s)) : [],
        }));
  return {
    ...data,
    estimate: { ...data.estimate, taxTotal: null },
    categories,
  };
}
