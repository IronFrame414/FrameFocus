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

// ============================================================================
// [S175 stage 6] The mail that DELIVERS the specifications sheet. Spec §7.3.
// ============================================================================
//
// Sibling of SelectionReleasedEmail and deliberately a DIFFERENT message. That
// one asks the client to CHOOSE and its call to action is the portal picker;
// this one tells her what she chose and its payload is the PDF. They carry
// different `email_type`s for the same reason (20261036000000).
//
// ⚠️ NO MONEY, and the props type is the contract — no amount, no markup, no
// variance, so a future edit cannot "just show the total" without changing this
// interface. It is the sheet's own rule (§9.4) and the same rule the released
// email already keeps; an email that quoted a figure the attachment does not
// show would be the two halves of one delivery disagreeing.
//
// ⚠️ THE CTA IS THE PORTAL FILES PAGE, NOT A SIGNED URL. The PDF is attached,
// so the button is for the copy that keeps working after the mail is buried:
// the sheet is filed `client_visible` (Q4.2) and appears in her portal. A
// signed storage URL in an email expires and turns into a dead link on a
// document people keep.
//
// ⚠️ AND IT SAYS WHAT THE SHEET IS A SNAPSHOT OF. Q4.1 replaces the filed
// artifact on every regeneration, so the client can receive two of these and
// hold two different documents. The "as of" date is in the body for that
// reason, not for decoration.

export interface SelectionSpecificationsEmailProps {
  companyName: string;
  logoUrl: string | null;
  brandColor: string;
  contactName: string;
  projectName: string;
  /** Already formatted in the company's timezone by the sender. */
  approvedAsOf: string;
  selectionCount: number;
  /** Names only. See the header: no money reaches this template. */
  selectionNames: string[];
  portalUrl: string;
}

export function SelectionSpecificationsEmail({
  companyName,
  logoUrl,
  brandColor,
  contactName,
  projectName,
  approvedAsOf,
  selectionCount,
  selectionNames,
  portalUrl,
}: SelectionSpecificationsEmailProps) {
  const heading =
    selectionCount === 1
      ? `Attached is the specifications sheet for ${projectName} — the selection you have approved so far.`
      : `Attached is the specifications sheet for ${projectName} — the ${selectionCount} selections you have approved so far.`;

  return (
    <Html>
      <Head />
      <Preview>
        Your specifications sheet for {projectName} — {companyName}
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

          <Text style={{ fontSize: '14px', lineHeight: '22px', color: '#374151' }}>
            Hi {contactName},
          </Text>
          <Text style={{ fontSize: '14px', lineHeight: '22px', color: '#374151' }}>{heading}</Text>

          <Section style={{ margin: '8px 0 4px' }}>
            {selectionNames.map((name, i) => (
              <Text
                key={i}
                style={{
                  fontSize: '14px',
                  lineHeight: '22px',
                  color: '#111827',
                  fontWeight: 600,
                  margin: '0 0 4px',
                  paddingLeft: '12px',
                  borderLeft: `3px solid ${brandColor}`,
                }}
              >
                {name}
              </Text>
            ))}
          </Section>

          <Text style={{ fontSize: '13px', lineHeight: '20px', color: '#6b7280' }}>
            It lists what has been approved as of {approvedAsOf}. Anything still being chosen is not
            on it yet — we will send an updated sheet as more is decided.
          </Text>

          <Section style={{ textAlign: 'center', margin: '28px 0' }}>
            <Button
              href={portalUrl}
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
              View It In Your Portal
            </Button>
          </Section>

          <Text style={{ fontSize: '12px', color: '#6b7280' }}>
            The sheet is attached to this email and is also filed in your project portal, so you can
            always find the current one there.
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
