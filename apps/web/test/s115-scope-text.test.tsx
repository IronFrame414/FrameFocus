import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { parseScopeText } from '@framefocus/shared/utils/scope-text';
import type { ProposalData } from '@/lib/proposal/proposal-data';
import { ProposalHtml } from '@/lib/proposal/proposal-html';
import { ProposalDocument } from '@/lib/proposal/proposal-template';
import { trimProposalForClient } from '@/lib/proposal/client-proposal';
import { ScopeTextHtml } from '@/lib/proposal/scope-text-html';
import { pdfText } from './pdf-text';

// C-12 [S115] — "The scope is authored in markdown and the proposal renders it
// raw: `## Scope of Work`, `### 1.` and `*` bullets print as literal
// characters, and in the sent version the whole thing collapses into a single
// paragraph." [Josh, 2026-09-28, two screenshots]
//
// Asserted on EVERY surface that renders the summary, through what each one
// actually calls: the PDF (ProposalDocument → renderToBuffer, the builder
// preview, generate/send/resend and the signing service), the client signing
// page (ProposalHtml over the TRIMMED client payload, as sign/[token] serves
// it), and the shared browser renderer both project overviews mount.

/** The shape in Josh's screenshots: headings, a numbered heading, star bullets, bold. */
const AUTHORED = [
  '## Scope of Work',
  '',
  'Full kitchen remodel at the **main house**.',
  'Work begins after permit approval.',
  '',
  '### 1. Demolition',
  '* Remove existing cabinets',
  '* Remove flooring to subfloor',
  '',
  '### 2. Framing',
  '- Frame the new pantry wall',
  '',
  '1. Rough-in',
  '2. Inspection',
].join('\n');

describe('parseScopeText — the one reading of a scope summary', () => {
  it('reads headings, bullets, numbered items, paragraphs and bold', () => {
    const b = parseScopeText(AUTHORED);
    expect(b.map((x) => x.kind)).toEqual([
      'heading',
      'paragraph',
      'heading',
      'bullets',
      'heading',
      'bullets',
      'numbered',
    ]);
    expect(b[0]).toEqual({ kind: 'heading', level: 2, content: [{ text: 'Scope of Work', bold: false }] });
    // A single newline inside a paragraph is KEPT — two lines, not one.
    const para = b[1];
    expect(para.kind === 'paragraph' && para.lines.length).toBe(2);
    expect(para.kind === 'paragraph' && para.lines[0]).toEqual([
      { text: 'Full kitchen remodel at the ', bold: false },
      { text: 'main house', bold: true },
      { text: '.', bold: false },
    ]);
    const bullets = b[3];
    expect(bullets.kind === 'bullets' && bullets.items.length).toBe(2);
    const numbered = b[6];
    expect(numbered.kind === 'numbered' && numbered.items.map((i) => i.marker)).toEqual(['1.', '2.']);
  });

  it('plain text stays plain: every line kept, nothing dropped', () => {
    const b = parseScopeText('Line one\nLine two\n\nNew paragraph');
    expect(b).toHaveLength(2);
    expect(b[0].kind === 'paragraph' && b[0].lines).toHaveLength(2);
  });

  it('an unmatched ** prints as typed; CRLF reads like LF; empty input is nothing', () => {
    const b = parseScopeText('Price is 2 ** 3\r\nnext');
    expect(b[0].kind === 'paragraph' && b[0].lines[0]).toEqual([{ text: 'Price is 2 ** 3', bold: false }]);
    expect(b[0].kind === 'paragraph' && b[0].lines).toHaveLength(2);
    expect(parseScopeText('')).toEqual([]);
    expect(parseScopeText(null)).toEqual([]);
  });

  it('`**bold** start` is a bold run, not a bullet', () => {
    const b = parseScopeText('**Note:** client supplies tile');
    expect(b[0].kind).toBe('paragraph');
  });
});

/** Minimal proposal carrying the authored scope; lump-sum, so the client payload is trimmed. */
function proposal(scopeSummary: string | null): ProposalData {
  return {
    company: {
      name: 'Acme Build',
      logoUrl: null,
      brandColor: '#3b4ae0',
      addressLine1: '1 Main',
      addressLine2: null,
      city: 'Tampa',
      state: 'FL',
      zip: '33601',
      phone: null,
      email: null,
      licenseNumber: null,
    },
    estimate: {
      id: 'e1',
      number: 'EST-1',
      version: 'v1.1',
      name: 'Kitchen',
      status: 'sent',
      date: '2026-09-01',
      expiresAt: null,
      expirationDays: 30,
      pricingLevel: 'total_only',
      coverLetter: null,
      scopeSummary,
      scopeSections: [],
      termsSections: [],
      subtotal: 100,
      taxTotal: 0,
      discountTotal: 0,
      grandTotal: 100,
    },
    client: { name: 'Pat Client', companyName: null, email: null },
    jobSite: null,
    categories: [],
    allowances: [],
  };
}

/** The markup that leaked before: a heading marker or a star bullet printed as text. */
const RAW_MARKUP = /##|^\s*\*\s|\*\*/m;

describe('C-12 · the client signing page (ProposalHtml over the trimmed client payload)', () => {
  const page = renderToStaticMarkup(
    <ProposalHtml data={trimProposalForClient(proposal(AUTHORED))} />
  );
  const scope = page.slice(page.indexOf('data-testid="proposal-scope-summary"'));

  it('renders structure — headings, lists, separate paragraphs — not one paragraph', () => {
    expect(page).toContain('data-testid="proposal-scope-summary"');
    expect((scope.match(/role="heading"/g) ?? []).length).toBe(3);
    expect((scope.match(/<ul/g) ?? []).length).toBe(2);
    expect((scope.match(/<ol/g) ?? []).length).toBe(1);
    expect(scope).toContain('<strong>main house</strong>');
    expect(scope).toContain('<br/>'); // the kept line break inside the first paragraph
  });

  it('prints no raw markdown', () => {
    const text = scope.replace(/<[^>]+>/g, '\n');
    expect(text).not.toMatch(RAW_MARKUP);
    expect(text).toContain('Scope of Work');
    expect(text).toContain('1. Demolition');
    expect(text).toContain('Remove existing cabinets');
  });
});

describe('C-12 · the PDF (ProposalDocument → renderToBuffer, as generate/send/resend/sign produce it)', () => {
  it('prints the words without the markup', async () => {
    const text = pdfText(await renderToBuffer(<ProposalDocument data={proposal(AUTHORED)} />));
    expect(text).toContain('Scope of Work');
    expect(text).toContain('1. Demolition');
    expect(text).toContain('Remove existing cabinets');
    expect(text).toContain('main house');
    expect(text).not.toMatch(/##/);
    expect(text).not.toMatch(/\*\*/);
    // Star bullets become the PDF's own bullet glyph, never a literal "* ".
    expect(text).not.toMatch(/(^|\n)\s*\*\s/);
  });
});

describe('C-12 · the project overview renderer (desktop and /m mount the same component)', () => {
  it('same structure as the signing page, from the same parse', () => {
    const html = renderToStaticMarkup(<ScopeTextHtml text={AUTHORED} />);
    expect((html.match(/role="heading"/g) ?? []).length).toBe(3);
    expect(html.replace(/<[^>]+>/g, '\n')).not.toMatch(RAW_MARKUP);
  });

  it('renders nothing for an empty summary', () => {
    expect(renderToStaticMarkup(<ScopeTextHtml text="" />)).toBe('');
  });
});
