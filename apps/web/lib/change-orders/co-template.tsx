import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { ChangeOrderData } from './co-data';

// Signed-artifact spec §6 — branded React-PDF change order, modelled on
// proposal-template.tsx (same branding + layout language). The CO stands
// alone (spec §6): it shows the CO number, title, description, its own line
// items and pricing, the net delta, and schedule impact — it does NOT embed
// the original estimate or contract. Two signature blocks are reserved at the
// bottom (Contractor + Client); the actual signatures are stamped onto them by
// co-pdf-service.compositeSignedCoPDF, not rendered here.

function fmtMoney(value: number): string {
  const sign = value < 0 ? '-' : '';
  return `${sign}$${Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 120, // reserve room for the two signature blocks stamped at the bottom
    paddingHorizontal: 48,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#1f2937',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  logo: { maxHeight: 56, maxWidth: 160, objectFit: 'contain' },
  companyBlock: { textAlign: 'right', fontSize: 9, color: '#4b5563' },
  companyName: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#111827' },
  accentBar: { height: 3, marginBottom: 16 },
  title: { fontSize: 16, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  infoRow: { flexDirection: 'row', gap: 24, marginBottom: 16 },
  infoBlock: { flex: 1 },
  infoLabel: { fontSize: 8, color: '#6b7280', textTransform: 'uppercase', marginBottom: 2 },
  sectionTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 14, marginBottom: 6 },
  paragraph: { lineHeight: 1.5, color: '#374151' },
  row: {
    flexDirection: 'row',
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: '#f3f4f6',
  },
  totalsBlock: { marginTop: 12, alignSelf: 'flex-end', width: 240 },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: '#111827',
    marginTop: 2,
  },
  signatureBlock: { marginTop: 28 },
  signatureLine: { flexDirection: 'row', gap: 32, marginTop: 48 },
  signatureField: { flex: 1, borderTopWidth: 1, borderTopColor: '#111827', paddingTop: 4 },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 48,
    right: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: '#9ca3af',
    borderTopWidth: 2,
    paddingTop: 6,
  },
});

export function ChangeOrderDocument({ data }: { data: ChangeOrderData }) {
  const { company, changeOrder, project, client, lineItems } = data;
  const accent = company.brandColor;

  const companyAddress = [
    [company.addressLine1, company.addressLine2].filter(Boolean).join(', '),
    [company.city, company.state, company.zip].filter(Boolean).join(', '),
  ].filter((s) => s.length > 0);

  return (
    <Document title={`${changeOrder.number} — ${changeOrder.title}`} author={company.name}>
      <Page size="LETTER" style={styles.page}>
        {/* 1. Header */}
        <View style={styles.header} wrap={false}>
          <View>
            {company.logoUrl ? (
              <Image src={company.logoUrl} style={styles.logo} />
            ) : (
              <Text style={styles.companyName}>{company.name}</Text>
            )}
          </View>
          <View style={styles.companyBlock}>
            <Text style={styles.companyName}>{company.name}</Text>
            {companyAddress.map((line, i) => (
              <Text key={i}>{line}</Text>
            ))}
            {company.phone && <Text>{company.phone}</Text>}
            {company.email && <Text>{company.email}</Text>}
            {company.licenseNumber && <Text>License {company.licenseNumber}</Text>}
          </View>
        </View>
        <View style={[styles.accentBar, { backgroundColor: accent }]} />

        {/* 2 + 3. CO + project info */}
        <Text style={styles.title}>{changeOrder.title}</Text>
        <View style={styles.infoRow} wrap={false}>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Change Order</Text>
            <Text>{changeOrder.number}</Text>
            <Text>Date: {fmtDate(changeOrder.date)}</Text>
            {changeOrder.scheduleImpactDays != null && (
              <Text>
                Schedule impact: {changeOrder.scheduleImpactDays}{' '}
                {Math.abs(changeOrder.scheduleImpactDays) === 1 ? 'day' : 'days'}
              </Text>
            )}
          </View>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Prepared For</Text>
            {client ? (
              <>
                <Text>{client.name}</Text>
                {client.companyName && <Text>{client.companyName}</Text>}
              </>
            ) : (
              <Text>—</Text>
            )}
            {project && <Text>Project: {project.name}</Text>}
          </View>
        </View>

        {/* 4. Description */}
        {changeOrder.description && (
          <View>
            <Text style={[styles.sectionTitle, { color: accent }]}>Description</Text>
            <Text style={styles.paragraph}>{changeOrder.description}</Text>
          </View>
        )}

        {/* 5. Line items — the CO's own pricing (rows already carry the
            marked-up, signed totals per the CO's pricing_mode / markups). */}
        <Text style={[styles.sectionTitle, { color: accent }]}>Change Detail</Text>
        {lineItems.length === 0 ? (
          <Text style={styles.paragraph}>No line items.</Text>
        ) : (
          lineItems.map((item, i) => (
            <View key={i} style={{ marginBottom: 8 }} wrap={false}>
              <View style={styles.row}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={{ fontFamily: 'Helvetica-Bold' }}>{item.name}</Text>
                  {item.description && (
                    <Text style={{ fontSize: 8, color: '#6b7280' }}>{item.description}</Text>
                  )}
                </View>
                <Text style={{ fontFamily: 'Helvetica-Bold' }}>{fmtMoney(item.total)}</Text>
              </View>
              {item.rows.map((r, k) => (
                <View
                  key={k}
                  style={[styles.row, { borderBottomWidth: 0, paddingVertical: 1 }]}
                >
                  <Text style={{ flex: 1, paddingLeft: 12, fontSize: 9, color: '#6b7280' }}>
                    {r.name}
                  </Text>
                  <Text style={{ fontSize: 9, color: '#6b7280' }}>{fmtMoney(r.total)}</Text>
                </View>
              ))}
            </View>
          ))
        )}

        {/* 6. Net change total */}
        <View style={styles.totalsBlock} wrap={false}>
          <View style={styles.grandTotalRow}>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>Net Change to Contract</Text>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>{fmtMoney(changeOrder.netDelta)}</Text>
          </View>
        </View>

        {/* 7. Signature blocks — two reserved fields. The contractor signs at
            send (v1); the client signs via the tokenized link (v2). Actual
            signatures/dates are stamped onto these fields by
            compositeSignedCoPDF. */}
        <View style={styles.signatureBlock} wrap={false}>
          <Text style={[styles.sectionTitle, { color: accent }]}>Acceptance</Text>
          <Text style={styles.paragraph}>
            By signing below, the parties accept this change order and the resulting adjustment to
            the contract.
          </Text>
          <View style={styles.signatureLine}>
            <View style={styles.signatureField}>
              <Text>Contractor</Text>
            </View>
            <View style={styles.signatureField}>
              <Text>Client</Text>
            </View>
          </View>
        </View>

        {/* 8. Footer */}
        <View style={[styles.footer, { borderTopColor: accent }]} fixed>
          <Text>Change order prepared by {company.name}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
