import { Body, Container, Head, Html, Preview, Text } from '@react-email/components';

// The warming email [Josh, 2026-09-10]. Copy approved verbatim; the SHAPE is
// the ruling.
//
// ⚠️ WHAT THIS TEMPLATE DELIBERATELY HAS NONE OF, and why each absence is
// load-bearing rather than minimal:
//
//   · NO BUTTON AND NO LINK. Ruled. These go to four real inboxes from
//     production. A link is the thing that could create an account, reach a
//     signing session, or take a payment — the constraint that killed every
//     other message type as a warming candidate. There is nothing here to
//     click, so there is nothing that can happen.
//   · NO LOGO, NO BRAND COLOUR, NO CHROME. Every other outbound template
//     carries the tenant's identity (`logoUrl`, `brandColor`) because it is a
//     business document. This is a note from a person. Chrome would make it
//     look like the near-duplicate template mail that got this domain
//     spam-foldered in the first place.
//   · NO RECORD REFERENCE. No estimate number, no invoice, no project. Nothing
//     in this message describes anything that exists.
//   · IT SAYS WHAT IT IS, in the body, in plain words. Ruled [Josh]: "Do not
//     dress it as something it isn't."
//
// The company's name is the ONLY variable, and it appears as text rather than
// as branding. Reply-To resolves to that company (sendEmail's replyToCompanyId),
// so a reply is a real reply to a real address.
export interface WarmingEmailProps {
  /** The full body, already composed. Blank lines separate paragraphs. */
  body: string;
  /** Preheader — the line Gmail shows next to the subject. */
  preview: string;
}

export function WarmingEmail({ body, preview }: WarmingEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: '#ffffff',
          fontFamily: 'Helvetica, Arial, sans-serif',
          margin: 0,
        }}
      >
        <Container style={{ margin: '24px auto', padding: '0 24px', maxWidth: '560px' }}>
          {body.split('\n\n').map((para, i) => (
            <Text
              key={i}
              style={{
                fontSize: '15px',
                lineHeight: '24px',
                color: '#1f2937',
                margin: '0 0 16px',
              }}
            >
              {para}
            </Text>
          ))}
        </Container>
      </Body>
    </Html>
  );
}
