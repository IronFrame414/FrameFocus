import { Body, Container, Head, Hr, Html, Img, Preview, Text } from '@react-email/components';

// PO module R-L4 — the purchase-order email. It leaves the building, so per
// the ruled email/PDF boundary (desktop-redesign spec §2, Entry 5) it carries
// THE CONTRACTOR'S identity — brandColor and logo as data — over the
// platform's grey chrome. The invoice-email shape, verbatim posture.

export interface PoEmailProps {
  companyName: string;
  logoUrl: string | null;
  brandColor: string;
  poNumber: string;
  projectName: string;
  needBy: string | null;
  totalLabel: string;
}

export function PoEmail({
  companyName,
  logoUrl,
  brandColor,
  poNumber,
  projectName,
  needBy,
  totalLabel,
}: PoEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        Purchase order {poNumber} from {companyName}
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

          <Text style={{ fontSize: '14px', lineHeight: '22px', color: '#3f4a60' }}>
            Please find attached purchase order {poNumber} for {projectName}
            {needBy ? `, needed by ${needBy}` : ''}. Order total: {totalLabel}.
          </Text>
          <Text style={{ fontSize: '14px', lineHeight: '22px', color: '#3f4a60' }}>
            Reply to this email with any questions about availability or pricing.
          </Text>

          <Hr style={{ borderColor: '#e5e7eb', margin: '16px 0' }} />
          <Text style={{ fontSize: '12px', color: '#7b8699' }}>
            Purchase order {poNumber} is attached as a PDF.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
