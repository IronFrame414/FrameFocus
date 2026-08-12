import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@react-email/render';
import { brand } from '@/lib/brand';
import { InviteEmail } from '@/lib/email/templates/invite-email';
import { buildInviteSubject } from '@/lib/services/invite-email';
import { ProposalEmail } from '@/lib/email/templates/proposal-email';
import { InvoiceEmail } from '@/lib/email/templates/invoice-email';
import { ChangeOrderEmail } from '@/lib/email/templates/change-order-email';
import { ReminderEmail } from '@/lib/email/templates/reminder-email';
import { NotificationEmail } from '@/lib/email/templates/notification-email';

// Renders the five transactional emails through @react-email/render — the SAME
// function email-service.ts's Resend call uses to turn the component into the
// transmitted message. Not react-dom/server: that skips the email-specific
// pipeline (style inlining, <Preview> handling, doctype), so it would prove
// less than it appears to.
//
// TWO ASSERTIONS PER TEMPLATE, and the second is the point:
//   - the product name reaches the footer, and no "FrameFocus" survives
//   - the four CLIENT-FACING templates stay WHITE-LABEL: the tenant's logoUrl
//     is what appears in the header, the product name appears ONLY in the
//     footer attribution. If someone ever swaps the header <Img> for a product
//     logo, these fail.
//
// notification-email is INTERNAL (manager heads-up) — no logo, no companyName
// prop at all, and a differently shaped string ("<product> notification").

const LOGO = 'https://cdn.example.com/tenant-logo.png';
const COMPANY = 'Bishop Contracting';

/**
 * React SSR emits an EMPTY HTML COMMENT between adjacent JSX children, so
 * `Sent by {companyName} via {brand.name}` serialises as
 *   Sent by <!-- -->Bishop Contracting<!-- --> via <!-- -->EZ Contractor Binder
 * The comment is invisible to every mail client and the plain-text alternative
 * has none of it — but a naive toContain() on the raw HTML fails and looks like
 * the rebrand didn't apply. Strip only the empty separators; real comments
 * (the MSO conditionals that make Outlook buttons work) are left alone.
 */
const readable = (html: string) => html.replace(/<!-- -->/g, '');

const CLIENT_FACING = [
  [
    'proposal',
    () => (
      <ProposalEmail
        companyName={COMPANY}
        logoUrl={LOGO}
        brandColor="#2f49d1"
        bodyText="Your proposal is ready."
        signingUrl="https://example.com/sign/tok"
      />
    ),
  ],
  [
    'invoice',
    () => (
      <InvoiceEmail
        companyName={COMPANY}
        logoUrl={LOGO}
        brandColor="#2f49d1"
        bodyText="Invoice attached."
        invoiceNumber="INV-1042"
        amountDue="$4,200.00"
      />
    ),
  ],
  [
    'change order',
    () => (
      <ChangeOrderEmail
        companyName={COMPANY}
        logoUrl={LOGO}
        brandColor="#2f49d1"
        bodyText="Change order for your review."
        signingUrl="https://example.com/sign-co/tok"
      />
    ),
  ],
  [
    'reminder',
    () => (
      <ReminderEmail
        companyName={COMPANY}
        logoUrl={LOGO}
        brandColor="#2f49d1"
        bodyText="A reminder about your proposal."
        signingUrl="https://example.com/sign/tok"
        unsubscribeUrl="https://example.com/sign/unsubscribe/tok"
      />
    ),
  ],
] as const;

// ============================================================================
// ⚠️ S136 — THE LIST BELOW IS NOW WALKED, NOT TRUSTED.
// ============================================================================
// This file used a HARDCODED list of five templates. `InviteEmail` shipped in
// S135 and was never added to it, so it was invisible here BY DESIGN — and the
// stale product name went out to real recipients. A sixth template must not be
// able to do that again.
//
// The walk does not RENDER unknown templates (each takes different props and a
// generic render would assert nothing). It asserts COVERAGE: every template
// file on disk must be named in COVERED below. A new template turns this red
// until someone decides what its brand contract is, which is the decision that
// was skipped last time.
const COVERED = new Set([
  'proposal-email.tsx',
  'invoice-email.tsx',
  'change-order-email.tsx',
  'reminder-email.tsx',
  'notification-email.tsx',
  'invite-email.tsx',
]);

