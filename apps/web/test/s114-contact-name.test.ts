import { describe, expect, it } from 'vitest';
import {
  contactDisplayName,
  contactNameWithCompany,
  hasValidContactName,
  normalizeContactNames,
} from '@framefocus/shared/utils/contact-name';

// ===========================================================================
// S114 C-9 [RULED Josh 2026-09-28] — a contact needs a first AND last name, OR
// a company name. One rule, every writer (desktop form, "also send to",
// project contacts panel, /m edit, and createContact/updateContact beneath
// them). Production P4 (2026-09-28): 0 existing contacts violate it.
// ===========================================================================

describe('S114 C-9 — hasValidContactName', () => {
  it.each([
    [{ first_name: 'Jane', last_name: 'Doe' }, true],
    [{ first_name: '', last_name: '', company_name: 'Acme Plumbing' }, true],
    [{ first_name: 'Jane', last_name: 'Doe', company_name: 'Acme' }, true],
    [{ first_name: null, last_name: null, company_name: 'Acme' }, true],
    // The superseded /m rule admitted any ONE of the three; these are refused now.
    [{ first_name: 'Jane', last_name: '', company_name: '' }, false],
    [{ first_name: '', last_name: 'Doe', company_name: null }, false],
    // Whitespace is blank.
    [{ first_name: '  ', last_name: '  ', company_name: '   ' }, false],
    [{}, false],
  ])('%j → %s', (c, want) => {
    expect(hasValidContactName(c)).toBe(want);
  });
});

describe('S114 C-9 — normalizeContactNames: blanks are "" (NOT NULL columns), never NULL', () => {
  it('a company-only contact stores empty strings for the names', () => {
    expect(
      normalizeContactNames({ first_name: null, last_name: undefined, company_name: ' Acme ' })
    ).toEqual({
      first_name: '',
      last_name: '',
      company_name: 'Acme',
    });
  });

  it('a blank company is NULL, names are trimmed', () => {
    expect(
      normalizeContactNames({ first_name: ' Jane ', last_name: 'Doe ', company_name: '  ' })
    ).toEqual({
      first_name: 'Jane',
      last_name: 'Doe',
      company_name: null,
    });
  });
});

describe('S114 C-9 — display: a company-only contact is shown by its company', () => {
  it('contactDisplayName', () => {
    expect(contactDisplayName({ first_name: 'Jane', last_name: 'Doe', company_name: 'Acme' })).toBe(
      'Jane Doe'
    );
    expect(contactDisplayName({ first_name: '', last_name: '', company_name: 'Acme' })).toBe(
      'Acme'
    );
    expect(contactDisplayName({ first_name: '', last_name: '', company_name: null })).toBe('');
  });

  it('contactNameWithCompany never renders " (Acme)"', () => {
    expect(
      contactNameWithCompany({ first_name: 'Jane', last_name: 'Doe', company_name: 'Acme' })
    ).toBe('Jane Doe (Acme)');
    expect(
      contactNameWithCompany({ first_name: 'Jane', last_name: 'Doe', company_name: 'Acme' }, 'dot')
    ).toBe('Jane Doe · Acme');
    expect(contactNameWithCompany({ first_name: '', last_name: '', company_name: 'Acme' })).toBe(
      'Acme'
    );
    expect(contactNameWithCompany({ first_name: 'Jane', last_name: 'Doe', company_name: '' })).toBe(
      'Jane Doe'
    );
  });
});
