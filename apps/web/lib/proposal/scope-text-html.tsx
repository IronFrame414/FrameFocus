import type { CSSProperties } from 'react';
import { parseScopeText, type ScopeLine } from '@framefocus/shared/utils/scope-text';

// C-12 [S115] — the scope summary for the BROWSER: the client signing page,
// the desktop project overview and /m's project overview all render this.
// The PDF renders the SAME parse through `scope-text-pdf.tsx`; what the author's
// text means is decided once, in `@framefocus/shared/utils/scope-text`.
//
// Lives in lib/, not under app/m or app/dashboard: three surfaces (and a public
// page) share it [PARITY, S122]. Text nodes only — no HTML is ever built from
// the author's text, so there is nothing to sanitize.
//
// Size and colour are INHERITED from the caller's container; this sets only
// structure (headings, lists, paragraph spacing), so each surface keeps its own
// type scale.

function Inline({ line }: { line: ScopeLine }) {
  return (
    <>
      {line.map((run, i) =>
        run.bold ? <strong key={i}>{run.text}</strong> : <span key={i}>{run.text}</span>
      )}
    </>
  );
}

const HEADING_SIZE: Record<1 | 2 | 3, string> = { 1: '1.2em', 2: '1.1em', 3: '1em' };

export function ScopeTextHtml({
  text,
  style,
  className,
  testId,
}: {
  text: string | null | undefined;
  style?: CSSProperties;
  className?: string;
  testId?: string;
}) {
  const blocks = parseScopeText(text);
  if (blocks.length === 0) return null;
  return (
    <div style={style} className={className} data-testid={testId}>
      {blocks.map((b, i) => {
        const gap = { margin: i === 0 ? '0 0 0.5em' : '0.5em 0' };
        switch (b.kind) {
          case 'heading':
            return (
              <div
                key={i}
                role="heading"
                aria-level={b.level + 2}
                style={{ ...gap, fontWeight: 700, fontSize: HEADING_SIZE[b.level] }}
              >
                <Inline line={b.content} />
              </div>
            );
          case 'bullets':
            return (
              <ul key={i} style={{ ...gap, paddingLeft: '1.25em', listStyleType: 'disc' }}>
                {b.items.map((item, j) => (
                  <li key={j} style={{ marginBottom: '0.2em' }}>
                    <Inline line={item} />
                  </li>
                ))}
              </ul>
            );
          case 'numbered':
            return (
              <ol key={i} style={{ ...gap, paddingLeft: '1.5em', listStyleType: 'decimal' }}>
                {b.items.map((item, j) => (
                  // `value` keeps the AUTHOR's number — a list split by a paragraph
                  // must not restart at 1.
                  <li key={j} value={parseInt(item.marker, 10)} style={{ marginBottom: '0.2em' }}>
                    <Inline line={item.content} />
                  </li>
                ))}
              </ol>
            );
          case 'paragraph':
            return (
              <p key={i} style={gap}>
                {b.lines.map((line, j) => (
                  <span key={j}>
                    {j > 0 && <br />}
                    <Inline line={line} />
                  </span>
                ))}
              </p>
            );
        }
      })}
    </div>
  );
}
