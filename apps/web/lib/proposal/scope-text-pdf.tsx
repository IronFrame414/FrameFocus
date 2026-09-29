import { Text, View } from '@react-pdf/renderer';
import { parseScopeText, type ScopeLine } from '@framefocus/shared/utils/scope-text';

// C-12 [S115] — the scope summary for the PDF (React-PDF needs <Text>/<View>,
// not HTML). Same parse as `scope-text-html.tsx`, which renders it for the
// browser: the client reads one document whether it opens the PDF or the
// signing page.
//
// Fonts: the proposal uses the built-in Helvetica family, so bold is the
// 'Helvetica-Bold' face — the same one the template's section titles use.

const TEXT = { lineHeight: 1.5, color: '#374151' };
const HEADING_SIZE: Record<1 | 2 | 3, number> = { 1: 12, 2: 11, 3: 10 };

function Runs({ line }: { line: ScopeLine }) {
  return (
    <>
      {line.map((run, i) =>
        run.bold ? (
          <Text key={i} style={{ fontFamily: 'Helvetica-Bold' }}>
            {run.text}
          </Text>
        ) : (
          <Text key={i}>{run.text}</Text>
        )
      )}
    </>
  );
}

export function ScopeTextPdf({ text }: { text: string | null | undefined }) {
  const blocks = parseScopeText(text);
  if (blocks.length === 0) return null;
  return (
    <View style={{ marginBottom: 6 }}>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'heading':
            return (
              <Text
                key={i}
                style={{
                  fontFamily: 'Helvetica-Bold',
                  fontSize: HEADING_SIZE[b.level],
                  marginTop: i === 0 ? 0 : 6,
                  marginBottom: 3,
                  color: '#111827',
                }}
              >
                <Runs line={b.content} />
              </Text>
            );
          case 'bullets':
            return (
              <View key={i} style={{ marginBottom: 4 }}>
                {b.items.map((item, j) => (
                  <View key={j} style={{ flexDirection: 'row', marginBottom: 2, marginLeft: 8 }}>
                    <Text style={{ marginRight: 6 }}>•</Text>
                    <Text style={[TEXT, { flex: 1 }]}>
                      <Runs line={item} />
                    </Text>
                  </View>
                ))}
              </View>
            );
          case 'numbered':
            return (
              <View key={i} style={{ marginBottom: 4 }}>
                {b.items.map((item, j) => (
                  <View key={j} style={{ flexDirection: 'row', marginBottom: 2, marginLeft: 8 }}>
                    <Text style={{ marginRight: 6, minWidth: 14 }}>{item.marker}</Text>
                    <Text style={[TEXT, { flex: 1 }]}>
                      <Runs line={item.content} />
                    </Text>
                  </View>
                ))}
              </View>
            );
          case 'paragraph':
            return (
              <Text key={i} style={[TEXT, { marginBottom: 4 }]}>
                {b.lines.map((line, j) => (
                  <Text key={j}>
                    {j > 0 ? '\n' : ''}
                    <Runs line={line} />
                  </Text>
                ))}
              </Text>
            );
        }
      })}
    </View>
  );
}
