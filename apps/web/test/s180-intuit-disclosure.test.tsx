import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@react-email/render';
import { describe, expect, it } from 'vitest';
import { InvoiceEmail } from '@/lib/email/templates/invoice-email';

/**
 * 7G §5.5 — THE INTUIT DISCLOSURE IS A COMMITMENT, AND THIS IS ITS GUARD.
 *
 * ⚠️ RULED [Josh, S103 Q8]: Josh answered **YES** to Intuit on BOTH marketing
 * and product disclosure, and **Intuit reviews an app against what was
 * declared.** The exact string is therefore not copy — it is a declared value,
 * and these tests fail if it is reworded or removed.
 *
 * Three placements are required. Two ship today and are asserted here; the
 * third (the client-portal pay surface) is Module 9 and is carried as a FORWARD
 * OBLIGATION in `GATED.md` → Gate 6.
 */

const DISCLOSURE = 'Payment service provided by Intuit Payments Inc.';
const WEB_ROOT = join(__dirname, '..');

const EMAIL_PROPS = {
  companyName: 'Sabal Point Construction',
  logoUrl: 'https://cdn.example.com/tenant-logo.png',
  brandColor: '#2f49d1',
  bodyText: 'Invoice attached.',
  invoiceNumber: 'INV-1042',
  amountDue: '$4,200.00',
};

/** React SSR interleaves empty HTML comments between adjacent JSX children;
 *  strip them before matching, exactly as brand-email-footer.test.tsx does. */
function plain(html: string): string {
  return html.replace(/<!--\s*-->/g, '');
}

describe('7G §5.5 — placement 2: the invoice pay-link surface', () => {
  it('carries the disclosure WITH the pay button when a link exists', async () => {
    const html = plain(
      await render(<InvoiceEmail {...EMAIL_PROPS} payLink="https://connect.intuit.com/pay/abc123" />)
    );
    expect(html).toContain('https://connect.intuit.com/pay/abc123');
    expect(html).toContain('Pay $4,200.00 online');
    expect(html).toContain(DISCLOSURE);
  });

  it('omits BOTH the button and the disclosure when there is no link', async () => {
    // The disclosure belongs to the pay affordance. With no affordance there is
    // nothing to disclose, and printing it anyway would claim a payment service
    // the client cannot reach.
    const html = plain(await render(<InvoiceEmail {...EMAIL_PROPS} payLink={null} />));
    expect(html).not.toContain(DISCLOSURE);
    expect(html).not.toContain('Pay $4,200.00 online');
  });

  it('adds NO "you cannot pay here" copy when the link is absent (7g1 #3)', async () => {
    // A viewable bill, not an explanation. This is a ruled absence, so it is
    // asserted rather than left to whoever edits the template next.
    const html = plain(await render(<InvoiceEmail {...EMAIL_PROPS} payLink={null} />));
    expect(html.toLowerCase()).not.toContain('cannot pay');
    expect(html.toLowerCase()).not.toContain('unable to pay');
    expect(html.toLowerCase()).not.toContain('no online payment');
  });

  it('still renders the invoice normally without a link — absence is not an error', async () => {
    const html = plain(await render(<InvoiceEmail {...EMAIL_PROPS} payLink={null} />));
    expect(html).toContain('INV-1042');
    expect(html).toContain('$4,200.00');
  });

  it('defaults to no link when the prop is omitted entirely', async () => {
    const html = plain(await render(<InvoiceEmail {...EMAIL_PROPS} />));
    expect(html).not.toContain(DISCLOSURE);
  });
});

describe('7G §5.5 — placement 1: the marketing pages', () => {
  // Source-read rather than a render: the footer is a server component shared
  // by /, /pricing, /terms and /privacy, and what matters is that ONE shared
  // file carries the line so every public page inherits it.
  const footer = readFileSync(join(WEB_ROOT, 'components/public/site-footer.tsx'), 'utf8');

  it('the SHARED public footer carries the disclosure verbatim', () => {
    expect(footer).toContain(DISCLOSURE);
  });

  it('every public page renders that shared footer', () => {
    for (const page of ['app/page.tsx', 'app/pricing/page.tsx', 'app/terms/page.tsx', 'app/privacy/page.tsx']) {
      const source = readFileSync(join(WEB_ROOT, page), 'utf8');
      expect(source, `${page} must render <SiteFooter />`).toContain('SiteFooter');
    }
  });
});

describe('7G §5.5 — placement 3 is owed, and the record must survive', () => {
  it('GATED.md still carries the client-portal disclosure obligation', () => {
    // 7g2 §5.5: Josh committed to it on the Intuit questionnaire, so it "must
    // not be lost". If someone tidies Gate 6 away before the portal pay surface
    // ships, this fails and says why.
    const gated = readFileSync(join(WEB_ROOT, '../../GATED.md'), 'utf8');
    expect(gated).toContain(DISCLOSURE);
    expect(gated).toContain('CLIENT-PORTAL');
  });
});
