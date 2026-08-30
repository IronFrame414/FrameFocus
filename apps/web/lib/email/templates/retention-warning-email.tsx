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

// The three retention warnings that precede permanent deletion.
//
// ⚠️ COPY IS RULED [Josh] — docs/specs/retention-warning-emails.md. Implement
// as written; wording changes need a ruling, not a judgement call. These are
// the notice standing behind the published policy's deletion promise.
//
// PLATFORM emails: the product writing to its own customer, so the
// platform identity and palette — never the tenant's logo or brand colour
// (the ruled email/PDF boundary). `brand.themeColor` is deliberately the
// product chrome colour, not a tenant brand_color.
//
// The dates arrive PRE-FORMATTED (long form, company timezone) — ruled: the
// template never computes a date.

export type RetentionWarningKind = 'cancellation_60' | 'cancellation_30' | 'trial_4';

export interface RetentionWarningEmailProps {
  kind: RetentionWarningKind;
  firstName: string;
  /** delete_after, long-form in the company's timezone. */
  deletionDate: string;
  /** locked_at, long-form — the cancellation date / trial lock date. */
  lockDate: string;
  billingUrl: string;
}

export function retentionWarningSubject(kind: RetentionWarningKind, deletionDate: string): string {
  switch (kind) {
    case 'cancellation_60':
      return `Your ${brand.name} data will be deleted on ${deletionDate}`;
    case 'cancellation_30':
      return `30 days left — your ${brand.name} data is deleted on ${deletionDate}`;
    case 'trial_4':
      return `4 days left — your ${brand.name} trial data is deleted on ${deletionDate}`;
  }
}

const para = { fontSize: '14px', lineHeight: '22px', color: '#3f4a60' } as const;
const strong = { fontWeight: 700 as const, color: '#111827' };

function Paragraphs({ kind, firstName, deletionDate, lockDate }: RetentionWarningEmailProps) {
  if (kind === 'cancellation_60') {
    return (
      <>
        <Text style={para}>Hi {firstName},</Text>
        <Text style={para}>
          Your {brand.name} subscription was cancelled on {lockDate}, and your account is locked.
        </Text>
        <Text style={para}>
          <span style={strong}>Your data will be permanently deleted on {deletionDate}.</span> That
          includes your projects, estimates, invoices, photos, contracts and financial records.
          Once it&apos;s deleted it can&apos;t be recovered.
        </Text>
        <Text style={para}>
          <span style={strong}>If you want any of it, resubscribe before that date.</span> Your
          account unlocks immediately and everything is exactly where you left it — you can work
          in it again, or export what you need and cancel.
        </Text>
        <Text style={para}>
          While the account is locked you can&apos;t sign in, read or download anything.{' '}
          <span style={strong}>Resubscribing is the only way to reach your data.</span>
        </Text>
      </>
    );
  }
  if (kind === 'cancellation_30') {
    return (
      <>
        <Text style={para}>Hi {firstName},</Text>
        <Text style={para}>A second reminder, because this one can&apos;t be undone.</Text>
        <Text style={para}>
          <span style={strong}>
            Your {brand.name} data will be permanently deleted on {deletionDate}
          </span>{' '}
          — 30 days from today. Projects, estimates, invoices, photos, contracts, financial
          records. All of it, and permanently.
        </Text>
        <Text style={para}>
          <span style={strong}>Resubscribe before {deletionDate} and everything comes back</span>,
          exactly as you left it. You can export what you need and cancel again the same day.
        </Text>
        <Text style={para}>
          You can&apos;t sign in or download anything while the account is locked.{' '}
          <span style={strong}>Resubscribing is the only way to reach your data.</span>
        </Text>
      </>
    );
  }
  return (
    <>
      <Text style={para}>Hi {firstName},</Text>
      <Text style={para}>
        Your {brand.name} trial ended on {lockDate}, and the account is locked.
      </Text>
      <Text style={para}>
        <span style={strong}>
          Anything you set up during the trial will be permanently deleted on {deletionDate}
        </span>{' '}
        — 4 days from today.
      </Text>
      <Text style={para}>
        If you were still deciding,{' '}
        <span style={strong}>subscribing before {deletionDate} keeps everything</span> you built:
        your projects, estimates, contacts and settings, exactly as you left them. Start over
        after that date and you start from an empty account.
      </Text>
    </>
  );
}

export function RetentionWarningEmail(props: RetentionWarningEmailProps) {
  const { kind, deletionDate, billingUrl } = props;
  const cta = kind === 'trial_4' ? 'Subscribe' : 'Resubscribe';
  return (
    <Html>
      <Head />
      <Preview>{retentionWarningSubject(kind, deletionDate)}</Preview>
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
          <Text style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 8px' }}>
            {brand.name}
          </Text>
          <Hr style={{ borderColor: brand.themeColor, borderWidth: '2px', margin: '12px 0' }} />
          <Paragraphs {...props} />
          <Section style={{ textAlign: 'center', margin: '24px 0 8px' }}>
            <Button
              href={billingUrl}
              style={{
                backgroundColor: brand.themeColor,
                color: '#ffffff',
                padding: '10px 24px',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              {cta}
            </Button>
          </Section>
          {kind === 'cancellation_60' && (
            <Text style={para}>
              If you meant to cancel and don&apos;t need the records, you don&apos;t have to do
              anything. They&apos;ll be deleted on {deletionDate}.
            </Text>
          )}
          {kind === 'cancellation_30' && (
            <Text style={para}>
              ⚠️ <span style={strong}>This is the last reminder you&apos;ll get.</span> After{' '}
              {deletionDate} there is nothing to restore.
            </Text>
          )}
          {kind === 'trial_4' && (
            <Text style={para}>
              If the trial wasn&apos;t for you, no action is needed — it&apos;ll be deleted on{' '}
              {deletionDate}.
            </Text>
          )}
          <Text style={para}>
            {kind === 'cancellation_60' && 'Questions, or want your data deleted sooner? Reply to this email.'}
            {kind === 'cancellation_30' && 'Questions? Reply to this email.'}
            {kind === 'trial_4' && 'Questions, or want it deleted now? Reply to this email.'}
          </Text>
          <Text style={{ fontSize: '11px', color: '#9ca3af' }}>{brand.name}</Text>
        </Container>
      </Body>
    </Html>
  );
}
