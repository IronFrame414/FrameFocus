import { parseTermsText, type TermsRun } from '@framefocus/shared/utils/terms-text';

// S128 Part D — a rich-text terms section for the BROWSER (the signing page and the editor's
// preview). Same parse as terms-text-pdf.tsx: the client signs one document whether they read the
// PDF or the page (D-2). Rows, not <ul>/<ol>, so a nested list and an indented paragraph are the
// same left offset here as in the PDF.
//
// D-3: text nodes only, inside an allowlist of six styles. No dangerouslySetInnerHTML; a `<script>`
// in the text renders as the characters `<script>`.

const INDENT_EM = 1.5; // per level — the PDF uses 1.5 × its 9pt body (13.5pt)

function Runs({ runs }: { runs: TermsRun[] }) {
  return (
    <>
      {runs.map((r, i) =>
        r.bold || r.italic || r.underline ? (
          <span
            key={i}
            style={{
              fontWeight: r.bold ? 700 : undefined,
              fontStyle: r.italic ? 'italic' : undefined,
              textDecoration: r.underline ? 'underline' : undefined,
            }}
          >
            {r.text}
          </span>
        ) : (
          <span key={i}>{r.text}</span>
        )
      )}
    </>
  );
}

export function TermsTextHtml({ text }: { text: string | null | undefined }) {
  const rows = parseTermsText(text);
  if (rows.length === 0) return null;
  return (
    <div data-testid="terms-rich" style={{ fontSize: '0.875rem', lineHeight: 1.6, color: '#374151' }}>
      {rows.map((row, i) => {
        if (row.kind === 'break') return <div key={i} data-terms-row="break" style={{ height: '0.6em' }} />;
        const pad = `${row.level * INDENT_EM}em`;
        if (row.kind === 'text') {
          return (
            <div key={i} data-terms-row="text" data-level={row.level} style={{ paddingLeft: pad }}>
              <Runs runs={row.runs} />
            </div>
          );
        }
        return (
          <div
            key={i}
            data-terms-row={row.kind}
            data-level={row.level}
            style={{ display: 'flex', paddingLeft: pad }}
          >
            <span style={{ width: row.kind === 'bullet' ? '1.25em' : '1.75em', flexShrink: 0 }}>
              {row.kind === 'bullet' ? '•' : row.marker}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <Runs runs={row.runs} />
            </span>
          </div>
        );
      })}
    </div>
  );
}
