/**
 * S128 Part D — THE ONE READING OF A RICH-TEXT TERMS SECTION.
 * docs/specs/estimates-and-change-orders-spec.md Part D.
 *
 * [Josh, 2026-10-03] "I want to have full formatting capabilities, bold, underline, bullet points,
 * etc" … D-1 RULED and CLOSED: "everything listed on A plus indent. no need for anything else".
 *
 * EXACTLY SIX FORMATS, and nothing else is ever produced:
 *   1. bold        **text**
 *   2. italic      *text*      (NOT _text_: contracts carry ____ fill-in blanks, which it would eat)
 *   3. underline   ++text++
 *   4. bulleted    "- " or "• " at the start of a line
 *   5. numbered    "1. " or "1) " at the start of a line (the author's numbers kept)
 *   6. indent      two leading spaces per level, on any line — a paragraph line or a list item
 *                  (an indented list item IS the nested list)
 * ⚠️ DELIBERATELY EXCLUDED, so nobody "completes the set": headings, tables, links, fonts, sizes,
 * colours. A `#` at line start prints as typed. Fonts/sizes/colours would let a terms section look
 * unlike the document around it; tables are the hardest thing to render faithfully in a PDF, and
 * Josh was asked directly and said no.
 *
 * WHY THIS SHAPE (D-4, decided S128): the stored form is TEXT with a small markup, because the PDF
 * is the hard half (D-2: PDF parity is the gate). Both renderers draw THIS parse — the HTML one
 * (lib/proposal/terms-text-html.tsx) and the React-PDF one (terms-text-pdf.tsx) — as the same rows:
 * an optional marker column, then runs, indented by level. Nesting and indent are therefore one
 * number on a row, which both renderers turn into the same left offset.
 *
 * D-3 SANITIZING: nothing here produces HTML. The renderers emit text nodes inside an allowlist of
 * six styles, so `<script>` typed into a section is drawn as the characters `<script>` — it is
 * neutralised by construction on every render, server-side, on the way OUT.
 *
 * D-4 EXISTING TERMS: only a section saved by the rich editor carries `format: 'rich'`. A section
 * without it renders exactly as before (plain, pre-wrap) — no existing contract language is
 * reparsed, and no migration touches it.
 */

export type TermsRun = { text: string; bold: boolean; italic: boolean; underline: boolean };

export type TermsRow =
  | { kind: 'text'; level: number; runs: TermsRun[] }
  | { kind: 'bullet'; level: number; runs: TermsRun[] }
  | { kind: 'number'; level: number; marker: string; runs: TermsRun[] }
  | { kind: 'break' };

export const TERMS_MAX_LEVEL = 4;

const BULLET = /^[-•]\s+(.*)$/;
const NUMBERED = /^(\d{1,3})[.)]\s+(.*)$/;

type Style = Omit<TermsRun, 'text'>;
const PLAIN: Style = { bold: false, italic: false, underline: false };

// Markers in precedence order. `**` before `*` so bold is never read as two italics.
const MARKERS: { open: string; key: keyof Style }[] = [
  { open: '**', key: 'bold' },
  { open: '++', key: 'underline' },
  { open: '*', key: 'italic' },
];

/** Inline runs. A marker counts only when it has a closing partner later in the line and wraps
 *  non-space text; an unmatched marker prints as typed. Nesting (**bold ++and underlined++**)
 *  combines styles. */
export function parseTermsInline(line: string, style: Style = PLAIN): TermsRun[] {
  let best: { at: number; end: number; inner: string; key: keyof Style; len: number } | null = null;
  for (const m of MARKERS) {
    let from = 0;
    while (from < line.length) {
      const at = line.indexOf(m.open, from);
      if (at === -1) break;
      const innerStart = at + m.open.length;
      const close = line.indexOf(m.open, innerStart + 1);
      if (close === -1) break;
      const inner = line.slice(innerStart, close);
      // `*` must not match inside `**`; the inner text must not start or end with a space.
      const doubledStar = m.open === '*' && (line[at + 1] === '*' || line[at - 1] === '*');
      if (!doubledStar && inner.length > 0 && !/^\s|\s$/.test(inner)) {
        if (!best || at < best.at) best = { at, end: close + m.open.length, inner, key: m.key, len: m.open.length };
        break;
      }
      from = at + 1;
    }
  }
  if (!best) return line.length ? [{ text: line, ...style }] : [];
  const out: TermsRun[] = [];
  if (best.at > 0) out.push({ text: line.slice(0, best.at), ...style });
  out.push(...parseTermsInline(best.inner, { ...style, [best.key]: true }));
  out.push(...parseTermsInline(line.slice(best.end), style));
  return out;
}

/** The whole section, as rows. Blank lines become a single `break`. */
export function parseTermsText(raw: string | null | undefined): TermsRow[] {
  if (!raw) return [];
  const rows: TermsRow[] = [];
  for (const rawLine of raw.replace(/\r\n?/g, '\n').split('\n')) {
    if (rawLine.trim() === '') {
      if (rows.length && rows[rows.length - 1].kind !== 'break') rows.push({ kind: 'break' });
      continue;
    }
    const lead = rawLine.match(/^[ \t]*/)![0].replace(/\t/g, '  ').length;
    const level = Math.min(Math.floor(lead / 2), TERMS_MAX_LEVEL);
    const line = rawLine.trim();
    const b = BULLET.exec(line);
    if (b) {
      rows.push({ kind: 'bullet', level, runs: parseTermsInline(b[1]) });
      continue;
    }
    const n = NUMBERED.exec(line);
    if (n) {
      rows.push({ kind: 'number', level, marker: `${n[1]}.`, runs: parseTermsInline(n[2]) });
      continue;
    }
    rows.push({ kind: 'text', level, runs: parseTermsInline(line) });
  }
  while (rows.length && rows[rows.length - 1].kind === 'break') rows.pop();
  return rows;
}

/** The six formats, named — the allowlist the renderers and the tests read. */
export const TERMS_FORMATS = ['bold', 'italic', 'underline', 'bullet', 'number', 'indent'] as const;

/** A terms section as stored in estimates.terms_sections / companies.default_terms_sections. */
export interface TermsSectionValue {
  name: string;
  content: string;
  /** 'rich' only when saved by the rich editor. Absent = the plain text it always was. */
  format?: 'rich';
}
