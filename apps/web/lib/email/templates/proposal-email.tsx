import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import { brand } from '@/lib/brand';

// Spec 2 (4E) — branded proposal delivery email. The PDF is
// attached; the CTA button opens the public signing page. Body text
// comes from the send modal (template variables already replaced).

export interface ProposalEmailProps {
  companyName: string;
  logoUrl: string | null;
  brandColor: string;
  bodyText: string;
  signingUrl: string;
}

export function ProposalEmail({
  companyName,
  logoUrl,
  brandColor,
  bodyText,
  signingUrl,
}: ProposalEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your proposal from {companyName}</Preview>
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
            <Text key={i} style={{ fontSize: '14px', lineHeight: '22px', color: '#3f4a60' }}>
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
          <Text style={{ fontSize: '12px', color: '#7b8699' }}>
            The full proposal is attached as a PDF. You can review and sign online using the
            button above.
          </Text>
          <Hr style={{ borderColor: '#e5e7eb', margin: '16px 0' }} />
          <Text style={{ fontSize: '11px', color: '#9ca3af' }}>
            Sent by {companyName} via {brand.name}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