describe('every email template is covered by this file', () => {
  it('⚠️ the templates directory holds nothing this file does not assert', () => {
    const dir = join(__dirname, '..', 'lib', 'email', 'templates');
    const onDisk = readdirSync(dir).filter((f) => f.endsWith('.tsx'));

    expect(onDisk.length, 'the walk found no templates — it is not walking').toBeGreaterThan(4);

    const uncovered = onDisk.filter((f) => !COVERED.has(f));
    expect(
      uncovered,
      `template(s) with no brand assertion:\n${uncovered.join('\n')}\n` +
        'Add a render block below AND add the filename to COVERED.'
    ).toEqual([]);

    // ...and the reverse, so COVERED cannot rot into naming files that are gone.
    const missing = [...COVERED].filter((f) => !onDisk.includes(f));
    expect(missing, `COVERED names deleted template(s):\n${missing.join('\n')}`).toEqual([]);
  });
});

// ============================================================================
// ⚠️ S136 — THE SUBJECT LINE. THIS IS THE HOLE THAT ACTUALLY FIRED.
// ============================================================================
// The invite TEMPLATE was always correct; the literal was in the SUBJECT, built
// in `invite-email.ts`. Subjects are not templates, so nothing above could have
// caught it — not even with InviteEmail added to the list. `buildInviteSubject`
// was extracted from the send path expressly so this assertion can exist
// without a database.
describe('email SUBJECTS name the product from the brand source', () => {
  it('⚠️ the invite subject carries the current name and no stale one', () => {
    const subject = buildInviteSubject('Worth Properties');
    expect(subject).toContain(brand.name);
    expect(subject).not.toContain('FrameFocus');
    // The exact string Josh received, asserted as an absence so a regression
    // reads as itself rather than as a generic mismatch.
    expect(subject).not.toBe('Worth Properties invited you to join them on FrameFocus');
    expect(subject).toBe(`Worth Properties invited you to join them on ${brand.name}`);
  });
});

describe('transactional emails carry the rebranded footer', () => {
  describe.each(CLIENT_FACING)('%s (client-facing)', (_label, makeElement) => {
    it('footer names the product, and no FrameFocus survives', async () => {
      const html = readable(await render(makeElement()));
      expect(html).toContain(`Sent by ${COMPANY} via ${brand.name}`);
      expect(html).not.toContain('FrameFocus');
    });

    it('stays white-label: header carries the TENANT logo, not a product mark', async () => {
      const html = await render(makeElement());
      expect(html).toContain(LOGO);
      // No product asset may appear in a client-facing email.
      expect(html).not.toContain('logo-full-');
      expect(html).not.toContain('/logo-');
    });

    it('plain-text alternative carries it too', async () => {
      const text = await render(makeElement(), { plainText: true });
      expect(text).toContain(brand.name);
      expect(text).not.toContain('FrameFocus');
    });
  });

  describe('notification (internal)', () => {
    const make = () => (
      <NotificationEmail
        brandColor="#2f49d1"
        heading="Proposal signed"
        message="Maple St Remodel was signed."
        estimateUrl="https://example.com/dashboard/estimates/1"
      />
    );

    it('uses the product name in its own string shape', async () => {
      const html = readable(await render(make()));
      expect(html).toContain(`${brand.name} notification`);
      expect(html).not.toContain('FrameFocus');
    });

    it('carries no tenant logo — it is internal mail', async () => {
      const html = await render(make());
      expect(html).not.toContain(LOGO);
    });
  });

  // S135's template, added here in S136 — the one whose absence let the stale
  // name ship. Not client-facing white-label: an invitation names the product
  // deliberately, because the recipient may never have heard of it.
  describe('invite (recipient is not yet a user)', () => {
    const make = () => (
      <InviteEmail
        brandColor="#2f49d1"
        companyName={COMPANY}
        roleLabel="Project Manager"
        inviterName="Josh Bishop"
        acceptUrl="https://example.com/invite/accept?token=tok"
        expiresOn="August 19, 2026"
      />
    );

    it('names the current product and no stale one', async () => {
      const html = readable(await render(make()));
      expect(html).toContain(brand.name);
      expect(html).not.toContain('FrameFocus');
    });

    it('plain-text alternative carries it too', async () => {
      const text = await render(make(), { plainText: true });
      expect(text).toContain(brand.name);
      expect(text).not.toContain('FrameFocus');
    });

    it('carries no tenant logo — the tenant is named, not branded', async () => {
      const html = await render(make());
      expect(html).not.toContain(LOGO);
    });
  });
});
