import { describe, expect, it } from 'vitest';
import { render } from '@react-email/render';
import { brand } from '@/lib/brand';
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
});
