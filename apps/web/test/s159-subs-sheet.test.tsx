import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ============================================================================
// S159 — Subs & Vendors matches Contacts. RULED [Josh]: "subs should match
// contacts with a panel."
// ============================================================================
//
// The sibling of `s158-ui-fixes.test.tsx`, and it carries one kind of assertion
// that file did not need: **an anti-drop guard.** The ruling said not to
// silently drop anything the S140 detail page shows, and the interesting way to
// fail that is not to delete a field on purpose — it is for the page to gain
// one later that the sheet never hears about. So the page's field labels are
// READ OUT OF ITS SOURCE and each is required to appear in the rendered sheet.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
  usePathname: () => '/dashboard/subcontractors',
}));

import { SubcontractorsList } from '@/app/dashboard/subcontractors/subcontractors-list';
import { SubcontractorDetailSheet } from '@/app/dashboard/subcontractors/subcontractor-detail-sheet';
import type { Subcontractor } from '@/lib/services/subcontractors';

const SUB_ID = '33333333-3333-3333-3333-333333333333';

function sub(overrides: Partial<Subcontractor> = {}): Subcontractor {
  return {
    id: SUB_ID,
    company_id: '44444444-4444-4444-4444-444444444444',
    company_name: 'Ridgefield Electric',
    sub_type: 'subcontractor',
    status: 'active',
    trade_type: 'Electrical',
    contact_first_name: 'Marta',
    contact_last_name: 'Okonkwo',
    email: 'marta@example.invalid',
    phone: '203-555-0111',
    mobile: '203-555-0112',
    address_line1: '14 Mill Road',
    address_line2: 'Unit 3',
    city: 'Ridgefield',
    state: 'CT',
    zip: '06877',
    license_number: 'CT-EL-99213',
    rating: 4,
    member_id: null,
    ...overrides,
  } as unknown as Subcontractor;
}

const markup = (node: React.ReactElement): string => renderToStaticMarkup(node);

const sheet = (props: Partial<React.ComponentProps<typeof SubcontractorDetailSheet>> = {}) =>
  markup(
    <SubcontractorDetailSheet
      subcontractor={sub()}
      canEdit
      canSeeCompliance
      onClose={() => {}}
      {...props}
    />
  );

// ============================================================================
// THE LIST — three ways out became one.
// ============================================================================

describe('S159 — the subs list row is the way in', () => {
  it('the company name is no longer a link, and there is no Actions column', () => {
    // All three of S140's exits, gone together: the name link to the detail
    // page, the Edit link, the Delete button. Rendered with canEdit TRUE,
    // because that is the case that drew the last two.
    const html = markup(
      <SubcontractorsList subcontractors={[sub()]} canEdit canSeeCompliance />
    );

    expect(html).not.toContain('>Actions<');
    expect(html).not.toContain(`href="/dashboard/subcontractors/${SUB_ID}"`);
    expect(html).not.toContain(`href="/dashboard/subcontractors/${SUB_ID}/edit"`);
    expect(html).not.toContain('>Delete<');
    // The name is still THERE — it just is not a link any more.
    expect(html).toContain('Ridgefield Electric');
    expect(html).not.toContain('<a');
  });

  it('the row is a real control, keyboard included', () => {
    const html = markup(
      <SubcontractorsList subcontractors={[sub()]} canEdit canSeeCompliance />
    );
    expect(html).toContain(`data-testid="sub-row-${SUB_ID}"`);
    expect(html).toContain('role="button"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-label="Open Ridgefield Electric"');
  });

  it('the sheet is closed on first render, and the six columns survived', () => {
    const html = markup(
      <SubcontractorsList subcontractors={[sub()]} canEdit canSeeCompliance />
    );
    expect(html).not.toContain('data-testid="sub-detail-sheet"');
    for (const heading of ['>Company<', '>Contact<', '>Type<', '>Trade<', '>Rating<', '>Phone<']) {
      expect(html, `the ${heading} column is gone`).toContain(heading);
    }
  });
});

// ============================================================================
// THE SHEET — and the anti-drop guard.
// ============================================================================

const page = readFileSync(
  fileURLToPath(new URL('../app/dashboard/subcontractors/[id]/page.tsx', import.meta.url)),
  'utf8'
);

/** Every `<Field label="…">` the S140 detail page renders, in source order. */
function pageFieldLabels(): string[] {
  return Array.from(page.matchAll(/<Field\s+label="([^"]+)"/g)).map((m) => m[1]);
}

