import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ============================================================================
// S158 — the three UI findings from the S157 click-test.
// ============================================================================
//
// Finding 1  the contacts list is a dead end   → the row opens a SHEET
// Finding 2  soft delete has no way back       → a Trash view with restore
// Finding 3  the sidebar scrolls away          → the nav is pinned
//
// SPLIT BY WHAT CAN ACTUALLY BE DECIDED WITHOUT A BROWSER, which is the same
// split `s123-notification-ui.test.tsx` and `s130-ffnav.test.ts` already use:
//
//   · Findings 1 and 2's MARKUP — rendered to static markup, because the
//     question is what the component emits and that is decidable here.
//   · Finding 2's BEHAVIOUR — delete, appear in trash, restore, back in the
//     list — is `s158-trash-restore.live.ts`, against the real database. No
//     amount of markup proves a restore happened.
//   · Finding 3 — SOURCE-LEVEL. What is being asserted is a set of layout
//     classes on the shell, and `renderToStaticMarkup` of `DashboardShell`
//     would drag in the browser Supabase client, the chat panel and the clock
//     button to assert three strings. `s130-ffnav.test.ts` reads this same file
//     the same way and for the same reason.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
  usePathname: () => '/dashboard/contacts',
}));

// Mocked because the sheet fetches the primary address on open. Effects do not
// run under renderToStaticMarkup, so this is belt-and-braces: it keeps a real
// browser Supabase client out of the module graph either way.
vi.mock('@/lib/services/contact-addresses-client', () => ({
  listAddressesForContact: async () => ({ addresses: [], error: null }),
}));

import { ContactsList } from '@/app/dashboard/contacts/contacts-list';
import { ContactDetailSheet } from '@/app/dashboard/contacts/contact-detail-sheet';
import type { Contact } from '@/lib/services/contacts';

/** A contact row with every column the components read. */
function contact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    company_id: '22222222-2222-2222-2222-222222222222',
    contact_type: 'client',
    status: 'active',
    first_name: 'Dana',
    last_name: 'Reyes',
    company_name: 'Reyes Renovations',
    email: 'dana@example.invalid',
    phone: '203-555-0101',
    mobile: '203-555-0102',
    notes: 'SENSITIVE-NOTE-MARKER',
    ...overrides,
  } as unknown as Contact;
}

function markup(node: React.ReactElement): string {
  return renderToStaticMarkup(node);
}

// ============================================================================
// FINDING 1 — the list row is the way in, and the actions left with it.
// ============================================================================

describe('S158-F1 — the contacts list no longer carries row actions', () => {
  it('renders NO Actions column and no per-row Edit or Delete', () => {
    // The defect in one assertion: `Edit` and `Delete` were the only things a
    // row offered, so looking at a contact meant opening the form that changes
    // them, and deleting one — a record carrying FKs from estimates, projects,
    // invoices, payments, refunds and contracts — was one click behind a
    // `confirm()`.
    //
    // Rendered with canEdit TRUE, because that is the case that used to draw
    // them. With canEdit false they were absent before this change too, and
    // asserting on that would pass over the old build as well.
    const html = markup(<ContactsList contacts={[contact()]} canEdit />);

    expect(html).not.toContain('>Actions<');
    expect(html).not.toContain('/dashboard/contacts/11111111-1111-1111-1111-111111111111/edit');
    expect(html).not.toContain('>Delete<');
  });

  it('every row is a real control — clickable AND reachable from the keyboard', () => {
    // A bare `onClick` on a `<tr>` renders identically to an inert row, so the
    // click handler itself is not assertable here. `role` and `tabindex` are —
    // and they are what make the row a control rather than a mouse-only
    // affordance. Their absence is the failure mode this catches.
    const html = markup(<ContactsList contacts={[contact()]} canEdit />);

    expect(html).toContain('data-testid="contact-row-11111111-1111-1111-1111-111111111111"');
    expect(html).toContain('role="button"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-label="Open Dana Reyes"');
  });

  it('the sheet is CLOSED on first render — the list is still a list', () => {
    const html = markup(<ContactsList contacts={[contact()]} canEdit />);
    expect(html).not.toContain('data-testid="contact-detail-sheet"');
  });

  it('the six data columns survived the change', () => {
    // The move removed a column. This is the guard that it removed only one:
    // a "tidy the table" edit that also drops Status or Phone would otherwise
    // pass every assertion above.
    const html = markup(<ContactsList contacts={[contact()]} canEdit />);
    for (const heading of ['>Name<', '>Company<', '>Type<', '>Status<', '>Email<', '>Phone<']) {
      expect(html, `the ${heading} column is gone`).toContain(heading);
    }
  });
});

