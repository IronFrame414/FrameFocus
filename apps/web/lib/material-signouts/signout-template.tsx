import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { brand } from '@/lib/brand';

// S118 item 11 — the material sign-out record PDF (WP_Material_Signout_Form).
// Mechanics and layout language follow delivery-template.tsx. Point-in-time:
// regenerated at the receiver's signature and again at the close, one current
// file per record. ⚠️ The two photo sets are captioned BY STAGE and never
// merged — the whole value is "at release" beside "at return".

export interface SignoutPdfSignature {
  label: string;
  name: string | null;
  title: string | null;
  signedAt: string | null; // formatted
  dataUri: string | null; // PNG data URL (draw or typed image)
}

export interface SignoutPdfPhotoSet {
  title: string;
  photos: { dataUri: string; caption: string }[];
  /** Total photos in this set — may exceed photos.length (cap / non-embeddable). */
  count: number;
}

export interface SignoutPdfData {
  companyName: string;
  statusLabel: string;
  rows: { section: string; items: [string, string | null][] }[];
  signatures: SignoutPdfSignature[];
  acknowledgement: string | null;
  returnRows: [string, string | null][] | null;
  returnSignature: SignoutPdfSignature | null;
  /** Release, return, and [S121 3-F] where it was put. */
  photoSets: [SignoutPdfPhotoSet, SignoutPdfPhotoSet, SignoutPdfPhotoSet];
  generatedAt: string; // ISO
  timeZone: string;
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 48,
    paddingHorizontal: 48,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#1f2937',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  companyName: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#14213d' },
  docTitle: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#14213d' },
  meta: { fontSize: 9, color: '#6b7280', marginTop: 2 },
  section: { marginTop: 12 },
  sectionTitle: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#14213d',
    textTransform: 'uppercase',
    marginBottom: 4,
    paddingBottom: 2,
    borderBottomWidth: 1,
    borderBottomColor: '#e6e9ef',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    borderBottomWidth: 1,
    borderBottomColor: '#f4f6f9',
  },
  rowLabel: { flex: 1, paddingRight: 8, color: '#6b7280' },
  rowValue: { fontFamily: 'Helvetica-Bold', color: '#14213d', maxWidth: 300, textAlign: 'right' },
  sigRow: { flexDirection: 'row', gap: 12 },
  sigBox: { flex: 1, borderWidth: 1, borderColor: '#e6e9ef', borderRadius: 4, padding: 8 },
  sigLabel: { fontSize: 8, color: '#6b7280', textTransform: 'uppercase' },
  sigImage: { height: 40, objectFit: 'contain', marginTop: 4 },
  sigName: { fontFamily: 'Helvetica-Bold', color: '#14213d', marginTop: 3 },
  ack: { fontSize: 8, color: '#374151', marginTop: 6, fontStyle: 'italic' },
  empty: { color: '#9aa1ac' },
  photoCols: { flexDirection: 'row', gap: 12 },
  photoCol: { flex: 1 },
  photoTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#374151', marginBottom: 3 },
  photo: { width: '100%', height: 110, objectFit: 'cover', borderRadius: 4, marginTop: 4 },
  caption: { fontSize: 7, color: '#6b7280', marginTop: 1 },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 48,
    right: 48,
    fontSize: 8,
    color: '#9aa1ac',
    textAlign: 'center',
  },
});

function Sig({ s }: { s: SignoutPdfSignature }) {
  return (
    <View style={styles.sigBox} wrap={false}>
      <Text style={styles.sigLabel}>{s.label}</Text>
      {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop */}
      {s.dataUri ? <Image style={styles.sigImage} src={s.dataUri} /> : null}
      <Text style={styles.sigName}>
        {s.name ?? '—'}
        {s.title ? ` · ${s.title}` : ''}
      </Text>
      {s.signedAt ? <Text style={styles.meta}>{s.signedAt}</Text> : null}
    </View>
  );
}

function Rows({ items }: { items: [string, string | null][] }) {
  return (
    <>
      {items.map(([label, value], i) => (
        <View key={i} style={styles.row} wrap={false}>
          <Text style={styles.rowLabel}>{label}</Text>
          <Text style={styles.rowValue}>{value && value.trim() ? value : '—'}</Text>
        </View>
      ))}
    </>
  );
}

export function SignoutDocument({ data }: { data: SignoutPdfData }) {
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.companyName}>{data.companyName}</Text>
          </View>
          <View>
            <Text style={styles.docTitle}>Material Sign-Out</Text>
            <Text style={styles.meta}>{data.statusLabel}</Text>
          </View>
        </View>

        {data.rows.map((sec, i) => (
          <View key={i} style={styles.section}>
            <Text style={styles.sectionTitle}>{sec.section}</Text>
            <Rows items={sec.items} />
          </View>
        ))}

        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>5 — Sign-out</Text>
          <View style={styles.sigRow}>
            {data.signatures.map((s, i) => (
              <Sig key={i} s={s} />
            ))}
          </View>
          {data.acknowledgement ? <Text style={styles.ack}>{data.acknowledgement}</Text> : null}
        </View>

        {data.returnRows ? (
          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>6 — Return</Text>
            <Rows items={data.returnRows} />
            {data.returnSignature ? (
              <View style={[styles.sigRow, { marginTop: 6 }]}>
                <Sig s={data.returnSignature} />
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Photos</Text>
          <View style={styles.photoCols}>
            {data.photoSets.map((set, i) => (
              <View key={i} style={styles.photoCol}>
                <Text style={styles.photoTitle}>
                  {set.title} · {set.count}
                </Text>
                {set.count === 0 ? <Text style={styles.empty}>No photos.</Text> : null}
                {set.photos.map((p, j) => (
                  <View key={j} wrap={false}>
                    {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop */}
                    <Image style={styles.photo} src={p.dataUri} />
                    <Text style={styles.caption}>{p.caption}</Text>
                  </View>
                ))}
                {set.count > set.photos.length ? (
                  <Text style={styles.caption}>
                    {set.count - set.photos.length} more on file in the project&apos;s files.
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        </View>

        <Text style={styles.footer} fixed>
          Point-in-time snapshot generated{' '}
          {new Date(data.generatedAt).toLocaleString('en-US', { timeZone: data.timeZone })} ·{' '}
          {data.companyName} · {brand.name}
        </Text>
      </Page>
    </Document>
  );
}
