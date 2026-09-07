import { readdirSync, readFileSync } from 'node:fs';
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
    for (const page of [
      'app/page.tsx',
      'app/pricing/page.tsx',
      'app/terms/page.tsx',
      'app/privacy/page.tsx',
      'app/contact/page.tsx',
    ]) {
      const source = readFileSync(join(WEB_ROOT, page), 'utf8');
      expect(source, `${page} must render <SiteFooter />`).toContain('SiteFooter');
    }
  });

  // ⚠️ THE LIST ABOVE IS A LIST, AND A LIST GOES STALE THE DAY SOMEONE ADDS A
  // PAGE. This sweep is the part that cannot be outrun: it finds every marketing
  // page by STRUCTURE — anything rendering the public <SiteHeader /> is a public
  // page — and requires the footer that carries the disclosure. A new marketing
  // page therefore inherits the commitment or fails here, without anyone
  // remembering to update this file.
  it('ANY page rendering the public header also renders the footer', () => {
    const appRoot = join(WEB_ROOT, 'app');
    const pages = (readdirSync(appRoot, { recursive: true, encoding: 'utf8' }) as string[]).filter(
      (p) => p.endsWith('page.tsx')
    );

    // The sweep is worthless if the glob silently matches nothing.
    expect(pages.length, 'expected to find page.tsx files under app/').toBeGreaterThan(4);

    const publicPages = pages.filter((p) =>
      readFileSync(join(appRoot, p), 'utf8').includes('SiteHeader')
    );
    // A VACUITY GUARD, NOT A CENSUS. There are five public pages today, so
    // `> 4` would sit exactly on the boundary and go red if one were ever
    // legitimately retired — failing for a reason that has nothing to do with
    // the disclosure. The named list above is what pins the exact set; this
    // only has to prove the filter matched something.
    expect(publicPages.length, 'expected to find public marketing pages').toBeGreaterThan(2);

    for (const page of publicPages) {
      const source = readFileSync(join(appRoot, page), 'utf8');
      expect(
        source,
        `app/${page} renders <SiteHeader /> so it is a PUBLIC page — it must also render ` +
          `<SiteFooter />, which carries the Intuit Payments disclosure declared to Intuit.`
      ).toContain('SiteFooter');
    }
  });
});

/**
 * THE PUBLIC CONTACT PAGE — one published address, and no claim about who owns
 * the business.
 *
 * ⚠️ The business behind the product is NOT a registered entity. (The name is
 * not spelled out here either — brand-literals.test.ts guards app/, lib/ and
 * components/ rather than test/, but the reason it does applies just as well.)
 * A corporate suffix or a
 * claim of incorporation on a public page is a false statement about a real
 * business, and an Intuit reviewer reads these pages. Josh's personal email
 * also leaked onto public surfaces once and was cleaned up; this keeps it out.
 */
describe('the public contact page publishes one address and claims no legal form', () => {
  const contactSource = readFileSync(join(WEB_ROOT, 'app/contact/page.tsx'), 'utf8');
  const footerSource = readFileSync(join(WEB_ROOT, 'components/public/site-footer.tsx'), 'utf8');

  /**
   * The page's own text with SOURCE COMMENTS REMOVED.
   *
   * ⚠️ The assertions below must read what a VISITOR reads, not the file. The
   * page's header comment deliberately NAMES the things the page must never
   * say — that is precisely what makes it a useful warning to the next editor —
   * so matching against raw source would fail on its own documentation.
   */
  const contact = contactSource
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

  it('strips comments without stripping the page', () => {
    // Guards the helper itself: if the regex ever eats the body, every
    // not.toMatch below would pass vacuously.
    expect(contact).toContain('Contact');
    expect(contact).toContain('PUBLIC_CONTACT_EMAIL');
  });

  it('publishes the shared public address, and does not retype it', () => {
    // Imported from the footer rather than written again, so the site cannot
    // drift into naming two different addresses on two different pages.
    expect(contactSource).toContain("from '@/components/public/site-footer'");
    const footerAddress = /PUBLIC_CONTACT_EMAIL = '([^']+)'/.exec(footerSource)?.[1];
    expect(footerAddress).toBe('ezcontractorbinder@gmail.com');
    // The address itself is never spelled out in the page.
    expect(contact).not.toContain('@gmail.com');
  });

  it('names NO corporate form anywhere', () => {
    // Word-boundary matched: "Inc." must not catch "include".
    expect(contact).not.toMatch(/\b(LLC|L\.L\.C|Inc\.|Incorporated|Corp\.|Corporation)\b/);
  });

  it('names no owner, founder or officer, and no separate entity', () => {
    expect(contact).not.toMatch(/Josh|Bishop|founder/i);
    expect(contact).not.toMatch(/worth\s*prop/i);
  });

  it('publishes no phone number and no personal address', () => {
    expect(contact).not.toMatch(/jsbishop14|worthprop/i);
    // A US phone number in any of the usual shapes.
    expect(contact).not.toMatch(/\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/);
  });

  it('is NOT in middleware’s guarded matcher — it must load with no session', () => {
    // The whole point of the page. middleware.ts's `config.matcher` is an
    // allowlist of GUARDED paths; adding '/contact' to it would silently put
    // this page behind auth.
    const middleware = readFileSync(join(WEB_ROOT, 'middleware.ts'), 'utf8');
    const matcher = /matcher:\s*\[([\s\S]*?)\]/.exec(middleware)?.[1] ?? '';
    expect(matcher.length, 'failed to parse middleware matcher').toBeGreaterThan(0);
    expect(matcher).not.toMatch(/['"]\/contact/);
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