describe('S158-F1 — the sheet is where Edit and Delete went', () => {
  it('carries both actions for a role that may write', () => {
    const html = markup(
      <ContactDetailSheet contact={contact()} canEdit onClose={() => {}} />
    );

    expect(html).toContain('data-testid="contact-detail-sheet"');
    // EDIT NAVIGATES to the form that already exists rather than
    // re-implementing it. A second editor inside the sheet would be #129's
    // defect exactly — one feature, two implementations, free to drift.
    expect(html).toContain(
      'href="/dashboard/contacts/11111111-1111-1111-1111-111111111111/edit"'
    );
    expect(html).toContain('data-testid="contact-detail-delete"');
  });

  it('offers NEITHER action to a role that may not — the affordance follows the policy', () => {
    // `contacts_update_authorized` admits owner/admin/project_manager only.
    // Foreman and crew can read the list, so the sheet still opens; what it
    // must not do is offer them a write the database will discard.
    const html = markup(
      <ContactDetailSheet contact={contact()} canEdit={false} onClose={() => {}} />
    );

    expect(html).toContain('data-testid="contact-detail-sheet"');
    expect(html).not.toContain('data-testid="contact-detail-edit"');
    expect(html).not.toContain('data-testid="contact-detail-delete"');
  });

  it('PARITY with /m/contacts/[contactId] — the same five fields, and the same cut', () => {
    // CLAUDE.md's parity ruling. M-36 renders Company, Phone, Mobile, Email and
    // Address, and CUTS notes and tags on the stated grounds that a detail
    // screen is where a build fills empty space and notes on a client contact
    // can be commercially sensitive. The desktop sheet receives `notes` in its
    // props — the list's `select('*')` carries it — so the cut has to be made
    // here too or the same feature shows different things on the two surfaces.
    const html = markup(
      <ContactDetailSheet contact={contact()} canEdit onClose={() => {}} />
    );

    for (const label of ['Company', 'Phone', 'Mobile', 'Email', 'Address']) {
      expect(html, `${label} is missing from the sheet`).toContain(`>${label}<`);
    }
    expect(html, 'notes leaked onto the desktop detail sheet').not.toContain(
      'SENSITIVE-NOTE-MARKER'
    );
  });

  it('suppresses Company when it is already the heading', () => {
    // M-36's rule, carried over: a company-only contact would otherwise say the
    // same thing twice, once as the title and once as the first row.
    const html = markup(
      <ContactDetailSheet
        contact={contact({ first_name: '', last_name: '', company_name: 'Reyes Renovations' })}
        canEdit
        onClose={() => {}}
      />
    );

    // The heading has it once — and the dialog's own aria-label repeats it, so
    // that attribute is stripped before counting rather than the count being
    // loosened to "at most two", which would pass over an un-suppressed row.
    const body = html.replace(/aria-label="[^"]*"/g, '');
    expect(body.match(/Reyes Renovations/g) ?? []).toHaveLength(1);
  });
});

// ============================================================================
// FINDING 3 — the sidebar is pinned. Source-level; see the header.
// ============================================================================

const shell = readFileSync(
  fileURLToPath(new URL('../app/dashboard/dashboard-shell.tsx', import.meta.url)),
  'utf8'
);

/** The `<aside …>` opening tag's className, whatever it currently is. */
function asideClasses(): string {
  const m = /<aside className="([^"]+)"/.exec(shell);
  if (!m) throw new Error('the sidebar <aside> was not found in dashboard-shell.tsx');
  return m[1];
}

/** The `<nav …>` opening tag's className. */
function navClasses(): string {
  const m = /<nav className="([^"]+)"/.exec(shell);
  if (!m) throw new Error('the sidebar <nav> was not found in dashboard-shell.tsx');
  return m[1];
}

describe('S158-F3 — the sidebar stays put on a long page', () => {
  it('the aside is pinned and capped at one viewport', () => {
    // THE DEFECT. The aside was a plain flex item with no height of its own, so
    // it stretched to the height of the DOCUMENT — and the footer's `mt-auto`
    // put the user block and Sign out at the bottom of the document rather than
    // the bottom of the screen. On Settings, which is long, they were gone.
    const classes = asideClasses();
    expect(classes, 'the aside is not sticky — it will scroll with the page').toContain('sticky');
    expect(classes).toContain('top-0');
    // `h-screen` is not decoration here: an explicit cross-size is what STOPS
    // the stretch, and a stretched box has nowhere to stick to.
    expect(classes, 'without an explicit height the aside stretches and sticky does nothing')
      .toContain('h-screen');
    expect(classes).toContain('self-start');
  });

  it('the nav scrolls INSIDE the pinned aside, so a short viewport still reaches every item', () => {
    // The opposite failure, and the reason "check every route, not just
    // Settings" was part of the ruling. An Owner has 14 items plus the lockup
    // and the footer; capping the aside at 100vh without an inner scroller puts
    // the tail of that list out of reach on a laptop window.
    const classes = navClasses();
    expect(classes).toContain('overflow-y-auto');
    // `min-h-0` is the load-bearing half: a flex item's default
    // `min-height: auto` refuses to shrink below its content, so the overflow
    // rule never engages and the footer is pushed out of the aside instead.
    expect(classes, 'without min-h-0 the overflow rule never engages').toContain('min-h-0');
  });

  it('the footer is still the last thing in the aside, below the nav', () => {
    // The user block and Sign out are what Josh could not reach. Pinning the
    // aside is only a fix if they are still inside it and still pushed to its
    // bottom — a refactor that moved them above the nav would pass both
    // assertions above and lose the point.
    //
    // Anchored on the footer's actual opening tag, not on the string `mt-auto`:
    // the class is NAMED in the comment above the aside, and matching the prose
    // instead of the markup put the "footer" hundreds of characters before the
    // nav. A source-level test reads comments as readily as code.
    const navAt = shell.indexOf('<nav className=');
    const footerAt = shell.indexOf('className="mx-[14px] mt-auto');
    // Same trap, second time: the words "Sign out" appear in that comment too.
    // Anchored on the handler binding, which only the button carries.
    const signOutAt = shell.indexOf('onClick={handleSignOut}');
    expect(footerAt, 'the mt-auto footer block is gone').toBeGreaterThan(navAt);
    expect(signOutAt).toBeGreaterThan(footerAt);
  });
});
