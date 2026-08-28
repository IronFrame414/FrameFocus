import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Preview,
  Text,
} from '@react-email/components';
import { brand } from '@/lib/brand';

// 7D1 §13 — branded invoice email, modelled on ChangeOrderEmail so the two read
// as the same company writing.
//
// NO CTA BUTTON, deliberately. A change order has somewhere to send the client
// (the signing link); an invoice does not — payment is QuickBooks-hosted and 7G
// is not built. Rather than fake a pay link or leave a dead button, the mail
// carries the amount due and the attached PDF and says nothing about how to
// click. Add the button here when 7G lands; the attachment path is unchanged.

export interface InvoiceEmailProps {
  companyName: string;
  logoUrl: string | null;
  brandColor: string;
  bodyText: string;
  invoiceNumber: string;
  amountDue: string;
}

export function InvoiceEmail({
  companyName,
  logoUrl,
  brandColor,
  bodyText,
  invoiceNumber,
  amountDue,
}: InvoiceEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        Invoice {invoiceNumber} from {companyName} — {amountDue} due
      </Preview>
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

          <Hr style={{ borderColor: '#e5e7eb', margin: '16px 0' }} />
          <Text style={{ fontSize: '12px', color: '#7b8699' }}>
            Invoice {invoiceNumber} is attached as a PDF.
          </Text>
          <Text style={{ fontSize: '11px', color: '#9ca3af' }}>
            Sent by {companyName} via {brand.name}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
