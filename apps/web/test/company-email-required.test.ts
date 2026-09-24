import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// COMPANY EMAIL IS REQUIRED — the application half. RULED [Josh, 2026-09-24].
//
// The database half (companies_email_required_check, the signup trigger) is
// proven live in company-email-required.live.ts and s97ct-reply-to.live.ts.
// What is decided HERE, without a browser (no jsdom by ruling 163.C):
//   · the shared validator — blank refused, malformed refused, NO looser than
//     the database;
//   · updateCompany() — the one writer every caller passes — refuses a blank
//     or malformed email WITHOUT reaching Supabase;
//   · the Company Settings form, at source level — the email field is gated on
//     that validator, and the sentence that invited the blank is gone.

const updateSpy = vi.fn();
vi.mock('@/lib/supabase-browser', () => ({
  createClient: () => ({
    from: () => ({
      update: (payload: unknown) => {
        updateSpy(payload);
        return { eq: () => ({ select: async () => ({ data: [{ id: 'x' }], error: null }) }) };
      },
    }),
  }),
}));

import {
  companyEmailSchema,
  COMPANY_EMAIL_INVALID_MESSAGE,
  COMPANY_EMAIL_REQUIRED_MESSAGE,
} from '@framefocus/shared/validation/company-settings';
import { updateCompany } from '@/lib/services/company-client';

const COMPANY_ID = '33333333-3333-3333-3333-333333333333';

beforeEach(() => updateSpy.mockReset());

describe('companyEmailSchema', () => {
  it.each([[''], ['   '], ['\t\n']])('refuses a blank value %j as REQUIRED', (v) => {
    const r = companyEmailSchema.safeParse(v);
    expect(r.success).toBe(false);
    expect(r.success ? '' : r.error.issues[0].message).toBe(COMPANY_EMAIL_REQUIRED_MESSAGE);
  });

  it.each([['office'], ['office@'], ['@example.com'], ['office at example.com']])(
    'refuses a malformed value %j as INVALID',
    (v) => {
      const r = companyEmailSchema.safeParse(v);
      expect(r.success).toBe(false);
      expect(r.success ? '' : r.error.issues[0].message).toBe(COMPANY_EMAIL_INVALID_MESSAGE);
    }
  );

  it('accepts a real address and returns it trimmed', () => {
    expect(companyEmailSchema.parse('  office@hh-renovations.com ')).toBe('office@hh-renovations.com');
  });
});

describe('updateCompany — the service writer refuses what the database would', () => {
  it.each([[null], [''], ['   ']])('a blank email %j is refused and never sent', async (email) => {
    const res = await updateCompany(COMPANY_ID, { email } as never);
    expect(res).toEqual({ success: false, error: COMPANY_EMAIL_REQUIRED_MESSAGE });
    expect(updateSpy, 'a blank email reached Supabase').not.toHaveBeenCalled();
  });

  it('a malformed email is refused and never sent', async () => {
    const res = await updateCompany(COMPANY_ID, { email: 'not-an-address' });
    expect(res).toEqual({ success: false, error: COMPANY_EMAIL_INVALID_MESSAGE });
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('a valid email is written, trimmed', async () => {
    const res = await updateCompany(COMPANY_ID, { email: ' office@hh-renovations.com ' });
    expect(res).toEqual({ success: true });
    expect(updateSpy).toHaveBeenCalledWith({ email: 'office@hh-renovations.com' });
  });

  it('an update that does not touch email is untouched by the check', async () => {
    // The control: the guard must key on the presence of `email`, not refuse
    // every save from a company whose email happens to be anything.
    const res = await updateCompany(COMPANY_ID, { phone: '555-0100' });
    expect(res).toEqual({ success: true });
    expect(updateSpy).toHaveBeenCalledWith({ phone: '555-0100' });
  });
});

describe('Company Settings form — source level', () => {
  const src = readFileSync(
    fileURLToPath(new URL('../app/dashboard/settings/settings-form.tsx', import.meta.url)),
    'utf8'
  );

  it('the sentence that invited the blank is GONE', () => {
    // It read: "Leave it blank and replies fall back to the owner's personal
    // address." Ruled the root cause of the incident; removed, not reworded.
    // Only the JSX is searched — the comment recording the removal quotes it.
    const jsxOnly = src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(jsxOnly).not.toMatch(/Leave it blank/i);
    expect(jsxOnly).not.toMatch(/fall back to\s+the owner/i);
    expect(jsxOnly).toContain('Where client replies go.');
  });

  it('the email field is gated on the shared validator before it can save', () => {
    const emailBranch = src.match(/if \(field === 'email'\) \{[\s\S]*?\n    \}/);
    expect(emailBranch, 'the email blur no longer has its own branch').toBeTruthy();
    expect(emailBranch![0]).toContain('companyEmailSchema.safeParse');
    // An invalid value returns before scheduleSave; only the parsed value saves.
    expect(emailBranch![0]).toMatch(/if \(!parsed\.success\) \{[\s\S]*?return;/);
    expect(emailBranch![0]).toContain("scheduleSave('email', parsed.data)");
  });

  it('the label marks it required, like the company name', () => {
    expect(src).toContain('Company Email *');
  });
});
