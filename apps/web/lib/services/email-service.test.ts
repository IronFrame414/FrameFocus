import { describe, it, expect } from 'vitest';
import { buildSenderAddress, replaceTemplateVariables } from './email-service';

describe('buildSenderAddress', () => {
  it('formats as display-name with slug at sending domain', () => {
    expect(buildSenderAddress({ name: 'Bishop Contracting', slug: 'bishop' }))
      .toBe('Bishop Contracting <bishop@rafterworks.com>');
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
