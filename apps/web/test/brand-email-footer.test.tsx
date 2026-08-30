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
import { PoEmail } from '@/lib/email/templates/po-email';
import { NotificationEmail } from '@/lib/email/templates/notification-email';
import { AuthEmail, AUTH_EMAIL_COPY, type AuthEmailKind } from '@/lib/email/templates/auth-email';
import { RetentionWarningEmail } from '@/lib/email/templates/retention-warning-email';
import { SelectionReleasedEmail } from '@/lib/email/templates/selection-released-email';
import { SelectionSpecificationsEmail } from '@/lib/email/templates/selection-specifications-email';
import { subjectFor } from '@/lib/services/auth-email';
import { buildSelectionSpecificationsSubject, buildSelectionsReleasedSubject } from '@/lib/services/selection-email';

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
  // PO module R-L4 — the purchase-order email. It goes to a VENDOR, but the
  // brand contract is the client-facing one and for the same reason: it
  // leaves the building under the CONTRACTOR'S identity, so no product mark
  // may survive in it.
  [
    'purchase order',
    () => (
      <PoEmail
        companyName={COMPANY}
        logoUrl={LOGO}
        brandColor="#2f49d1"
        poNumber="PO-1902-01"
        projectName="Maple St Remodel"
        needBy="2026-09-05"
        totalLabel="$510.00"
      />
    ),
  ],
  // S174 #1 — the mail a selections RELEASE sends. Client-facing and therefore
  // white-label on exactly the same terms as the four above.
  [
    'selection released',
    () => (
      <SelectionReleasedEmail
        companyName={COMPANY}
        logoUrl={LOGO}
        brandColor="#2f49d1"
        contactName="Dana"
        projectName="Maple St Remodel"
        selectionNames={['Kitchen countertop', 'Entry tile']}
        dueDateLine="The soonest of these is due by September 1, 2026."
        portalUrl="https://example.com/portal/p1/selections"
      />
    ),
  ],
  // [S175 stage 6] The specifications sheet's delivery. Client-facing and
  // white-label on exactly the same terms — and it is a SEPARATE template from
  // the release above, not a variant of it: one asks her to choose, one tells
  // her what she chose and carries the PDF.
  [
    'selection specifications',
    () => (
      <SelectionSpecificationsEmail
        companyName={COMPANY}
        logoUrl={LOGO}
        brandColor="#2f49d1"
        contactName="Dana"
        projectName="Maple St Remodel"
        approvedAsOf="August 26, 2026"
        selectionCount={2}
        selectionNames={['Kitchen countertop', 'Entry tile']}
        portalUrl="https://example.com/portal/p1/files"
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
  // S160 — the six Supabase Auth emails, one template with a `kind`. Its brand
  // contract is the same as the invite's and for the same reason: the reader is
  // being asked about an ACCOUNT on this product, so the product must be named.
  'auth-email.tsx',
  // PO module R-L4 — the vendor PO email. Contractor identity, white-label,
  // rendered in CLIENT_FACING above.
  'po-email.tsx',
  // S174 #1 — the selections release. White-label client-facing, rendered in
  // CLIENT_FACING above.
  'selection-released-email.tsx',
  // [S175 stage 6] The specifications sheet's delivery. White-label
  // client-facing, rendered in CLIENT_FACING above.
  'selection-specifications-email.tsx',
  // [Deletion sweep §3] The three retention warnings. Platform identity by
  // ruling (retention-warning-emails.md) — the product writing to its own
  // customer about deletion; a tenant brand here would be nonsense.
  'retention-warning-email.tsx',
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

  // S174 #1 — built as a function for the same reason `buildInviteSubject` is:
  // a subject is not a template, so no render test can see it. This one carries
  // no product name at all (it is a client-facing white-label send), so what is
  // asserted is the ABSENCE, plus the singular/plural split that decides whether
  // the sentence reads correctly at all.
  it('⚠️ the selections-released subject stays white-label and counts correctly', () => {
    expect(buildSelectionsReleasedSubject('Worth Properties', 1)).toBe(
      'Worth Properties: a selection is ready for you to choose'
    );
    expect(buildSelectionsReleasedSubject('Worth Properties', 3)).toBe(
      'Worth Properties: 3 selections are ready for you to choose'
    );
    for (const n of [1, 3]) {
      expect(buildSelectionsReleasedSubject('Worth Properties', n)).not.toContain(brand.name);
      expect(buildSelectionsReleasedSubject('Worth Properties', n)).not.toContain('FrameFocus');
    }
  });

  // [S175 stage 6] Same reason again, third time: a subject is not a template.
  // Client-facing, so the assertion is the ABSENCE of any product name.
  it('⚠️ the specifications-sheet subject stays white-label', () => {
    expect(buildSelectionSpecificationsSubject('Worth Properties')).toBe(
      'Worth Properties: your specifications sheet'
    );
    expect(buildSelectionSpecificationsSubject('Worth Properties')).not.toContain(brand.name);
    expect(buildSelectionSpecificationsSubject('Worth Properties')).not.toContain('FrameFocus');
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
  });

  // [Deletion sweep §3] — the retention warnings. Platform mail by ruling;
  // ALL THREE kinds rendered (a `kind` discriminator makes three messages of
  // one file — the auth-email lesson).
  describe('retention warnings (locked account, deletion ahead)', () => {
    const kinds = ['cancellation_60', 'cancellation_30', 'trial_4'] as const;
    const make = (kind: (typeof kinds)[number]) => (
      <RetentionWarningEmail
        kind={kind}
        firstName="Josh"
        deletionDate="January 3, 2027"
        lockDate="October 5, 2026"
        billingUrl="https://example.com/resubscribe?token=tok"
      />
    );

    it.each(kinds.map((k) => [k]))('%s names the product, never a stale name', async (kind) => {
      const html = readable(await render(make(kind)));
      expect(html).toContain(brand.name);
      expect(html).not.toContain('FrameFocus');
      // The ruled copy's spine: the exact stored date, and the one action.
      expect(html).toContain('January 3, 2027');
      expect(html).toContain('https://example.com/resubscribe?token=tok');
    });

    it('carries no tenant logo — platform identity by ruling', async () => {
      const html = await render(make('cancellation_60'));
      expect(html).not.toContain(LOGO);
    });
  });

  // ==========================================================================
  // S160 — the Supabase Auth emails. ONE template, SIX kinds.
  // ==========================================================================
  //
  // Every kind is rendered, not a representative one: the whole reason this
  // file walks the directory rather than trusting a list is that "the one
  // nobody rendered" is where the stale name shipped. A `kind` discriminator
  // makes six messages out of one file, so six is what gets rendered.
  //
  // ⚠️ NOT WHITE-LABEL, AND THE INVERSE OF THE CLIENT-FACING RULE. These say
  // the product's name and carry NO tenant logo — a "reset your password" mail
  // dressed as the contractor invites the reader to believe the contractor can
  // see or set their password. The From line still carries the company, because
  // the sending domain is per-tenant and alignment depends on it; the BODY says
  // who is really talking.
  describe.each(
    Object.keys(AUTH_EMAIL_COPY).map((k) => [k]) as Array<[AuthEmailKind]>
  )('auth email — %s (account security)', (kind) => {
    const make = () => (
      <AuthEmail
        kind={kind}
        actionUrl="https://ref.supabase.co/auth/v1/verify?token=hash"
        token="87654321"
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

    it('carries NO tenant logo — the inverse of the client-facing rule', async () => {
      const html = await render(make());
      expect(html).not.toContain(LOGO);
    });

    it('its SUBJECT names the product too — S136’s hole, for the new sender', async () => {
      // Subjects are not templates. `buildInviteSubject` was extracted so this
      // assertion could exist without a database; `subjectFor` is its twin, and
      // it exists for exactly the same reason.
      expect(subjectFor(kind)).toContain(brand.name);
      expect(subjectFor(kind)).not.toContain('FrameFocus');
    });

    it('carries no tenant logo — the tenant is named, not branded', async () => {
      const html = await render(make());
      expect(html).not.toContain(LOGO);
    });
  });
});
