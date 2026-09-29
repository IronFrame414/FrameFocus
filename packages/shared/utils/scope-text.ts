/**
 * C-12 [S115] — THE ONE READING OF A SCOPE SUMMARY.
 *
 * `estimates.scope_summary` (copied to `projects.scope_summary` on conversion)
 * is a plain textarea, and authors type markdown into it — `## Scope of Work`,
 * `### 1. Demolition`, `*` bullets — because nothing told them otherwise. Every
 * surface printed it raw, and the client signing page also dropped the line
 * breaks, so the proposal a client signed was one paragraph of `###` and `*`.
 *
 * PARITY [S122]: the PDF, the signing page, and the project overview on
 * desktop and /m all render THIS parse. The renderers differ (React-PDF needs
 * <Text>/<View>, the browser needs HTML); what the text MEANS does not, so it is
 * decided once, here, below the UI.
 *
 * A deliberately SMALL subset, and plain text is always a valid input:
 *   `#`, `##`, `###` … at line start  → heading (level 1–3; deeper = 3)
 *   `-`, `*`, `+`, `•` + space        → bullet item
 *   `1.` / `1)` + space               → numbered item (the author's numbers kept)
 *   `**bold**` / `__bold__`           → bold run, anywhere in a line
 *   blank line                         → paragraph break
 *   any other line                     → a line of the current paragraph; a single
 *                                        newline is KEPT as a line break, because
 *                                        that is what the author saw in the box
 * Nothing is ever dropped: an unmatched `**` prints as typed. No HTML is ever
 * produced from the text, so there is nothing to sanitize — renderers output
 * text nodes only.
 */

export type ScopeInline = { text: string; bold: boolean };
export type ScopeLine = ScopeInline[];

export type ScopeBlock =
  | { kind: 'heading'; level: 1 | 2 | 3; content: ScopeLine }
  | { kind: 'bullets'; items: ScopeLine[] }
  | { kind: 'numbered'; items: { marker: string; content: ScopeLine }[] }
  | { kind: 'paragraph'; lines: ScopeLine[] };

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const BULLET = /^[-*+•]\s+(.*)$/;
const NUMBERED = /^(\d{1,3})[.)]\s+(.*)$/;

/** `**bold**` and `__bold__` runs; everything else is plain. Unmatched markers print as typed. */
export function parseScopeInline(line: string): ScopeLine {
  const out: ScopeLine = [];
  // No lookbehind: Safari before 16.4 cannot parse one, and this runs on crew phones.
  const re = /(\*\*|__)(\S(?:.*?\S)?)\1/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) out.push({ text: line.slice(last, m.index), bold: false });
    out.push({ text: m[2], bold: true });
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ text: line.slice(last), bold: false });
  return out.length > 0 ? out : [{ text: '', bold: false }];
}

export function parseScopeText(raw: string | null | undefined): ScopeBlock[] {
  if (!raw) return [];
  const blocks: ScopeBlock[] = [];
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const prev = blocks[blocks.length - 1];

    if (line === '') {
      // A blank line ends a paragraph or a list; the next line starts fresh.
      if (prev && prev.kind !== 'heading') blocks.push({ kind: 'paragraph', lines: [] });
      continue;
    }

    const h = HEADING.exec(line);
    if (h) {
      const level = Math.min(h[1].length, 3) as 1 | 2 | 3;
      blocks.push({ kind: 'heading', level, content: parseScopeInline(h[2]) });
      continue;
    }

    const b = BULLET.exec(line);
    // `**bold** text` at line start is bold, not a bullet: BULLET needs a space after the marker.
    if (b) {
      const item = parseScopeInline(b[1]);
      if (prev?.kind === 'bullets') prev.items.push(item);
      else blocks.push({ kind: 'bullets', items: [item] });
      continue;
    }

    const n = NUMBERED.exec(line);
    if (n) {
      const item = { marker: `${n[1]}.`, content: parseScopeInline(n[2]) };
      if (prev?.kind === 'numbered') prev.items.push(item);
      else blocks.push({ kind: 'numbered', items: [item] });
      continue;
    }

    if (prev?.kind === 'paragraph') prev.lines.push(parseScopeInline(line));
    else blocks.push({ kind: 'paragraph', lines: [parseScopeInline(line)] });
  }

  // Blank-line placeholders that never received a line are not blocks.
  return blocks.filter((blk) => blk.kind !== 'paragraph' || blk.lines.length > 0);
}
