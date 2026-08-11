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

// D2 [S135] — the invitation email that did not exist.
//
// Its own template rather than a reuse of NotificationEmail: every other
// template in this directory writes to someone who already has an account and a
// dashboard to be sent back to. This one writes to a person who is not a user
// yet, may never have heard of the product, and whose single decision is
// whether to accept. So it names the company FIRST, names the role, and carries
// exactly one action.
//
// Deliberately does NOT say "you have 7 days" as a countdown — `expires_at` is
// a real timestamp and it is rendered as a date, because a relative phrase in a
// mail read three days late is a lie.

export interface InviteEmailProps {
  brandColor: string;
  companyName: string;
  roleLabel: string;
  inviterName: string | null;
  acceptUrl: string;
  expiresOn: string;
}

export function InviteEmail({
  brandColor,
  companyName,
  roleLabel,
  inviterName,
  acceptUrl,
  expiresOn,
}: InviteEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{`${companyName} invited you to join them on ${brand.name}`}</Preview>
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
          <Text style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 8px' }}>
            {companyName} invited you to join them
          </Text>
          <Hr style={{ borderColor: brandColor, borderWidth: '2px', margin: '12px 0' }} />

          <Text style={{ fontSize: '14px', lineHeight: '22px', color: '#374151' }}>
            {inviterName
              ? `${inviterName} has invited you to join ${companyName} on ${brand.name} as ${roleLabel}.`
              : `You have been invited to join ${companyName} on ${brand.name} as ${roleLabel}.`}
          </Text>
          <Text style={{ fontSize: '14px', lineHeight: '22px', color: '#374151' }}>
            Accepting takes a minute — you will set your own password.
          </Text>

          <Section style={{ textAlign: 'center', margin: '24px 0 8px' }}>
            <Button
              href={acceptUrl}
              style={{
                backgroundColor: brandColor,
                color: '#ffffff',
                padding: '12px 24px',
                borderRadius: '6px',
                fontSize: '15px',
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              Accept invitation
            </Button>
          </Section>

          <Text style={{ fontSize: '12px', lineHeight: '18px', color: '#6b7280' }}>
            This invitation expires on {expiresOn}. If it lapses, ask {companyName} to resend it.
          </Text>
          <Text style={{ fontSize: '12px', lineHeight: '18px', color: '#6b7280' }}>
            If you were not expecting this, you can ignore this email — nothing happens until you
            accept.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
