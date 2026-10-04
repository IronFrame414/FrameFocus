'use client';

/**
 * S128 Part D — the Terms section editor, ONE component for the estimate's Terms tab and the
 * company's default terms (Settings → Estimating). PARITY: in components/, not under one surface.
 *
 * [Josh, 2026-10-03] "this wipes formatting just like scope of work did. I want to have full
 * formatting capabilities, bold, underline, bullet points, etc" — D-1: exactly six formats.
 *
 *   · a toolbar for the six (bold, italic, underline, bullets, numbers, indent/outdent),
 *   · a PASTE that keeps those six from formatted text (Word, a web page, an email) and drops
 *     everything else (headings, tables, links, fonts, sizes, colours — excluded by ruling),
 *   · a live preview drawn by the SAME renderer the client's signing page uses.
 *
 * D-4: a section saved here is `format: 'rich'`. A section that predates S128 stays PLAIN — it
 * renders exactly as it always did — until a person turns formatting on for THAT section, with
 * the preview showing first what the text will look like. No migration touches contract language.
 */

import { useRef } from 'react';
import { TermsTextHtml } from '@/lib/proposal/terms-text-html';

type Format = 'rich' | undefined;

const btn: React.CSSProperties = {
  minWidth: '2rem',
  height: '1.9rem',
  padding: '0 0.45rem',
  border: '1px solid #d5dae4',
  borderRadius: '0.3rem',
  background: '#fff',
  fontSize: '0.8125rem',
  cursor: 'pointer',
};

/** Clipboard HTML → the six-format markup. Exported for tests. Anything not in the six becomes
 *  plain text; nothing is ever turned into HTML. */
