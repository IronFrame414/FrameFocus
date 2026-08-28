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

// Signed-artifact spec §7 — branded change-order email, modelled on
// ProposalEmail. Used for CO sent (v1 attached + signing button), CO reminder
// (signing button, no attachment), and CO signed / declined notifications
// (no button — omit signingUrl). Attachments are added by the caller via the
// email-service sendEmail() params, exactly as the proposal send route does.

export interface ChangeOrderEmailProps {
  companyName: string;
  logoUrl: string | null;
  brandColor: string;
  bodyText: string;
  /** When present, renders the "Review & Sign Change Order" CTA. Omit for
   *  post-signature confirmations and decline notices. */
  signingUrl?: string | null;
}

export function ChangeOrderEmail({
  companyName,
  logoUrl,
  brandColor,
  bodyText,
  signingUrl,
}: ChangeOrderEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Change order from {companyName}</Preview>
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
          {signingUrl ? (
            <>
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
                  Review &amp; Sign Change Order
                </Button>
              </Section>
              <Text style={{ fontSize: '12px', color: '#7b8699' }}>
                The change order is attached as a PDF. You can review and sign online using the
                button above.
              </Text>
            </>
          ) : null}
          <Hr style={{ borderColor: '#e5e7eb', margin: '16px 0' }} />
          <Text style={{ fontSize: '11px', color: '#9ca3af' }}>
            Sent by {companyName} via {brand.name}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
