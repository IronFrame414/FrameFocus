import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { brand } from '@/lib/brand';
import {
  INCIDENT_STATUS_LABELS,
  INCIDENT_TYPE_LABELS,
  type IncidentStatus,
  type IncidentType,
} from '@framefocus/shared';

// 6C §7 — incident report PDF. One always-current PDF per incident,
// regenerate-on-edit (same pipeline as the 6B daily log). Photos embed as a
// grid, capped upstream. No OSHA columns — v1 records what happened, who,
// when, treatment (6C-spec §6).

export interface IncidentPdfData {
  companyName: string;
  projectName: string; // "No project (shop/yard)" when project-less
  incidentDate: string; // YYYY-MM-DD
  incidentType: IncidentType;
  status: IncidentStatus;
  reporterName: string;
  description: string;
  preventionNotes: string | null;
  outcome: string | null;
  injuries: {
    name: string;
    isOutsider: boolean;
    treatmentSought: boolean;
    treatmentNotes: string | null;
  }[];
  witnesses: { name: string; isOutsider: boolean }[];
  photos: { dataUri: string }[];
  photoCount: number;
  generatedAt: string;
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
  docTitle: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#c0362c' },
  meta: { fontSize: 9, color: '#6b7280', marginTop: 2 },
  badgeRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  badge: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 3,
  },
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
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f4f6f9',
  },
  rowName: { fontFamily: 'Helvetica-Bold', color: '#14213d' },
  caption: { fontSize: 8, color: '#9aa1ac', marginTop: 3 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  photo: { width: 166, height: 124, objectFit: 'cover', borderRadius: 4 },
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

const TYPE_COLORS: Record<IncidentType, { bg: string; fg: string }> = {
  injury: { bg: '#fbe4e2', fg: '#c0362c' },
  property_damage: { bg: '#fdece0', fg: '#b45309' },
  near_miss: { bg: '#e7ebf9', fg: '#3a4db0' },
};

export function IncidentDocument({ data }: { data: IncidentPdfData }) {
  const typeColor = TYPE_COLORS[data.incidentType];
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.companyName}>{data.companyName}</Text>
            <Text style={styles.meta}>{data.projectName}</Text>
          </View>
          <View>
            <Text style={styles.docTitle}>Incident Report</Text>
            <Text style={styles.meta}>
              {fmtYmd(data.incidentDate)} · reported by {data.reporterName}
            </Text>
          </View>
        </View>

        <View style={styles.badgeRow}>
          <Text style={[styles.badge, { backgroundColor: typeColor.bg, color: typeColor.fg }]}>
            {INCIDENT_TYPE_LABELS[data.incidentType]}
          </Text>
          <Text style={[styles.badge, { backgroundColor: '#eef1f6', color: '#6b7280' }]}>
            {INCIDENT_STATUS_LABELS[data.status]}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What happened</Text>
          <Text style={styles.body}>{data.description}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Injured parties</Text>
          {data.injuries.length === 0 ? (
            <Text style={styles.empty}>None recorded.</Text>
          ) : (
            data.injuries.map((p, i) => (
              <View key={i} style={styles.row}>
                <Text style={styles.rowName}>
                  {p.name}
                  {p.isOutsider ? ' (outside party)' : ''}
                </Text>
                <Text style={styles.body}>
                  {p.treatmentSought
                    ? `Treatment sought${p.treatmentNotes ? ` — ${p.treatmentNotes}` : ''}`
                    : 'No treatment sought'}
                </Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Witnesses</Text>
          {data.witnesses.length === 0 ? (
            <Text style={styles.empty}>None recorded.</Text>
          ) : (
            data.witnesses.map((w, i) => (
              <Text key={i} style={styles.body}>
                {w.name}
                {w.isOutsider ? ' (outside party)' : ''}
              </Text>
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Prevention</Text>
          {data.preventionNotes ? (
            <Text style={styles.body}>{data.preventionNotes}</Text>
          ) : (
            <Text style={styles.empty}>—</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Outcome</Text>
          {data.outcome ? (
            <Text style={styles.body}>{data.outcome}</Text>
          ) : (
            <Text style={styles.empty}>— (incident {INCIDENT_STATUS_LABELS[data.status].toLowerCase()})</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Photos</Text>
          {data.photos.length === 0 ? (
            <Text style={styles.empty}>No photos attached.</Text>
          ) : (
            <View style={styles.photoGrid}>
              {data.photos.map((p, i) => (
                // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop
                <Image key={i} style={styles.photo} src={p.dataUri} />
              ))}
            </View>
          )}
          <Text style={styles.caption}>
            {data.photoCount} photo{data.photoCount === 1 ? '' : 's'} attached (Module 3)
            {data.photoCount > data.photos.length
              ? ` — ${data.photoCount - data.photos.length} more not embedded`
              : ''}
            .
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.caption}>
            OSHA 300 recordkeeping is handled outside the app in v1 (6C-spec §6).
          </Text>
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