export function htmlToTermsMarkup(html: string): string {
  if (typeof DOMParser === 'undefined') return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const lines: string[] = [];
  let current = '';
  const flush = () => {
    if (current.trim() !== '' || lines.length === 0 || lines[lines.length - 1] !== '') {
      lines.push(current.replace(/\s+$/, ''));
    }
    current = '';
  };
  const walk = (node: Node, ctx: { level: number; ordered: boolean[]; counters: number[] }) => {
    if (node.nodeType === Node.TEXT_NODE) {
      current += (node.textContent ?? '').replace(/\s+/g, ' ');
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const style = el.getAttribute('style') ?? '';
    const bold = tag === 'b' || tag === 'strong' || /font-weight:\s*(bold|[6-9]00)/i.test(style);
    const italic = tag === 'i' || tag === 'em' || /font-style:\s*italic/i.test(style);
    const underline = tag === 'u' || /text-decoration[^;]*underline/i.test(style);
    if (tag === 'br') {
      flush();
      return;
    }
    if (tag === 'ul' || tag === 'ol') {
      if (current.trim()) flush();
      const inner = { level: ctx.level + 1, ordered: [...ctx.ordered, tag === 'ol'], counters: [...ctx.counters, 0] };
      el.childNodes.forEach((c) => walk(c, inner));
      return;
    }
    if (tag === 'li') {
      if (current.trim()) flush();
      const depth = Math.max(ctx.level - 1, 0);
      const ordered = ctx.ordered[ctx.ordered.length - 1] ?? false;
      if (ordered) ctx.counters[ctx.counters.length - 1] += 1;
      current = '  '.repeat(depth) + (ordered ? `${ctx.counters[ctx.counters.length - 1]}. ` : '- ');
      el.childNodes.forEach((c) => walk(c, ctx));
      flush();
      return;
    }
    const block = ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr', 'blockquote'].includes(tag);
    if (block && current.trim()) flush();
    const open = (bold ? '**' : '') + (underline ? '++' : '') + (italic ? '*' : '');
    const close = (italic ? '*' : '') + (underline ? '++' : '') + (bold ? '**' : '');
    const before = current.length;
    current += open;
    el.childNodes.forEach((c) => walk(c, ctx));
    if (current.length === before + open.length) current = current.slice(0, before); // empty run
    else current += close;
    if (block) flush();
  };
  doc.body.childNodes.forEach((c) => walk(c, { level: 0, ordered: [], counters: [] }));
  if (current.trim()) flush();
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function TermsContentEditor({
  value,
  format,
  disabled,
  onChange,
  onCommit,
  testId = 'terms-editor',
}: {
  value: string;
  format: Format;
  disabled?: boolean;
  /** Every keystroke / toolbar action. */
  onChange: (content: string, format: Format) => void;
  /** When the change should be saved (blur, toolbar). */
  onCommit: (content: string, format: Format) => void;
  testId?: string;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const rich = format === 'rich';

  function apply(next: string, selStart: number, selEnd: number) {
    onChange(next, 'rich');
    onCommit(next, 'rich');
    requestAnimationFrame(() => {
      const ta = ref.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(selStart, selEnd);
    });
  }

  function wrap(marker: string) {
    const ta = ref.current;
    if (!ta) return;
    const { selectionStart: a, selectionEnd: b } = ta;
    const sel = value.slice(a, b) || 'text';
    const next = value.slice(0, a) + marker + sel + marker + value.slice(b);
    apply(next, a + marker.length, a + marker.length + sel.length);
  }

  function eachLine(fn: (line: string, n: number) => string) {
    const ta = ref.current;
    if (!ta) return;
    const { selectionStart: a, selectionEnd: b } = ta;
    const start = value.lastIndexOf('\n', a - 1) + 1;
    const endIdx = value.indexOf('\n', b);
    const end = endIdx === -1 ? value.length : endIdx;
    const block = value.slice(start, end).split('\n').map(fn).join('\n');
    const next = value.slice(0, start) + block + value.slice(end);
    apply(next, start, start + block.length);
  }

  const strip = (l: string) => l.replace(/^(\s*)(?:[-•]\s+|\d{1,3}[.)]\s+)/, '$1');

  return (
    <div data-testid={testId}>
      {rich ? (
        <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.35rem', flexWrap: 'wrap' }} role="toolbar" aria-label="Formatting">
          <button type="button" style={{ ...btn, fontWeight: 700 }} disabled={disabled} onClick={() => wrap('**')} aria-label="Bold" data-testid={`${testId}-bold`}>
            B
          </button>
          <button type="button" style={{ ...btn, fontStyle: 'italic' }} disabled={disabled} onClick={() => wrap('*')} aria-label="Italic" data-testid={`${testId}-italic`}>
            I
          </button>
          <button type="button" style={{ ...btn, textDecoration: 'underline' }} disabled={disabled} onClick={() => wrap('++')} aria-label="Underline" data-testid={`${testId}-underline`}>
            U
          </button>
          <button type="button" style={btn} disabled={disabled} onClick={() => eachLine((l) => l.replace(/^(\s*)/, '$1- ').replace(/^(\s*)- (?:[-•]\s+|\d{1,3}[.)]\s+)/, '$1- '))} aria-label="Bulleted list" data-testid={`${testId}-bullets`}>
            • List
          </button>
          <button type="button" style={btn} disabled={disabled} onClick={() => eachLine((l, n) => strip(l).replace(/^(\s*)/, `$1${n + 1}. `))} aria-label="Numbered list" data-testid={`${testId}-numbers`}>
            1. List
          </button>
          <button type="button" style={btn} disabled={disabled} onClick={() => eachLine((l) => `  ${l}`)} aria-label="Indent" data-testid={`${testId}-indent`}>
            ⇥
          </button>
          <button type="button" style={btn} disabled={disabled} onClick={() => eachLine((l) => l.replace(/^ {1,2}/, ''))} aria-label="Outdent" data-testid={`${testId}-outdent`}>
            ⇤
          </button>
          {!disabled && (
            <button
              type="button"
              style={{ ...btn, marginLeft: 'auto', border: 'none', color: '#7b8699', fontSize: '0.75rem' }}
              onClick={() => {
                onChange(value, undefined);
                onCommit(value, undefined);
              }}
              data-testid={`${testId}-disable`}
            >
              Turn off formatting
            </button>
          )}
        </div>
      ) : (
        <div style={{ fontSize: '0.75rem', color: '#7b8699', marginBottom: '0.35rem' }}>
          Plain text — this section was written before formatting existed and prints exactly as typed.{' '}
          {!disabled && (
            <button
              type="button"
              data-testid={`${testId}-enable`}
              onClick={() => {
                onChange(value, 'rich');
                onCommit(value, 'rich');
              }}
              style={{ ...btn, height: 'auto', padding: '0.1rem 0.4rem', fontSize: '0.75rem' }}
            >
              Turn on formatting
            </button>
          )}
        </div>
      )}
      <textarea
        ref={ref}
        data-testid={`${testId}-text`}
        value={value}
        disabled={disabled}
        rows={6}
        onChange={(e) => onChange(e.target.value, format)}
        onBlur={(e) => onCommit(e.target.value, format)}
        onPaste={(e) => {
          if (!rich) return;
          const html = e.clipboardData.getData('text/html');
          if (!html) return;
          const markup = htmlToTermsMarkup(html);
          if (!markup) return;
          e.preventDefault();
          const ta = e.currentTarget;
          const { selectionStart: a, selectionEnd: b } = ta;
          const next = value.slice(0, a) + markup + value.slice(b);
          onChange(next, 'rich');
          requestAnimationFrame(() => ta.setSelectionRange(a + markup.length, a + markup.length));
        }}
        placeholder={
          rich
            ? 'Section content — **bold**, *italic*, ++underline++, "- " bullets, "1. " numbers, two spaces to indent'
            : 'Section content (plain text)'
        }
        style={{
          width: '100%',
          padding: '0.5rem',
          border: '1px solid #d5dae4',
          borderRadius: '0.375rem',
          fontSize: '0.875rem',
          fontFamily: rich ? 'var(--font-mono, monospace)' : 'inherit',
          resize: 'vertical',
        }}
      />
      {rich && value.trim() !== '' && (
        <div data-testid={`${testId}-preview`} style={{ marginTop: '0.4rem', padding: '0.5rem 0.75rem', background: '#fafbfc', border: '1px dashed #d5dae4', borderRadius: '0.375rem' }}>
          <div style={{ fontSize: '0.6875rem', color: '#7b8699', marginBottom: '0.25rem' }}>As the client will see it</div>
          <TermsTextHtml text={value} />
        </div>
      )}
    </div>
  );
}
