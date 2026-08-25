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
// S174 #1 — the mail a RELEASE sends. Spec §6.1 (the offer arm).
// ============================================================================
//
// Modelled on ChangeOrderEmail so the two read as the same company writing:
// tenant logo in the header, tenant brand colour on the rule and the button,
// the product named ONLY in the footer attribution (CLAUDE.md white-label rule,
// asserted by `brand-email-footer.test.tsx`).
//
// ⚠️ IT LISTS THE SELECTIONS AND CARRIES NO MONEY. Not an oversight and not a
// styling choice — a structural one. Under the S173 client-choice model the
// release stamps NOTHING (`offered_*` stays NULL): there is no offered figure
// at this moment, because the figures are computed at the SIGNATURE from the
// client's own picks. An email that quoted a price here would be inventing one.
// The props type is the contract, exactly as `TabOption` is on the no-cost tab:
// there is no amount, no markup and no variance anywhere in it, so a future
// edit cannot "just show the total" without changing this interface.
//
// ⚠️ AND THE CTA GOES TO THE PORTAL, NOT TO A TOKEN LINK. A change order mails
// a tokenised `/sign-co/<token>` URL because a CO may be signed by someone with
// no account. A selection is PORTAL-ONLY by ruling — `completeSelectionSignature`
// has no token arm at all, deliberately ("a selection is portal-only", the one
// write path) — so the only honest destination is the portal she signs in to.

export interface SelectionReleasedEmailProps {
  companyName: string;
  logoUrl: string | null;
  brandColor: string;
  contactName: string;
  projectName: string;
  /** Names only. See the header: no money reaches this template. */
  selectionNames: string[];
  /** Already-formatted, or null when none of the released selections has one. */
  dueDateLine: string | null;
  portalUrl: string;
}

export function SelectionReleasedEmail({
  companyName,
  logoUrl,
  brandColor,
  contactName,
  projectName,
  selectionNames,
  dueDateLine,
  portalUrl,
}: SelectionReleasedEmailProps) {
  const n = selectionNames.length;
  const heading =
    n === 1
      ? `There is a selection ready for you to choose on ${projectName}.`
      : `There are ${n} selections ready for you to choose on ${projectName}.`;

  return (
    <Html>
      <Head />
      <Preview>
        {n === 1 ? 'A selection is' : `${n} selections are`} ready for you to choose — {companyName}
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

          {dueDateLine ? (
            <Text style={{ fontSize: '13px', lineHeight: '20px', color: '#6b7280' }}>
              {dueDateLine}
            </Text>
          ) : null}

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
              {n === 1 ? 'Make Your Selection' : 'Make Your Selections'}
            </Button>
          </Section>

          <Text style={{ fontSize: '12px', color: '#6b7280' }}>
            Sign in to your project portal to see the options, pick what you want, and approve. You
            approve each selection separately, so there is no need to do them all at once.
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
