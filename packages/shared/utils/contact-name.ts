// [S114 C-9, RULED Josh 2026-09-28] THE CONTACT NAME RULE — one rule, every
// writer: a contact needs a first AND last name, OR a company name.
//
// ⚠️ THE COLUMNS STAY NOT NULL. `contacts.first_name` / `last_name` are
// `text NOT NULL` (baseline) and list code calls `.toLowerCase()` on them, so a
// company-only contact stores its blank names as '' — never NULL. That is what
// `normalizeContactNames` returns; every writer sends its output.
//
// ⚠️ NO CHECK CONSTRAINT (Q12 A). Production measured 0 contacts that such a
// CHECK would reject on 2026-09-28 (P4), so a later session adding one knows it
// was safe on that date — re-count before applying it anyway.
//
// Used by: desktop contact form, estimate "also send to", project contacts
// panel, /m contact edit. The /m site-visit new-contact path goes through RPC
// `create_site_visit`, whose own check changes with its migration (C-branch 2).

export interface ContactNameParts {
  first_name?: string | null;
  last_name?: string | null;
  company_name?: string | null;
}

const clean = (v: string | null | undefined): string => (v ?? '').trim();

/** True when the contact has a first AND last name, OR a company name. */
export function hasValidContactName(c: ContactNameParts): boolean {
  return (clean(c.first_name) !== '' && clean(c.last_name) !== '') || clean(c.company_name) !== '';
}

/** The one message every writer shows when the rule fails. */
export const CONTACT_NAME_RULE_MESSAGE = 'Enter a first and last name, or a company name.';

/** Trimmed, with blank names as '' (NOT NULL columns) and a blank company as NULL. */
export function normalizeContactNames(c: ContactNameParts): {
  first_name: string;
  last_name: string;
  company_name: string | null;
} {
  return {
    first_name: clean(c.first_name),
    last_name: clean(c.last_name),
    company_name: clean(c.company_name) || null,
  };
}

/**
 * The name to SHOW for a contact: the person's name when there is one, else the
 * company. A company-only contact used to render as " " (and as empty initials).
 */
export function contactDisplayName(c: ContactNameParts): string {
  const person = [clean(c.first_name), clean(c.last_name)].filter(Boolean).join(' ');
  return person || clean(c.company_name);
}

/**
 * A label carrying both: "Jane Doe (Acme)" / "Jane Doe · Acme" when there is a
 * person, just "Acme" when there is only a company — never " (Acme)".
 */
export function contactNameWithCompany(
  c: ContactNameParts,
  style: 'parens' | 'dot' = 'parens'
): string {
  const person = [clean(c.first_name), clean(c.last_name)].filter(Boolean).join(' ');
  const company = clean(c.company_name);
  if (!person) return company;
  if (!company) return person;
  return style === 'parens' ? `${person} (${company})` : `${person} · ${company}`;
}
