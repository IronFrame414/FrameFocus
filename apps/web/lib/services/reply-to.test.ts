import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

// +REPLY-TO [Josh, S97 — platform-wide]: every client-facing email carries a
// Reply-To of the sending COMPANY's address, so a client's reply reaches the
// company rather than the platform domain (ezcontractorbinder.com).
//
// These are unit traces over the shared send path. The DB-backed resolution
// order is asserted live in s97ct-reply-to.live.ts; what is asserted HERE is the
// wiring — that the header is set, that it is the company's address and never
// the recipient's, and that an unresolvable address degrades to NO header
// rather than to a failed send or an invented address.

const sendMock = vi.fn();
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

const resolveMock = vi.fn();
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({ limit: () => ({ maybeSingle: () => resolveMock(table) }) }),
          }),
          maybeSingle: () => resolveMock(table),
        }),
      }),
    }),
  }),
}));

const COMPANY_ID = '11111111-1111-1111-1111-111111111111';
const RECIPIENT = 'client@example.invalid';

async function send(overrides: Record<string, unknown> = {}) {
  vi.resetModules();
  const mod = await import('@/lib/services/email-service');
  return mod.sendEmail({
    from: 'Bishop Contracting <bishop-contracting@ezcontractorbinder.com>',
    to: RECIPIENT,
    subject: 'test',
    react: null as never,
    ...overrides,
  });
}

const savedGateEnv = {
  EMAIL_SEND_ENABLED: process.env.EMAIL_SEND_ENABLED,
  VERCEL_ENV: process.env.VERCEL_ENV,
};

beforeEach(() => {
  sendMock.mockReset();
  sendMock.mockResolvedValue({ data: { id: 'msg_1' }, error: null });
  resolveMock.mockReset();
  process.env.RESEND_API_KEY = 'test-key';
  // The send gate (email-service.ts, [Email §1]) refuses BEFORE getResend(),
  // so these traces never reach the mocked transport unless the gate is
  // explicitly opened for the process.
  process.env.EMAIL_SEND_ENABLED = 'true';
  delete process.env.VERCEL_ENV;
});

afterAll(() => {
  for (const [key, value] of Object.entries(savedGateEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('+REPLY-TO — the header is set from the company', () => {
  it('uses companies.email when the company has one', async () => {
    resolveMock.mockImplementation((table: string) =>
      table === 'companies' ? { data: { email: 'office@bishopcontracting.com' } } : { data: null }
    );

    await send({ replyToCompanyId: COMPANY_ID });

    expect(sendMock).toHaveBeenCalledOnce();
    expect(sendMock.mock.calls[0][0].replyTo).toBe('office@bishopcontracting.com');
  });

  it('FALLS BACK to the owner when companies.email is empty', async () => {
    // The branch that actually runs today: the column exists but no company on
    // rebuild-test has filled it in.
    resolveMock.mockImplementation((table: string) =>
      table === 'companies'
        ? { data: { email: '   ' } }
        : { data: { email: 'owner@example.invalid' } }
    );

    await send({ replyToCompanyId: COMPANY_ID });
    expect(sendMock.mock.calls[0][0].replyTo).toBe('owner@example.invalid');
  });

  it('an explicit replyTo wins and skips resolution entirely', async () => {
    await send({ replyTo: 'explicit@example.invalid', replyToCompanyId: COMPANY_ID });
    expect(sendMock.mock.calls[0][0].replyTo).toBe('explicit@example.invalid');
    expect(resolveMock).not.toHaveBeenCalled();
  });
});

describe('+REPLY-TO — it is the COMPANY, never the recipient', () => {
  it('never sets Reply-To to the person being emailed', async () => {
    resolveMock.mockImplementation((table: string) =>
      table === 'companies' ? { data: { email: 'office@bishopcontracting.com' } } : { data: null }
    );

    await send({ replyToCompanyId: COMPANY_ID });
    const call = sendMock.mock.calls[0][0];

    // The failure this guards against: a reply-to of the client's own address
    // makes every reply bounce back to the client and silently strands the
    // conversation.
    expect(call.replyTo).not.toBe(RECIPIENT);
    expect(call.to).toEqual([RECIPIENT]);
  });

  it('the FROM line is untouched — only Reply-To changes', async () => {
    resolveMock.mockImplementation((table: string) =>
      table === 'companies' ? { data: { email: 'office@bishopcontracting.com' } } : { data: null }
    );

    await send({ replyToCompanyId: COMPANY_ID });
    expect(sendMock.mock.calls[0][0].from).toBe(
      'Bishop Contracting <bishop-contracting@ezcontractorbinder.com>'
    );
  });
});

describe('+REPLY-TO — no address must never break a send', () => {
  it('omits the header entirely when neither company nor owner has an address', async () => {
    resolveMock.mockImplementation(() => ({ data: null }));

    const result = await send({ replyToCompanyId: COMPANY_ID });

    expect(result.error).toBeNull();
    expect(result.messageId).toBe('msg_1');
    // Omitted, not empty — an empty Reply-To header is worse than none.
    expect('replyTo' in sendMock.mock.calls[0][0]).toBe(false);
  });

  it('a resolution THROW still sends, without the header', async () => {
    resolveMock.mockImplementation(() => {
      throw new Error('db down');
    });

    const result = await send({ replyToCompanyId: COMPANY_ID });
    expect(result.error).toBeNull();
    expect('replyTo' in sendMock.mock.calls[0][0]).toBe(false);
  });

  it('INTERNAL mail passes no company id and gets no Reply-To', async () => {
    // Manager notifications are deliberately excluded — a reply belongs in the
    // company's own inbox, not routed back at them from the platform.
    const result = await send({});
    expect(result.error).toBeNull();
    expect('replyTo' in sendMock.mock.calls[0][0]).toBe(false);
    expect(resolveMock).not.toHaveBeenCalled();
  });
});
