// Spec 2 — client-safe constants shared by the send modal (browser)
// and the email/signing services (server). No 'server-only' here.

export const DEFAULT_PROPOSAL_SUBJECT =
  'Your proposal from {{company_name}} — {{estimate_number}}';

export const DEFAULT_PROPOSAL_BODY = `Hi {{contact_name}},

Thank you for the opportunity to quote your project. Your proposal "{{estimate_name}}" ({{estimate_number}}) is attached, and you can review and sign it online using the button below.

This proposal is valid until {{expiration_date}}.

We look forward to working with you!

— {{company_name}}`;

export const DEFAULT_REMINDER_SUBJECT =
  'Reminder: your proposal from {{company_name}} ({{estimate_number}})';

export const DEFAULT_REMINDER_BODY = `Hi {{contact_name}},

Just a friendly reminder that your proposal "{{estimate_name}}" ({{estimate_number}}) from {{company_name}} is awaiting your review. You can review and sign it online using the button below.

This proposal is valid until {{expiration_date}}.

— {{company_name}}`;

// F7 — exact consent text stored on every completed signing session.
// NOTE (Session 64): this text says "this proposal" and is rendered verbatim
// to change-order signers too (co-signing-client.tsx). Flagged as a legal-text
// defect in signed-artifact-spec.md §10; left as-is pending counsel. Do not
// silently rewrite legal text.
export const CONSENT_TEXT =
  'I acknowledge that I have reviewed this proposal and agree to the terms and conditions stated herein. This constitutes my electronic signature.';

// Signed-artifact spec §7 — change-order email defaults. Client-safe so the
// send modal can pre-fill from them; server callers read them via
// email-service re-exports. CO template variables: {{company_name}},
// {{contact_name}}, {{co_number}}, {{co_title}}, {{signing_link}},
// {{expiration_date}}, {{sent_date}}.
export const DEFAULT_CO_SUBJECT =
  'Change order {{co_number}} from {{company_name}}';

export const DEFAULT_CO_BODY = `Hi {{contact_name}},

A change order for your project is ready for your review. "{{co_title}}" ({{co_number}}) is attached, and you can review and sign it online using the button below.

Please review and sign by {{expiration_date}}.

— {{company_name}}`;

// 7D1 §13 — invoice delivery. NO payment link: payment is QuickBooks-hosted and
// 7G is not built, so the mail says how to pay in words rather than offering a
// button that goes nowhere.
export const DEFAULT_INVOICE_SUBJECT =
  'Invoice {{invoice_number}} from {{company_name}}';

export const DEFAULT_INVOICE_BODY = `Hi {{contact_name}},

Invoice {{invoice_number}} for {{project_name}} is attached, dated {{issue_date}}.

Amount due: {{amount_due}}

Please get in touch if you have any questions about this invoice.

— {{company_name}}`;

export const DEFAULT_CO_REMINDER_SUBJECT =
  'Reminder: change order {{co_number}} from {{company_name}}';

export const DEFAULT_CO_REMINDER_BODY = `Hi {{contact_name}},

Just a friendly reminder that change order "{{co_title}}" ({{co_number}}) from {{company_name}} is awaiting your signature. You can review and sign it online using the button below.

Please review and sign by {{expiration_date}}.

— {{company_name}}`;

// Reference chips shown in the email editor modal and settings.
export const TEMPLATE_VARIABLES = [
  '{{company_name}}',
  '{{contact_name}}',
  '{{estimate_number}}',
  '{{estimate_name}}',
  '{{signing_link}}',
  '{{expiration_date}}',
  '{{sent_date}}',
] as const;
