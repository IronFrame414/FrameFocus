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

// Spec 2 (4F/4J) — Owner/Admin heads-up on sign / decline /
// expiration. Internal email: plain, factual, links back into the
// dashboard.

export interface NotificationEmailProps {
  brandColor: string;
  heading: string;
  message: string;
  estimateUrl: string;
}

export function NotificationEmail({
  brandColor,
  heading,
  message,
  estimateUrl,
}: NotificationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{heading}</Preview>
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
          <Text style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 8px' }}>{heading}</Text>
          <Hr style={{ borderColor: brandColor, borderWidth: '2px', margin: '12px 0' }} />
          {message.split('\n').map((line, i) => (
            <Text key={i} style={{ fontSize: '14px', lineHeight: '22px', color: '#374151' }}>
              {line}
            </Text>
          ))}
          <Section style={{ textAlign: 'center', margin: '24px 0 8px' }}>
            <Button
              href={estimateUrl}
              style={{
                backgroundColor: brandColor,
                color: '#ffffff',
                padding: '10px 24px',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Open Estimate
            </Button>
          </Section>
          <Text style={{ fontSize: '11px', color: '#9ca3af' }}>FrameFocus notification</Text>
        </Container>
      </Body>
    </Html>
  );
}