describe('S159 — the sheet drops nothing the detail page shows', () => {
  it('the page still HAS a contact card and a compliance section — nothing moved out of it', () => {
    // The ruling's other half. The sheet linking out is only honest while the
    // page still holds what it links to.
    expect(pageFieldLabels().length, 'the detail page renders no fields at all').toBeGreaterThan(0);
    expect(page, 'ComplianceSection is no longer mounted on the detail page').toContain(
      '<ComplianceSection'
    );
  });

  it('EVERY field label on the detail page also renders in the sheet', () => {
    // ⚠️ THE GUARD THAT MATTERS. Read out of the page's source rather than
    // hardcoded, so a field ADDED to the page later and not mirrored here goes
    // red — which is the realistic way this diverges, not a deliberate delete.
    const html = sheet();
    for (const label of pageFieldLabels()) {
      expect(html, `"${label}" is on the detail page and not in the sheet`).toContain(
        `>${label}<`
      );
    }
  });

  it('and adds Rating, which the page never carried', () => {
    expect(sheet()).toContain('>Rating<');
  });

  it('renders the address as the page joins it — one shape, not two', () => {
    // The page joins line1 / line2 / "city, state" / zip with newlines. A sheet
    // that formatted it differently would be a second implementation of the
    // same fact, which is what #129 is about.
    expect(sheet()).toContain('14 Mill Road\nUnit 3\nRidgefield, CT\n06877');
  });
});

describe('S159 — the sheet carries the actions, gated as the policies are', () => {
  it('Edit and Delete for a role that may write', () => {
    const html = sheet();
    expect(html).toContain('data-testid="sub-detail-sheet"');
    expect(html).toContain(`href="/dashboard/subcontractors/${SUB_ID}/edit"`);
    expect(html).toContain('data-testid="sub-detail-delete"');
  });

  it('NEITHER for a role that may not — `subcontractors_update_authorized`', () => {
    const html = sheet({ canEdit: false });
    expect(html).toContain('data-testid="sub-detail-sheet"');
    expect(html).not.toContain('data-testid="sub-detail-edit"');
    expect(html).not.toContain('data-testid="sub-detail-delete"');
  });

  it('the compliance LINK is Owner/Admin only, and it is a link and not the section', () => {
    // Compliance is Owner/Admin at the DATABASE (20260921000000). A PM gets no
    // link because the page has nothing extra for them — sending them there
    // would land them on a copy of the panel they are already reading, which is
    // the dead end S158's Finding 1 was about.
    expect(sheet({ canSeeCompliance: true })).toContain(
      'data-testid="sub-detail-compliance-link"'
    );
    expect(sheet({ canSeeCompliance: false })).not.toContain(
      'data-testid="sub-detail-compliance-link"'
    );

    // And it is a LINK. If a future edit mounts the section here instead, this
    // reddens — the component is a client surface over a SERVER read, and a
    // second client-side read of compliance documents is the #129 shape.
    const html = sheet({ canSeeCompliance: true });
    expect(html).toContain(`href="/dashboard/subcontractors/${SUB_ID}"`);
    expect(html).not.toMatch(/Certificate of Insurance|Expiring soon|Add document/);
  });
});

// ============================================================================
// PARITY — the two lists are now one interaction, not two.
// ============================================================================

describe('S159 — Subs & Vendors and Contacts behave the same way', () => {
  const contactsList = readFileSync(
    fileURLToPath(new URL('../app/dashboard/contacts/contacts-list.tsx', import.meta.url)),
    'utf8'
  );
  const subsList = readFileSync(
    fileURLToPath(new URL('../app/dashboard/subcontractors/subcontractors-list.tsx', import.meta.url)),
    'utf8'
  );

  it('neither list imports a delete — both have exactly one home for it', () => {
    // ⚠️ MATCHED ON THE IMPORT, NOT THE IDENTIFIER. Both files NAME the removed
    // function in the comment that explains why it went ("`deleteContact` is no
    // longer imported here, deliberately"), so a bare `toContain` reads the
    // prose and fails on a file that is correct. Third time a source-level test
    // in this repo has matched its own explanation — see s158's `mt-auto`.
    expect(contactsList).not.toMatch(/^\s*import\s[^;]*deleteContact/m);
    expect(subsList).not.toMatch(/^\s*import\s[^;]*deleteSubcontractor/m);
    // Not vacuous: the sheets DO import them, which is where the delete lives.
    const contactSheet = readFileSync(
      fileURLToPath(new URL('../app/dashboard/contacts/contact-detail-sheet.tsx', import.meta.url)),
      'utf8'
    );
    const subSheet = readFileSync(
      fileURLToPath(
        new URL('../app/dashboard/subcontractors/subcontractor-detail-sheet.tsx', import.meta.url)
      ),
      'utf8'
    );
    expect(contactSheet).toMatch(/^\s*import\s[^;]*deleteContact/m);
    expect(subSheet).toMatch(/^\s*import\s[^;]*deleteSubcontractor/m);
  });

  it('both open on row click and on Enter/Space, and neither keeps an Actions cell', () => {
    // The ruling in one assertion: two interaction models under one nav group
    // was the defect. Source-level because the handlers are the thing being
    // compared and they do not render.
    for (const [name, src] of [
      ['contacts', contactsList],
      ['subs', subsList],
    ] as const) {
      expect(src, `${name}: the row does not open anything`).toContain('onClick={() => setOpenId(');
      expect(src, `${name}: the row is not keyboard-operable`).toMatch(
        /e\.key === 'Enter' \|\| e\.key === ' '/
      );
      expect(src, `${name}: an Actions column is back`).not.toContain('>Actions<');
    }
  });
});
