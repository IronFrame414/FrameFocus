import type { ProposalData, ProposalPricingLevel } from '@/lib/proposal/proposal-data';

// S128 Part A — the proposal fixture shared by the line-description gate tests.
// Not a test file (no .test.): the runner's glob does not pick it up.

export const SENTINEL = 'S128-ROW-DESCRIPTION-SENTINEL';

export function fixture(pricingLevel: ProposalPricingLevel): ProposalData {
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
