import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

// 6D — delivery record PDF (S90 new scope: one PDF per check-in, clean or
// exception — Josh wants the record). Modelled on daily-log-template.tsx's
// layout language. Point-in-time snapshot: the stored file is replaced on
// every edit (regenerate→repoint→purge, 6B pipeline), so this renders exactly
// what the delivery says at generation time. Per-line photos embed under
// their line — capped upstream by the PDF service to bound file size.

export interface DeliveryPdfLine {
  description: string;
  qtyReceived: number;
  qtyDamaged: number;
  issueNote: string | null;
  /** Embedded images (data URIs), capped by the service. */
  photos: { dataUri: string }[];
  /** Total photos on file for this line — may exceed photos.length. */
  photoCount: number;
}

export interface DeliveryPdfData {
  companyName: string;
  projectName: string;
  vendorName: string;
  deliveryDate: string; // YYYY-MM-DD
  receiverName: string;
  poTitle: string | null; // null = orderless check-in
  hasExceptions: boolean;
  notes: string | null;
  lines: DeliveryPdfLine[];
  /** General whole-delivery photos (S90) — embedded, capped by the service. */
  generalPhotos: { dataUri: string }[];
  /** Total whole-delivery photos on file — may exceed generalPhotos.length. */
  generalPhotoCount: number;
  generatedAt: string; // ISO
  timeZone: string;
}

function fmtYmd(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).toLocaleDateString(
    'en-US',
    { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }
  );
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  companyName: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#14213d' },
  docTitle: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#14213d' },
  meta: { fontSize: 9, color: '#6b7280', marginTop: 2 },
  exception: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#fbe4e2',
    borderWidth: 1,
    borderColor: '#f5c6c0',
    borderRadius: 4,
  },
  exceptionTitle: { fontFamily: 'Helvetica-Bold', color: '#c0362c' },
  clean: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#e4f0e6',
    borderWidth: 1,
    borderColor: '#cfe3d3',
    borderRadius: 4,
  },
  cleanTitle: { fontFamily: 'Helvetica-Bold', color: '#3d7a4b' },
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
  body: { lineHeight: 1.45 },
  empty: { color: '#9aa1ac' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    borderBottomWidth: 1,
    borderBottomColor: '#f4f6f9',
  },
  rowLabel: { flex: 1, paddingRight: 8 },
  rowValue: { fontFamily: 'Helvetica-Bold', color: '#14213d' },
  damagedValue: { fontFamily: 'Helvetica-Bold', color: '#c0362c' },
  issueNote: { fontSize: 9, color: '#b45309', marginTop: 1 },
  caption: { fontSize: 8, color: '#9aa1ac', marginTop: 3 },
  lineBlock: { marginTop: 8 },
  linePhotoTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#374151', marginBottom: 3 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  photo: {
    width: 166,
    height: 124,
    objectFit: 'cover',
    borderRadius: 4,
  },
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

export function DeliveryDocument({ data }: { data: DeliveryPdfData }) {
  const linesWithPhotos = data.lines.filter((l) => l.photoCount > 0);
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.companyName}>{data.companyName}</Text>
            <Text style={styles.meta}>{data.projectName}</Text>
          </View>
          <View>
            <Text style={styles.docTitle}>Delivery Record</Text>
            <Text style={styles.meta}>
              {data.vendorName} · {fmtYmd(data.deliveryDate)}
            </Text>
            <Text style={styles.meta}>
              Received by {data.receiverName} ·{' '}
              {data.poTitle ? `against ${data.poTitle}` : 'no PO (orderless check-in)'}
            </Text>
          </View>
        </View>

        {data.hasExceptions ? (
          <View style={styles.exception}>
            <Text style={styles.exceptionTitle}>
              EXCEPTIONS — this delivery has damaged goods or a flagged issue.
            </Text>
          </View>
        ) : (
          <View style={styles.clean}>
            <Text style={styles.cleanTitle}>Clean delivery — no exceptions recorded.</Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Lines</Text>
          {data.lines.map((line, i) => (
            <View key={i} style={styles.row} wrap={false}>
              <View style={styles.rowLabel}>
                <Text>{line.description}</Text>
                {line.issueNote ? <Text style={styles.issueNote}>Issue: {line.issueNote}</Text> : null}
              </View>
              <Text style={line.qtyDamaged > 0 ? styles.damagedValue : styles.rowValue}>
                {line.qtyReceived} received
                {line.qtyDamaged > 0 ? ` · ${line.qtyDamaged} damaged` : ''}
              </Text>
            </View>
          ))}
        </View>

        {data.notes ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <Text style={styles.body}>{data.notes}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Photos</Text>
          {linesWithPhotos.length === 0 && data.generalPhotoCount === 0 ? (
            <Text style={styles.empty}>No photos attached to this delivery.</Text>
          ) : (
            linesWithPhotos.map((line, i) => (
              <View key={i} style={styles.lineBlock}>
                <Text style={styles.linePhotoTitle}>{line.description}</Text>
                {line.photos.length === 0 ? (
                  <Text style={styles.empty}>
                    {line.photoCount} photo{line.photoCount === 1 ? '' : 's'} on file — none
                    embeddable here.
                  </Text>
                ) : (
                  <View style={styles.photoGrid}>
                    {line.photos.map((p, j) => (
                      // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop
                      <Image key={j} style={styles.photo} src={p.dataUri} />
                    ))}
                  </View>
                )}
                {line.photoCount > line.photos.length && line.photos.length > 0 ? (
                  <Text style={styles.caption}>
                    {line.photoCount - line.photos.length} more photo
                    {line.photoCount - line.photos.length === 1 ? '' : 's'} on file in Module 3.
                  </Text>
                ) : null}
              </View>
            ))
          )}
          {data.generalPhotoCount > 0 ? (
            <View style={styles.lineBlock}>
              <Text style={styles.linePhotoTitle}>Whole delivery</Text>
              {data.generalPhotos.length === 0 ? (
                <Text style={styles.empty}>
                  {data.generalPhotoCount} photo{data.generalPhotoCount === 1 ? '' : 's'} on file —
                  none embeddable here.
                </Text>
              ) : (
                <View style={styles.photoGrid}>
                  {data.generalPhotos.map((p, i) => (
                    // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop
                    <Image key={i} style={styles.photo} src={p.dataUri} />
                  ))}
                </View>
              )}
              {data.generalPhotoCount > data.generalPhotos.length &&
              data.generalPhotos.length > 0 ? (
                <Text style={styles.caption}>
                  {data.generalPhotoCount - data.generalPhotos.length} more photo
                  {data.generalPhotoCount - data.generalPhotos.length === 1 ? '' : 's'} on file in
                  Module 3.
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>

        <Text style={styles.footer} fixed>
          Point-in-time snapshot generated{' '}
          {new Date(data.generatedAt).toLocaleString('en-US', { timeZone: data.timeZone })} ·{' '}
          {data.companyName} · FrameFocus
        </Text>
      </Page>
    </Document>
  );
}
