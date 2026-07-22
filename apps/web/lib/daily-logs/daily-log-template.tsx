import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

// 6B — end-of-day daily log PDF (6B-spec §9; 6B-1 §2.3 regenerate-on-edit).
// Modelled on co-template.tsx's layout language, without signatures or money.
// Point-in-time snapshot: the stored file is replaced on every edit, so this
// renders exactly what the log says at generation time. The day's photos are
// embedded as a grid (revision, S87) — capped upstream by the PDF service to
// bound file size; the caption notes any remainder left in Module 3.

export interface DailyLogPdfData {
  companyName: string;
  projectName: string;
  logDate: string; // YYYY-MM-DD
  authorName: string;
  weather: string | null;
  workPerformed: string | null;
  materialUsed: string | null;
  materialNeeded: string | null;
  equipmentUsed: string | null;
  tasksTomorrow: string | null;
  notes: string | null;
  hazardsPresent: boolean;
  hazardNotes: string | null;
  crew: { name: string; hours: number | null; warrantyOnly: boolean }[];
  subs: { name: string; hours: number; note: string | null }[];
  deliveries: { vendorName: string; hasExceptions: boolean }[];
  /** Embedded images (data URIs), capped by the service. */
  photos: { dataUri: string }[];
  /** Total photos on file for the day — may exceed photos.length. */
  photoCount: number;
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
  hazard: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#fdf6ec',
    borderWidth: 1,
    borderColor: '#f3e2c4',
    borderRadius: 4,
  },
  hazardTitle: { fontFamily: 'Helvetica-Bold', color: '#8a5a12', marginBottom: 3 },
  hazardBody: { color: '#8a5a12' },
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
  grid2: { flexDirection: 'row', gap: 16, marginTop: 12 },
  gridCell: { flex: 1 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    borderBottomWidth: 1,
    borderBottomColor: '#f4f6f9',
  },
  rowLabel: {},
  rowValue: { fontFamily: 'Helvetica-Bold', color: '#14213d' },
  caption: { fontSize: 8, color: '#9aa1ac', marginTop: 3 },
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

function TextSection({ title, value }: { title: string; value: string | null }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {value ? <Text style={styles.body}>{value}</Text> : <Text style={styles.empty}>—</Text>}
    </View>
  );
}

export function DailyLogDocument({ data }: { data: DailyLogPdfData }) {
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.companyName}>{data.companyName}</Text>
            <Text style={styles.meta}>{data.projectName}</Text>
          </View>
          <View>
            <Text style={styles.docTitle}>Daily Log</Text>
            <Text style={styles.meta}>
              {fmtYmd(data.logDate)} · by {data.authorName}
            </Text>
          </View>
        </View>

        {data.hazardsPresent ? (
          <View style={styles.hazard}>
            <Text style={styles.hazardTitle}>Hazard flagged</Text>
            <Text style={styles.hazardBody}>{data.hazardNotes ?? ''}</Text>
          </View>
        ) : null}

        <TextSection title="Work performed" value={data.workPerformed} />

        <View style={styles.grid2}>
          <View style={styles.gridCell}>
            <Text style={styles.sectionTitle}>Material used</Text>
            <Text style={data.materialUsed ? styles.body : styles.empty}>
              {data.materialUsed ?? '—'}
            </Text>
          </View>
          <View style={styles.gridCell}>
            <Text style={styles.sectionTitle}>Material needed</Text>
            <Text style={data.materialNeeded ? styles.body : styles.empty}>
              {data.materialNeeded ?? '—'}
            </Text>
          </View>
        </View>
        <View style={styles.grid2}>
          <View style={styles.gridCell}>
            <Text style={styles.sectionTitle}>Equipment used</Text>
            <Text style={data.equipmentUsed ? styles.body : styles.empty}>
              {data.equipmentUsed ?? '—'}
            </Text>
          </View>
          <View style={styles.gridCell}>
            <Text style={styles.sectionTitle}>Tasks for tomorrow</Text>
            <Text style={data.tasksTomorrow ? styles.body : styles.empty}>
              {data.tasksTomorrow ?? '—'}
            </Text>
          </View>
        </View>

        <TextSection title="Notes" value={data.notes} />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Crew present</Text>
          {data.crew.length === 0 ? (
            <Text style={styles.empty}>—</Text>
          ) : (
            data.crew.map((c, i) => (
              <View key={i} style={styles.row}>
                <Text style={styles.rowLabel}>
                  {c.name}
                  {c.warrantyOnly ? ' (warranty visit)' : ''}
                </Text>
                <Text style={styles.rowValue}>{c.hours != null ? `${c.hours.toFixed(2)} h` : '—'}</Text>
              </View>
            ))
          )}
          <Text style={styles.caption}>Employee hours read-only, from time tracking (6A)</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Subcontractors on site</Text>
          {data.subs.length === 0 ? (
            <Text style={styles.empty}>—</Text>
          ) : (
            data.subs.map((s, i) => (
              <View key={i} style={styles.row}>
                <Text style={styles.rowLabel}>
                  {s.name}
                  {s.note ? ` — ${s.note}` : ''}
                </Text>
                <Text style={styles.rowValue}>{s.hours.toFixed(2)} h</Text>
              </View>
            ))
          )}
          <Text style={styles.caption}>Sub hours entered manually — never payroll (6B-spec §6.2)</Text>
        </View>

        <View style={styles.grid2}>
          <View style={styles.gridCell}>
            <Text style={styles.sectionTitle}>Weather</Text>
            <Text style={data.weather ? styles.body : styles.empty}>{data.weather ?? '—'}</Text>
          </View>
          <View style={styles.gridCell}>
            <Text style={styles.sectionTitle}>Deliveries</Text>
            {data.deliveries.length === 0 ? (
              <Text style={styles.empty}>None recorded</Text>
            ) : (
              data.deliveries.map((d, i) => (
                <Text key={i} style={styles.body}>
                  {d.vendorName}
                  {d.hasExceptions ? ' — EXCEPTIONS' : ' — clean'}
                </Text>
              ))
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Photos</Text>
          {data.photos.length === 0 ? (
            <Text style={styles.empty}>No photos attached to this log.</Text>
          ) : (
            <View style={styles.photoGrid}>
              {data.photos.map((p, i) => (
                // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop
                <Image key={i} style={styles.photo} src={p.dataUri} />
              ))}
            </View>
          )}
          <Text style={styles.caption}>
            {data.photoCount} photo{data.photoCount === 1 ? '' : 's'} attached to this log (Module 3)
            {data.photoCount > data.photos.length
              ? ` — ${data.photoCount - data.photos.length} more not embedded`
              : ''}
            .
          </Text>
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
