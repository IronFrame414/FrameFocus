import {
  Body,
  Button,
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
// THE CTA BUTTON IS NOW CONDITIONAL [7G §5.4, S180]. Superseded note, quoted
// rather than deleted: "NO CTA BUTTON, deliberately. A change order has
// somewhere to send the client (the signing link); an invoice does not —
// payment is QuickBooks-hosted and 7G is not built. … Add the button here when
// 7G lands; the attachment path is unchanged." 7G landed; this is that button,
// and the attachment path is indeed unchanged.
//
// ⚠️ IT RENDERS ONLY WHEN A LINK EXISTS, AND ON A FIRST SEND IT USUALLY DOES
// NOT. The link is minted by QuickBooks when the invoice is PUSHED, and the
// push is QUEUED — sending is deliberately not coupled to Intuit being
// reachable (7g2 §1.10). The drain runs every five minutes, so a first email
// typically goes out without the button and a re-send carries it. It is also
// absent FOREVER when the connected QuickBooks company has no QuickBooks
// Payments — RULED NON-BLOCKING [S103 Q10].
//
// ⚠️ AND THERE IS NO "YOU CANNOT PAY HERE" COPY when the link is absent
// (7g1 #3): a viewable bill, not an explanation. Do not add one.

export interface InvoiceEmailProps {
  companyName: string;
  logoUrl: string | null;
  brandColor: string;
  bodyText: string;
  invoiceNumber: string;
  amountDue: string;
  /**
   * 7G §5.4 — the stored QuickBooks pay-link (`invoices.qb_invoice_link`).
   * Null is the normal case, not an error. See the header.
   */
  payLink?: string | null;
}

export function InvoiceEmail({
  companyName,
  logoUrl,
  brandColor,
  bodyText,
  invoiceNumber,
  amountDue,
  payLink = null,
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

          {payLink ? (
            <>
              <Button
                href={payLink}
                style={{
                  backgroundColor: brandColor,
                  color: '#ffffff',
                  fontSize: '14px',
                  fontWeight: 600,
                  padding: '12px 24px',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  display: 'inline-block',
                  margin: '8px 0',
                }}
              >
                Pay {amountDue} online
              </Button>
              {/* ⚠️ AN INTUIT COMMITMENT, NOT A NICETY — 7g2 §5.5, placement 2.
                  Josh answered YES to Intuit on product disclosure and they
                  review against what was declared. This line goes wherever the
                  pay affordance goes. Do not remove it. */}
              <Text style={{ fontSize: '11px', color: '#9ca3af', margin: '4px 0 0' }}>
                Payment service provided by Intuit Payments Inc.
              </Text>
            </>
          ) : null}

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
