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

// S107 Part B — the bid request a subcontractor receives.
//
// ⚠️ RULED: A SUMMARY PLUS A LINK. NOT THE DETAIL.
// The detail lives behind the token, where it is scoped to one request and can
// expire. An email cannot be revoked, cannot expire, and is forwarded — so
// anything put in the body is disclosed permanently to whoever it reaches.
//
// ⚠️ AND NO MONEY, WITH ONE RULED EXCEPTION THAT IS DELIBERATELY NOT TAKEN HERE.
// S107 Q2 amended "the sub sees NO money" to mean totals, margin and cost, and
// recorded `allowance_amount` as a permanent exception — on the PAGE. This
// template still omits it, because the page's exception rests on the token
// scoping the disclosure to one sub, and an email has no such scoping. The
// allowance is one click away for the intended recipient and absent from the
// forwardable artifact. **If a future session adds it here, that is a change to
// the ruling's reasoning, not a formatting tweak.**

export interface SubBidRequestEmailProps {
  companyName: string;
  logoUrl: string | null;
  brandColor: string;
  subcontractorName: string;
  /** The line being bid — a name, never a price. */
  lineItemName: string;
  projectLabel: string | null;
  /** Free text the estimator wrote. Rendered verbatim, line by line. */
  message: string | null;
  bidsDueDate: string | null;
  replyUrl: string;
  expiresOn: string;
}

export function SubBidRequestEmail({
  companyName,
  logoUrl,
  brandColor,
  subcontractorName,
  lineItemName,
  projectLabel,
  message,
  bidsDueDate,
  replyUrl,
  expiresOn,
}: SubBidRequestEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        {companyName} is requesting a bid{lineItemName ? ` for ${lineItemName}` : ''}
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
            {subcontractorName ? `${subcontractorName},` : 'Hello,'}
          </Text>
          <Text style={{ fontSize: '14px', lineHeight: '22px', color: '#3f4a60' }}>
            {companyName} is requesting a bid from you{projectLabel ? ` on ${projectLabel}` : ''}.
          </Text>

          {/* THE SUMMARY — what is being bid, and by when. No amounts. */}
          <Section style={{ margin: '16px 0' }}>
            <Text style={{ fontSize: '14px', lineHeight: '22px', color: '#0f1729', margin: 0 }}>
              <strong>Scope:</strong> {lineItemName || 'See the bid request'}
            </Text>
            {bidsDueDate ? (
              <Text style={{ fontSize: '14px', lineHeight: '22px', color: '#0f1729', margin: 0 }}>
                <strong>Bids due:</strong> {bidsDueDate}
              </Text>
            ) : null}
          </Section>

          {message
            ? message.split('\n').map((line, i) => (
                <Text key={i} style={{ fontSize: '14px', lineHeight: '22px', color: '#3f4a60' }}>
                  {line}
                </Text>
              ))
            : null}

          <Section style={{ textAlign: 'center', margin: '28px 0' }}>
            <Button
              href={replyUrl}
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
              View the scope &amp; submit your bid
            </Button>
          </Section>

          <Text style={{ fontSize: '12px', lineHeight: '18px', color: '#7b8699' }}>
            The link opens your bid form, where you can download the plans and attach your quote.
            It expires on {expiresOn}.
          </Text>
          <Text style={{ fontSize: '12px', lineHeight: '18px', color: '#7b8699', wordBreak: 'break-all' }}>
            {replyUrl}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
