import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import { brand } from '@/lib/brand';

// Spec 2 (4J) — automated follow-up reminder. Includes the active
// signing link and a CAN-SPAM unsubscribe link that opts the client
// out of further reminders for this estimate.

export interface ReminderEmailProps {
  companyName: string;
  logoUrl: string | null;
  brandColor: string;
  bodyText: string;
  signingUrl: string;
  unsubscribeUrl: string;
}

export function ReminderEmail({
  companyName,
  logoUrl,
  brandColor,
  bodyText,
  signingUrl,
  unsubscribeUrl,
}: ReminderEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>A reminder about your proposal from {companyName}</Preview>
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
          {logoUrl ? (
            <Img src={logoUrl} alt={companyName} style={{ maxHeight: '56px', maxWidth: '200px' }} />
          ) : (
            <Text style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>{companyName}</Text>
          )}
          <Hr style={{ borderColor: brandColor, borderWidth: '2px', margin: '16px 0' }} />
          {bodyText.split('\n').map((line, i) => (
            <Text key={i} style={{ fontSize: '14px', lineHeight: '22px', color: '#374151' }}>
              {line}
            </Text>
          ))}
          <Section style={{ textAlign: 'center', margin: '28px 0' }}>
            <Button
              href={signingUrl}
              style={{
                backgroundColor: brandColor,
                color: '#ffffff',
                padding: '12px 28px',
                borderRadius: '6px',
                fontSize: '15px',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Review &amp; Sign Proposal
            </Button>
          </Section>
          <Hr style={{ borderColor: '#e5e7eb', margin: '16px 0' }} />
          <Text style={{ fontSize: '11px', color: '#9ca3af' }}>
            Sent by {companyName} via {brand.name} ·{' '}
            <Link href={unsubscribeUrl} style={{ color: '#9ca3af', textDecoration: 'underline' }}>
              Don&apos;t want reminders about this proposal? Unsubscribe.
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
