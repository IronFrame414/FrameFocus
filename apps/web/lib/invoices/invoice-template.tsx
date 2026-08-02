import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { InvoicePdfData } from './invoice-data';

// 7D §11/§13 — branded React-PDF invoice, modelled on co-template.tsx (same
// branding block, accent bar, totals block and footer language). Renders ONLY
// server-side, via renderToBuffer in invoice-pdf-service.ts.
//
// THREE PRESENTATION LEVELS off the same lines (§11), chosen per invoice:
//   full_detail — layout A: every non-labor row at its ACTUAL, UNBURDENED cost
//                 (§6.4), then Subtotal (non-labor), Markup, TOTAL. The LABOR
//                 line sits OUTSIDE that block, as "N hrs @ $R/hr" (S97 R3).
//   by_section  — Labor / Materials / Subcontractors / Other rollup.
//   lump_sum    — one figure.
// Discounts and credits are ALWAYS shown in full as their own negative lines,
// at every level — never netted away (§4a/§3a/§8).
//
// NO DUE DATE / PAYMENT TERMS. Josh has not ruled terms, so the field is
// OMITTED rather than printed blank or invented. See the build report.

function fmtMoney(value: number): string {
  const sign = value < 0 ? '-' : '';
  return `${sign}$${Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtDate(iso: string | null, tz: string): string {
  if (!iso) return '—';
  // A date-only column: anchor at midday UTC so the tz shift cannot roll it.
  const d = iso.length === 10 ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: tz,
  });
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
    marginBottom: 8,
  },
  logo: { maxHeight: 56, maxWidth: 160, objectFit: 'contain' },
  companyBlock: { textAlign: 'right', fontSize: 9, color: '#4b5563' },
  companyName: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#111827' },
  accentBar: { height: 3, marginBottom: 16 },
  title: { fontSize: 16, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  draftNotice: { fontSize: 9, color: '#b45309', fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  infoRow: { flexDirection: 'row', gap: 24, marginBottom: 16 },
  infoBlock: { flex: 1 },
  infoLabel: { fontSize: 8, color: '#6b7280', textTransform: 'uppercase', marginBottom: 2 },
  sectionTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 14, marginBottom: 6 },
  paragraph: { lineHeight: 1.5, color: '#374151' },
  tableHead: {
    flexDirection: 'row',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#d1d5db',
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: '#f3f4f6',
  },
  colDesc: { flex: 1 },
  colAmt: { width: 90, textAlign: 'right' },
  headText: { fontSize: 8, color: '#6b7280', textTransform: 'uppercase' },
  totalsBlock: { marginTop: 12, alignSelf: 'flex-end', width: 260 },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: '#111827',
    marginTop: 2,
  },
  bold: { fontFamily: 'Helvetica-Bold' },
  muted: { color: '#6b7280' },
  retainageNote: { fontSize: 8, color: '#6b7280', marginTop: 4, textAlign: 'right' },
  watermark: {
    position: 'absolute',
    top: 300,
    left: 90,
    fontSize: 96,
    color: '#b45309',
    opacity: 0.14,
    fontFamily: 'Helvetica-Bold',
    transform: 'rotate(-30deg)',
  },
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

export function InvoiceDocument({ data }: { data: InvoicePdfData }) {
  const { company, invoice, project, client, presented, isDraft } = data;
  const accent = company.brandColor;
  const level = invoice.presentationLevel;

  const companyAddress = [
    [company.addressLine1, company.addressLine2].filter(Boolean).join(', '),
    [company.city, company.state, company.zip].filter(Boolean).join(', '),
  ].filter((s) => s.length > 0);

  const heading = invoice.isDeposit ? 'Deposit Invoice' : 'Invoice';
  const docTitle = invoice.number ?? 'Draft';

  return (
    <Document title={`${docTitle} — ${company.name}`} author={company.name}>
      <Page size="LETTER" style={styles.page}>
        {/* A draft carries an unmistakable watermark AND a printed notice —
            §13 allows a preview, but it must never be mistaken for a bill. */}
        {isDraft && (
          <Text style={styles.watermark} fixed>
            DRAFT
          </Text>
        )}

        {/* 1. Header — the co-template branding block, unchanged. */}
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

        {/* 2. Invoice + project info */}
        <Text style={styles.title}>
          {heading}
          {invoice.title ? ` — ${invoice.title}` : ''}
        </Text>
        {isDraft && <Text style={styles.draftNotice}>DRAFT — not yet numbered. Not a bill.</Text>}

        <View style={styles.infoRow} wrap={false}>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Invoice</Text>
            <Text>{invoice.number ?? 'Draft — not yet numbered'}</Text>
            <Text>Date: {fmtDate(invoice.issueDate, company.timezone)}</Text>
          </View>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Billed To</Text>
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

        {/* 3. The work, at the chosen presentation level (§11). */}
        {level === 'full_detail' && (
          <>
            {presented.nonLaborLines.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Costs</Text>
                <View style={styles.tableHead}>
                  <Text style={[styles.colDesc, styles.headText]}>Description</Text>
                  <Text style={[styles.colAmt, styles.headText]}>Cost</Text>
                  <Text style={[styles.colAmt, styles.headText]}>Amount</Text>
                </View>
                {presented.nonLaborLines.map((l, i) => (
                  <View key={i} style={styles.row} wrap={false}>
                    <Text style={styles.colDesc}>{l.description}</Text>
                    <Text style={[styles.colAmt, styles.muted]}>
                      {l.costBasis === null ? '—' : fmtMoney(l.costBasis)}
                    </Text>
                    <Text style={styles.colAmt}>{fmtMoney(l.amount)}</Text>
                  </View>
                ))}
                {/* Layout A: Subtotal and Markup cover NON-LABOR ONLY. */}
                <View style={styles.totalsBlock}>
                  <View style={styles.totalsRow}>
                    <Text style={styles.muted}>Subtotal (cost)</Text>
                    <Text>{fmtMoney(presented.nonLaborSubtotal)}</Text>
                  </View>
                  <View style={styles.totalsRow}>
                    <Text style={styles.muted}>Markup</Text>
                    <Text>{fmtMoney(presented.nonLaborMarkup)}</Text>
                  </View>
                </View>
              </>
            )}

            {/* The labor line sits OUTSIDE the subtotal/markup block (R3). */}
            {presented.laborLines.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Labor</Text>
                {presented.laborLines.map((l, i) => (
                  <View key={i} style={styles.row} wrap={false}>
                    <Text style={styles.colDesc}>{l.description}</Text>
                    <Text style={styles.colAmt}>{fmtMoney(l.amount)}</Text>
                  </View>
                ))}
              </>
            )}
          </>
        )}

        {level === 'by_section' && (
          <>
            <Text style={styles.sectionTitle}>Summary</Text>
            <View style={styles.tableHead}>
              <Text style={[styles.colDesc, styles.headText]}>Section</Text>
              <Text style={[styles.colAmt, styles.headText]}>Amount</Text>
            </View>
            {presented.sections.map((s, i) => (
              <View key={i} style={styles.row} wrap={false}>
                <Text style={styles.colDesc}>{s.label}</Text>
                <Text style={styles.colAmt}>{fmtMoney(s.amount)}</Text>
              </View>
            ))}
          </>
        )}

        {level === 'lump_sum' && (
          <>
            <Text style={styles.sectionTitle}>Work performed</Text>
            <View style={styles.row} wrap={false}>
              <Text style={styles.colDesc}>
                {invoice.title || (project ? `${project.name} — work performed` : 'Work performed')}
              </Text>
              <Text style={styles.colAmt}>
                {fmtMoney(
                  presented.laborLines
                    .concat(presented.nonLaborLines)
                    .reduce((sum, l) => sum + l.amount, 0)
                )}
              </Text>
            </View>
          </>
        )}

        {/* 4. Discounts and credits — shown in full at EVERY level, never
            netted into the work above (§4a/§3a/§8). */}
        {presented.adjustmentLines.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Adjustments</Text>
            {presented.adjustmentLines.map((l, i) => (
              <View key={i} style={styles.row} wrap={false}>
                <Text style={styles.colDesc}>{l.description}</Text>
                <Text style={styles.colAmt}>{fmtMoney(l.amount)}</Text>
              </View>
            ))}
          </>
        )}

        {/* 5. Totals. Retainage is withheld from the amount due and shown
            SEPARATELY (§5) — it is not yet owed. */}
        <View style={styles.totalsBlock}>
          <View style={invoice.retainageWithheld > 0 ? styles.totalsRow : styles.grandTotalRow}>
            <Text style={styles.bold}>Total</Text>
            <Text style={styles.bold}>{fmtMoney(invoice.billedTotal)}</Text>
          </View>
          {invoice.retainageWithheld > 0 && (
            <>
              <View style={styles.totalsRow}>
                <Text style={styles.muted}>
                  Retainage withheld
                  {invoice.retainagePercent != null ? ` (${invoice.retainagePercent}%)` : ''}
                </Text>
                <Text>{fmtMoney(-invoice.retainageWithheld)}</Text>
              </View>
              <View style={styles.grandTotalRow}>
                <Text style={styles.bold}>Amount due</Text>
                <Text style={styles.bold}>{fmtMoney(invoice.amountReceivable)}</Text>
              </View>
            </>
          )}
        </View>
        {invoice.retainageWithheld > 0 && (
          <Text style={styles.retainageNote}>
            Retainage is held under the contract and billed on completion.
          </Text>
        )}

        {invoice.notes && (
          <>
            <Text style={styles.sectionTitle}>Notes</Text>
            <Text style={styles.paragraph}>{invoice.notes}</Text>
          </>
        )}

        <View style={[styles.footer, { borderTopColor: accent }]} fixed>
          <Text>{company.name}</Text>
          <Text
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
