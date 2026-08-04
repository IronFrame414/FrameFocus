import { describe, it, expect } from 'vitest';
import { buildSenderAddress, replaceTemplateVariables } from './email-service';

describe('buildSenderAddress', () => {
  // Asserted as a LITERAL, not built from SENDING_DOMAIN — importing the
  // constant would make this agree with whatever the constant says and prove
  // nothing. A domain change is meant to fail here and be re-confirmed by hand
  // against what is actually verified in Resend.
  it('formats as display-name with slug at sending domain', () => {
    expect(buildSenderAddress({ name: 'Bishop Contracting', slug: 'bishop' }))
      .toBe('Bishop Contracting <bishop@ezcontractorbinder.com>');
  });

  // The local part is the tenant slug, so it is the only part that varies
  // between tenants — the domain is shared and must not drift per company.
  it('varies only the local part across tenants', () => {
    expect(buildSenderAddress({ name: 'Rivera Builders', slug: 'rivera-builders' }))
      .toBe('Rivera Builders <rivera-builders@ezcontractorbinder.com>');
  });
});

describe('replaceTemplateVariables', () => {
  it('replaces a known token', () => {
    expect(replaceTemplateVariables('Hi {{contact_name}}', { contact_name: 'Sam' }))
      .toBe('Hi Sam');
  });

  it('leaves an unknown token untouched', () => {
    expect(replaceTemplateVariables('Hi {{missing}}', { contact_name: 'Sam' }))
      .toBe('Hi {{missing}}');
  });

  it('replaces multiple tokens in one pass', () => {
    expect(replaceTemplateVariables('{{a}} and {{b}}', { a: 'X', b: 'Y' }))
      .toBe('X and Y');
  });
});
