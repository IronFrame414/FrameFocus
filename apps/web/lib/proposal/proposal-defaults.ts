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
export const CONSENT_TEXT =
  'I acknowledge that I have reviewed this proposal and agree to the terms and conditions stated herein. This constitutes my electronic signature.';

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
