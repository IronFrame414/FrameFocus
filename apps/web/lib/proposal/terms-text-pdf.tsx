import { Text, View } from '@react-pdf/renderer';
import { parseTermsText, type TermsRun } from '@framefocus/shared/utils/terms-text';

// S128 Part D — a rich-text terms section for the PDF. Same parse, same rows as
// terms-text-html.tsx (D-2: PDF parity is the gate). The built-in Helvetica family carries the
// styles: Helvetica-Bold, Helvetica-Oblique, Helvetica-BoldOblique; underline is
// textDecoration, which React-PDF draws as a rule under the run.

const BODY = 9;
const INDENT_PT = 1.5 * BODY; // per level — the browser uses 1.5em

function face(r: TermsRun): string {
  if (r.bold && r.italic) return 'Helvetica-BoldOblique';
  if (r.bold) return 'Helvetica-Bold';
  if (r.italic) return 'Helvetica-Oblique';
  return 'Helvetica';
}

function Runs({ runs }: { runs: TermsRun[] }) {
  return (
    <>
      {runs.map((r, i) => (
        <Text
          key={i}
          style={{ fontFamily: face(r), textDecoration: r.underline ? 'underline' : 'none' }}
        >
          {r.text}
        </Text>
      ))}
    </>
  );
}

export function TermsTextPdf({ text }: { text: string | null | undefined }) {
  const rows = parseTermsText(text);
  if (rows.length === 0) return null;
  return (
    <View style={{ marginBottom: 6 }}>
      {rows.map((row, i) => {
        if (row.kind === 'break') return <View key={i} style={{ height: 5 }} />;
        const pad = row.level * INDENT_PT;
        if (row.kind === 'text') {
          return (
            <Text key={i} style={{ fontSize: BODY, lineHeight: 1.6, color: '#374151', paddingLeft: pad }}>
              <Runs runs={row.runs} />
            </Text>
          );
        }
        return (
          <View key={i} style={{ flexDirection: 'row', paddingLeft: pad }} wrap={false}>
            <Text style={{ fontSize: BODY, lineHeight: 1.6, color: '#374151', width: row.kind === 'bullet' ? 1.25 * BODY : 1.75 * BODY }}>
              {row.kind === 'bullet' ? '•' : row.marker}
            </Text>
            <Text style={{ fontSize: BODY, lineHeight: 1.6, color: '#374151', flex: 1 }}>
              <Runs runs={row.runs} />
            </Text>
          </View>
        );
      })}
    </View>
  );
}
