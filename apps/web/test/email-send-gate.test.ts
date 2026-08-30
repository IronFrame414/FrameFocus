import { describe, it, expect, afterEach } from 'vitest';
import { emailSendAllowed, sendEmail } from '@/lib/services/email-service';

// The send gate [Josh ruling, 2026-08-30] — the S126 stub-the-transport rule
// made structural. The decision table IS the spec: the kill switch outranks
// everything, the explicit enable outranks environment, and absent both only a
// Vercel production deployment may send. Everything else — CI, Codespaces,
// preview deploys, a dev server driven by Playwright — is default-deny.

const cases: Array<{
  name: string;
  env: Record<string, string | undefined>;
  allowed: boolean;
}> = [
  { name: 'nothing set (CI, Codespaces, dev server)', env: {}, allowed: false },
  { name: 'VERCEL_ENV=production', env: { VERCEL_ENV: 'production' }, allowed: true },
  { name: 'VERCEL_ENV=preview', env: { VERCEL_ENV: 'preview' }, allowed: false },
  { name: 'VERCEL_ENV=development', env: { VERCEL_ENV: 'development' }, allowed: false },
  { name: 'explicit enable in a non-prod env', env: { EMAIL_SEND_ENABLED: 'true' }, allowed: true },
  {
    name: 'kill switch beats production',
    env: { EMAIL_SEND_ENABLED: 'false', VERCEL_ENV: 'production' },
    allowed: false,
  },
  {
    name: 'explicit enable is exact-match — "1" is not "true"',
    env: { EMAIL_SEND_ENABLED: '1', VERCEL_ENV: 'preview' },
    allowed: false,
  },
];

describe('emailSendAllowed decision table', () => {
  for (const c of cases) {
    it(c.name, () => {
      const decision = emailSendAllowed(c.env as NodeJS.ProcessEnv);
      expect(decision.allowed).toBe(c.allowed);
      if (!decision.allowed) {
        // A refusal always names its reason — the loud half of the ruling.
        expect((decision as { reason: string }).reason).toBeTruthy();
      }
    });
  }
});

describe('sendEmail behind a closed gate', () => {
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

  it('refuses as a returned error, before ever touching the key', async () => {
    delete process.env.EMAIL_SEND_ENABLED;
    delete process.env.VERCEL_ENV;
    // No key either: if the gate ran AFTER getResend(), this call would THROW
    // ('RESEND_API_KEY is not set') instead of returning the refusal — so a
    // resolved promise here proves the gate fires first, keyless.
    delete process.env.RESEND_API_KEY;

    const result = await sendEmail({
      from: 'Test <test@example.com>',
      to: 'nobody@example.com',
      subject: 'gate probe',
      react: null as never,
    });

    expect(result.messageId).toBeNull();
    expect(result.error).toMatch(/send gate refused/);
    expect(result.error).toMatch(/not 'production'/);
  });

  it('kill switch refusal names the switch', async () => {
    process.env.EMAIL_SEND_ENABLED = 'false';
    process.env.VERCEL_ENV = 'production';

    const result = await sendEmail({
      from: 'Test <test@example.com>',
      to: 'nobody@example.com',
      subject: 'gate probe',
      react: null as never,
    });

    expect(result.messageId).toBeNull();
    expect(result.error).toMatch(/kill switch/);
  });
});
