import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { parseTermsInline, parseTermsText, TERMS_FORMATS } from '@framefocus/shared/utils/terms-text';
import { TermsTextHtml } from '@/lib/proposal/terms-text-html';
import { ProposalHtml } from '@/lib/proposal/proposal-html';
import { ProposalDocument } from '@/lib/proposal/proposal-template';
import { fixture } from './s128-proposal-fixture';
import { pdfText } from './pdf-text';
import zlib from 'node:zlib';

// S128 Part D — rich text on Terms. D-1: EXACTLY six formats. D-2: PDF parity is the gate.
// D-3: sanitized on the way out. D-4: existing plain terms survive unharmed.

const ALL_SIX = [
  'Payment is due **within 30 days** of invoice.',
  'Work is *warranted* for ++one year++ from completion.',
  '- Exclusions:',
  '  - permits and fees',
  '  - hazardous material',
  '    - asbestos testing',
  '1. Deposit',
  '2. Progress billing',
  '  An indented paragraph under item two.',
  '',
  'Signed ______ date ______',
].join('\n');

describe('D-1 — the parse produces the six formats and nothing else', () => {
  it('bold, italic, underline runs', () => {
    expect(parseTermsInline('a **b** c')).toEqual([
      { text: 'a ', bold: false, italic: false, underline: false },
      { text: 'b', bold: true, italic: false, underline: false },
      { text: ' c', bold: false, italic: false, underline: false },
    ]);
    expect(parseTermsInline('*i*')[0]).toMatchObject({ text: 'i', italic: true, bold: false });
    expect(parseTermsInline('++u++')[0]).toMatchObject({ text: 'u', underline: true });
    expect(parseTermsInline('**bold ++and under++**')).toEqual([
      { text: 'bold ', bold: true, italic: false, underline: false },
      { text: 'and under', bold: true, italic: false, underline: true },
    ]);
  });

  it('unmatched or space-padded markers print as typed; ____ fill-in blanks are untouched', () => {
    expect(parseTermsInline('a ** b')).toEqual([{ text: 'a ** b', bold: false, italic: false, underline: false }]);
    expect(parseTermsInline('Signed ______ date ______').map((r) => r.text).join('')).toBe('Signed ______ date ______');
    expect(parseTermsInline('5 * 3 = 15 * 1')).toHaveLength(1);
  });

  it('rows: bullets, numbers, indent levels, nesting, a break', () => {
    const rows = parseTermsText(ALL_SIX);
    expect(rows.map((r) => (r.kind === 'break' ? 'break' : `${r.kind}@${r.level}`))).toEqual([
      'text@0',
      'text@0',
      'bullet@0',
      'bullet@1',
      'bullet@1',
      'bullet@2',
      'number@0',
      'number@0',
      'text@1',
      'break',
      'text@0',
    ]);
  });

  it('⚠️ a heading, a link, a table or HTML is NOT a format — it prints as its characters', () => {
    const rows = parseTermsText('# Heading\n[link](http://x)\n| a | b |\n<b>x</b>');
    expect(rows.every((r) => r.kind === 'text')).toBe(true);
    const text = rows.map((r) => (r.kind === 'break' ? '' : r.runs.map((x) => x.text).join(''))).join('|');
    expect(text).toBe('# Heading|[link](http://x)|| a | b ||<b>x</b>');
    expect([...TERMS_FORMATS]).toEqual(['bold', 'italic', 'underline', 'bullet', 'number', 'indent']);
  });
});

describe('D-3 — sanitized on the way OUT: a script tag is text in the rendered bytes', () => {
  const evil = '**Terms** <script>alert(1)</script> <img src=x onerror=alert(2)>';
  it('the browser renderer escapes it (server render, the bytes the client receives)', () => {
    const html = renderToStaticMarkup(<TermsTextHtml text={evil} />);
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('<span style="font-weight:700">Terms</span>');
  });

  it('…and through the whole signing page', () => {
    const d = fixture('itemized');
    d.estimate.termsSections = [{ name: 'Payment', content: evil, format: 'rich' }];
    const page = renderToStaticMarkup(<ProposalHtml data={d} />);
    expect(page).not.toContain('<script>alert(1)');
    expect(page).toContain('&lt;script&gt;');
  });
});

describe('D-4 — existing PLAIN terms render exactly as before', () => {
  it('a section without format renders the pre-wrap block it always did, and is never parsed', () => {
    const d = fixture('itemized');
    const legacy = 'Payment due **net 30**.\n- not a bullet here\n  indented as typed';
    d.estimate.termsSections = [{ name: 'Payment', content: legacy }];
    const page = renderToStaticMarkup(<ProposalHtml data={d} />);
    expect(page).toContain(
      '<div style="white-space:pre-wrap;font-size:0.875rem;color:#374151">Payment due **net 30**.\n- not a bullet here\n  indented as typed</div>'
    );
    expect(page).not.toContain('data-testid="terms-rich"');
  });
});

describe('D-2 — PDF parity: every format renders in the PDF, read back from the PDF itself', () => {
  async function pdfOf(content: string) {
    const d = fixture('itemized');
    d.estimate.termsSections = [{ name: 'Contract Terms', content, format: 'rich' }];
    return renderToBuffer(<ProposalDocument data={d} />);
  }

  function contentStreams(buf: Buffer): string {
    const bin = buf.toString('latin1');
    let out = '';
    const re = /\/Length (\d+)[^>]*>>\s*stream\r?\n/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(bin)) !== null) {
      const raw = Buffer.from(bin.slice(m.index + m[0].length, m.index + m[0].length + Number(m[1])), 'latin1');
      try {
        out += zlib.inflateSync(raw).toString('latin1');
      } catch {
        /* not a deflate stream */
      }
    }
    return out;
  }

  it('the text of every row is in the PDF, bullets and numbers included', async () => {
    const text = pdfText(await pdfOf(ALL_SIX));
    for (const s of ['within 30 days', 'warranted', 'one year', 'permits and fees', 'asbestos testing', 'Deposit', 'Progress billing', 'An indented paragraph']) {
      expect(text, s).toContain(s);
    }
    expect(text).not.toContain('**');
    expect(text).not.toContain('++');
  });

  it('bold, italic and underline reach the PDF as real faces / a drawn rule', async () => {
    const buf = await pdfOf('**BOLDRUN** *ITALICRUN* ++UNDERRUN++');
    const bin = buf.toString('latin1');
    expect(bin).toContain('/BaseFont /Helvetica-Bold');
    expect(bin).toContain('/BaseFont /Helvetica-Oblique');
    // Underline: React-PDF draws it as a filled rectangle ('re' … 'f') under the run.
    const plain = contentStreams(await pdfOf('UNDERRUN'));
    const under = contentStreams(await pdfOf('++UNDERRUN++'));
    const rects = (s: string) => (s.match(/\bre\b/g) ?? []).length;
    expect(rects(under)).toBeGreaterThan(rects(plain));
  });
});
