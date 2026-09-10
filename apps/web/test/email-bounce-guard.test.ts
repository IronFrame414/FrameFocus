import { describe, it, expect, afterEach } from 'vitest';
import { recipientIsDeliverable, sendEmail } from '@/lib/services/email-service';

// The bounce guard [Josh ruling, 2026-09-10] — 52 sends to
// `qa-client-a@example.invalid` logged `sent`, hard-bounced at SES where this
// platform could not see them, and cost ~12% of the domain's volume over the
// period against a >2% reputation-damaging norm.
//
// The decision table IS the spec: RFC 2606/6761 reserved TLDs and reserved
// second-level names can never be delegated, so they can never receive mail,
// so they are refused at the one chokepoint every sender goes through. Nothing
// else is refused — this is a static list, NOT a live DNS lookup [ruled], and
// a real domain must never be blocked by it.

const cases: Array<{ name: string; address: string; deliverable: boolean }> = [
  // ── the reserved TLDs (RFC 2606 §2, RFC 6761) ────────────────────────────
  { name: '.invalid — the address that caused this', address: 'qa-client-a@example.invalid', deliverable: false },
  { name: '.test', address: 'someone@foo.test', deliverable: false },
  { name: '.example', address: 'someone@foo.example', deliverable: false },
  { name: '.localhost', address: 'someone@my.localhost', deliverable: false },
  { name: '.local (RFC 6762 mDNS)', address: 'someone@printer.local', deliverable: false },

  // ── the reserved second-level names (RFC 2606 §3) ────────────────────────
  { name: 'example.com', address: 'nobody@example.com', deliverable: false },
  { name: 'example.net', address: 'nobody@example.net', deliverable: false },
  { name: 'example.org', address: 'nobody@example.org', deliverable: false },
  {
    name: 'a SUBDOMAIN of a reserved name is equally reserved',
    address: 'nobody@mail.example.com',
    deliverable: false,
  },

  // ── shape ────────────────────────────────────────────────────────────────
  { name: 'case is irrelevant', address: 'QA@EXAMPLE.INVALID', deliverable: false },
  {
    name: 'a trailing dot is the same fully-qualified domain',
    address: 'qa@example.invalid.',
    deliverable: false,
  },
  { name: 'no @ at all is undeliverable by definition', address: 'not-an-address', deliverable: false },
  { name: 'nothing after the @', address: 'user@', deliverable: false },
  { name: 'nothing before the @', address: '@example.com', deliverable: false },

  // ── ⚠️ THE HALF THAT MATTERS MOST: real addresses must pass ──────────────
  // A false positive here does not bounce a fixture, it silently stops an
  // invoice reaching a paying client. Every one of these is a shape the
  // product actually sends to.
  { name: 'a real gmail recipient', address: 'JSBishop14@gmail.com', deliverable: true },
  { name: 'the platform support box', address: 'ezcontractorbinder@gmail.com', deliverable: true },
  { name: 'the sending domain itself', address: 'worth-properties@ezcontractorbinder.com', deliverable: true },
  { name: "a tenant's own domain", address: 'office@bishopcontracting.com', deliverable: true },
  { name: 'a plus-address', address: 'josh+qa-admin@worthprop.com', deliverable: true },
  {
    name: '⚠️ a real domain that merely CONTAINS a reserved word',
    address: 'sales@example-homes.com',
    deliverable: true,
  },
  {
    name: '⚠️ a real domain whose LABEL is a reserved word but whose TLD is not',
    address: 'qa@test.com',
    deliverable: true,
  },
  {
    name: '⚠️ a real domain ENDING in a reserved word without the dot',
    address: 'someone@notexample.com',
    deliverable: true,
  },
  { name: 'a long real TLD', address: 'someone@bishop.construction', deliverable: true },
];

describe('recipientIsDeliverable decision table', () => {
  for (const c of cases) {
    it(c.name, () => {
      const decision = recipientIsDeliverable(c.address);
      expect(decision.deliverable, c.address).toBe(c.deliverable);
      if (!decision.deliverable) {
        // A refusal always names its reason — it lands in email_logs.metadata
        // and is the only thing that will explain the row later.
        expect((decision as { reason: string }).reason).toBeTruthy();
      }
    });
  }
});

describe('sendEmail refuses an undeliverable recipient', () => {
  const saved = {
    EMAIL_SEND_ENABLED: process.env.EMAIL_SEND_ENABLED,
    VERCEL_ENV: process.env.VERCEL_ENV,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
  };
  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('refuses as a returned error, with the gate OPEN and before touching the key', async () => {
    // Gate deliberately open: with it closed this would refuse for the wrong
    // reason and prove nothing about this guard. Key absent: if the guard ran
    // after getResend() this would THROW rather than return, so a resolved
    // promise is what proves the ordering.
    process.env.EMAIL_SEND_ENABLED = 'true';
    delete process.env.VERCEL_ENV;
    delete process.env.RESEND_API_KEY;

    const result = await sendEmail({
      from: 'Worth Properties <worth-properties@ezcontractorbinder.com>',
      to: 'qa-client-a@example.invalid',
      subject: 'bounce guard probe',
      react: null as never,
    });

    expect(result.messageId).toBeNull();
    expect(result.error).toMatch(/undeliverable recipient/);
    expect(result.error).toMatch(/reserved TLD/);
  });

  it('the SEND GATE still outranks it — a closed gate refuses first', async () => {
    // Ordering, asserted rather than assumed. If these two ever swap, a
    // non-production deployment would start reporting address problems instead
    // of "you may not send here", and the send gate is the more important fact.
    delete process.env.EMAIL_SEND_ENABLED;
    delete process.env.VERCEL_ENV;
    delete process.env.RESEND_API_KEY;

    const result = await sendEmail({
      from: 'Worth Properties <worth-properties@ezcontractorbinder.com>',
      to: 'qa-client-a@example.invalid',
      subject: 'ordering probe',
      react: null as never,
    });

    expect(result.error).toMatch(/send gate refused/);
    expect(result.error).not.toMatch(/undeliverable recipient/);
  });
});
