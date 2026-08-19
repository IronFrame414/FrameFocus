import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import { brand } from '@/lib/brand';

// P1 [S160] — the account-security emails, in our own template.
//
// These replace GoTrue's built-in HTML, which is a bare `<h2>` and a link with
// no styling, no product name and no sender identity:
//
//   mailer_templates_confirmation_content:
//     "<h2>Confirm your signup</h2><p>Follow this link to confirm your user:</p>…"
//
// ⚠️ ONE TEMPLATE, SIX KINDS — deliberately not six files. Every one of these is
// the same shape (a heading, a sentence, one button, a fallback URL, a "you can
// ignore this" line) and they differ only in words. Six near-identical templates
// is how the S135 subject-line defect happened: the copy that mattered was in a
// place no test rendered. One template with a `kind` discriminator means one
// render test covers all six, and `AUTH_EMAIL_COPY` below is a plain object a
// test can iterate.
//
// ⚠️ DELIBERATELY NOT TENANT-BRANDED. Every other template here takes a
// `brandColor` and dresses itself as the contractor — because those emails are
// FROM the contractor TO their client. These are from the PLATFORM to a person
// about THEIR ACCOUNT: the password on it, the address on it. Wearing a
// contractor's colours on a "reset your password" mail invites the reader to
// believe the contractor can see or set their password. The From line still
// carries the company name, because the sending domain is per-tenant and
// alignment depends on it — but the body says who is really talking.
//
// ⚠️ NO `{{ .Token }}` FOR LINK-BASED ACTIONS. GoTrue sends both a link hash and
// a typeable OTP for every action. Rendering the code alongside the button on a
// confirmation email trains people to read codes out of emails, which is the
// exact behaviour phishing depends on. The code is shown ONLY for
// `reauthenticate`, where there is no link and typing it is the whole flow.

export type AuthEmailKind =
  | 'confirm_signup'
  | 'recover_password'
  | 'magic_link'
  | 'change_email'
  | 'reauthenticate'
  | 'auth_invite';

interface Copy {
  heading: string;
  body: string;
  cta: string;
  /** The reassurance line. Every one names what happens if you do nothing. */
  ignore: string;
}

export const AUTH_EMAIL_COPY: Record<AuthEmailKind, Copy> = {
  confirm_signup: {
    heading: 'Confirm your email address',
    body: `Confirm this address to finish setting up your ${brand.name} account. You will not be able to sign in until you do.`,
    cta: 'Confirm my email',
    ignore: 'If you did not create an account, you can ignore this email and nothing will happen.',
  },
  recover_password: {
    heading: 'Reset your password',
    body: `Use the button below to choose a new ${brand.name} password. The link expires in 24 hours.`,
    cta: 'Choose a new password',
    ignore:
      'If you did not ask to reset your password, you can ignore this email — your current password still works and nothing has changed.',
  },
  magic_link: {
    heading: 'Your sign-in link',
    body: `Use the button below to sign in to ${brand.name}. The link expires in 24 hours and can be used once.`,
    cta: 'Sign in',
    ignore: 'If you did not ask to sign in, you can ignore this email.',
  },
  change_email: {
    heading: 'Confirm your new email address',
    body: `Confirm this address to finish changing the email on your ${brand.name} account.`,
    cta: 'Confirm this address',
    ignore:
      'If you did not ask to change your email address, ignore this email and contact whoever manages your account — the address on it has not changed yet.',
  },
  reauthenticate: {
    heading: 'Your verification code',
    body: 'Enter this code to confirm it is you.',
    cta: '',
    ignore: 'If you did not ask for this code, you can ignore this email.',
  },
  auth_invite: {
    heading: `You have been invited to ${brand.name}`,
    body: 'Use the button below to set up your account.',
    ignore: 'If you were not expecting this invitation, you can ignore this email.',
    cta: 'Set up my account',
  },
};

export interface AuthEmailProps {
  kind: AuthEmailKind;
  actionUrl: string;
  /** GoTrue's typeable OTP. Rendered ONLY for `reauthenticate` — see above. */
  token: string;
}

export function AuthEmail({ kind, actionUrl, token }: AuthEmailProps) {
  const copy = AUTH_EMAIL_COPY[kind];
  const isCodeOnly = kind === 'reauthenticate';

  return (
    <Html>
      <Head />
      <Preview>{copy.heading}</Preview>
      <Body style={{ backgroundColor: '#f3f4f6', fontFamily: 'Helvetica, Arial, sans-serif' }}>
        <Container
          style={{
            backgroundColor: '#ffffff',
            margin: '24px auto',
            padding: '32px',
            borderRadius: '8px',
            maxWidth: '560px',
          }}
        >
          <Text style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 8px', color: '#14213d' }}>
            {copy.heading}
          </Text>
          <Text style={{ fontSize: '14px', color: '#374151', margin: '0 0 24px' }}>
            {copy.body}
          </Text>

          {isCodeOnly ? (
            <Section style={{ margin: '0 0 24px' }}>
              <Text
                style={{
                  fontFamily: 'ui-monospace, "IBM Plex Mono", monospace',
                  fontSize: '28px',
                  fontWeight: 700,
                  letterSpacing: '0.15em',
                  color: '#14213d',
                  backgroundColor: '#eef1fb',
                  padding: '14px 20px',
                  borderRadius: '8px',
                  textAlign: 'center' as const,
                  margin: 0,
                }}
              >
                {token}
              </Text>
            </Section>
          ) : (
            <>
              <Section style={{ margin: '0 0 20px' }}>
                <Button
                  href={actionUrl}
                  style={{
                    backgroundColor: '#2f49d1',
                    color: '#ffffff',
                    padding: '12px 22px',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: 700,
                    textDecoration: 'none',
                  }}
                >
                  {copy.cta}
                </Button>
              </Section>
              {/* The URL in full, because a button is not clickable in every
                  client and a security email must not become unusable in the
                  one place someone is most likely to be reading it carefully. */}
              <Text style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 24px' }}>
                Or paste this link into your browser:
                <br />
                <span style={{ wordBreak: 'break-all', color: '#2f49d1' }}>{actionUrl}</span>
              </Text>
            </>
          )}

          <Hr style={{ borderColor: '#e6e9ef', margin: '0 0 16px' }} />
          <Text style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 8px' }}>
            {copy.ignore}
          </Text>
          <Text style={{ fontSize: '12px', color: '#9aa1ac', margin: 0 }}>
            {brand.name}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
