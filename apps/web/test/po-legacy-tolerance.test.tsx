import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// ============================================================================
// PO module §9 — the owed R-L1 tolerance test.
// ============================================================================
//
// R-L1: old POs are not updated. A legacy PO's lines carry NO unit_cost, its
// typed total_amount does not foot against them, and the ruling is that this
// renders as stated fact — em-dashes and the typed headline — never zeros,
// never an error, never a footing row that would "prove" a wrong total.
//
// Markup-level, per the s158/s123 split: what the component EMITS for a
// costless line is decidable here; the lifecycle behaviour behind it is
// po18-committed.live.ts.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));
vi.mock('@/lib/services/po-lines-client', () => ({
  issuePoLines: vi.fn(),
  markPoLinesPurchased: vi.fn(),
  flagPoItemMissing: vi.fn(),
  assignMemberToPoItem: vi.fn(),
  unassignPoItemAssignment: vi.fn(),
}));

import { PoLinesPanel, type PanelLine } from '@/app/dashboard/field-ops/[projectId]/deliveries/[poId]/po-lines-panel';

function legacyLine(id: string, description: string): PanelLine {
  return {
    id,
    description,
    qty: 40,
    unit: 'ea',
    unitCost: null, // the legacy shape: no money on the line
    lineStatus: 'issued',
    flagNote: null,
    costCode: null,
    assignments: [],
  };
}

function render(lines: PanelLine[]): string {
  return renderToStaticMarkup(
    <PoLinesPanel
      poId="00000000-0000-0000-0000-000000000000"
      poStatus="issued"
      lines={lines}
      staff={[]}
      budgetedByCode={{}}
      canIssue={false}
      canReview={false}
      canAssign={false}
      vendorEmailState="no-vendor"
    />
  );
}

describe('R-L1 — a legacy PO (typed total, costless lines) renders tolerance, not zeros', () => {
  it('costless lines render em-dashes and NO footing row', () => {
    const html = render([legacyLine('a', 'SPF studs'), legacyLine('b', 'OSB sheathing')]);
    expect(html).toContain('—');
    expect(html).not.toContain('PO total (foots against the lines above)');
    expect(html).not.toContain('$0.00');
    // The lines themselves still render — tolerance, not omission.
    expect(html).toContain('SPF studs');
    expect(html).toContain('OSB sheathing');
  });

  it('NON-VACUITY: a costed line brings the footing row back', () => {
    // Proves the absence above is the R-L1 branch, not a broken render.
    const html = render([{ ...legacyLine('a', 'SPF studs'), unitCost: 4.25 }]);
    expect(html).toContain('PO total (foots against the lines above)');
    expect(html).toContain('$170.00'); // 40 × $4.25 — the derived, footed figure
  });
});
