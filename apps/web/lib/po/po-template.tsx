import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

// PO module R-L4 — the purchase-order PDF. A PDF is a DOCUMENT and carries
// the contractor's identity (Entry 5's ruling — PDFs never follow the
// platform repaint): company name + brand-colored rule; the platform appears
// nowhere. COST ONLY throughout (§1): every line, subtotal and total is the
// cost basis — sell never reaches a PO.

export interface PoPdfLine {
  description: string;
  costCode: string | null;
  qty: number;
  unit: string | null;
  unitCost: number | null; // null on a legacy line (R-L1) — rendered as a dash
}

export interface PoPdfData {
  companyName: string;
  brandColor: string;
  poNumber: string;
  vendorName: string;
  projectName: string;
  orderedAt: string | null;
  needBy: string | null;
  deliverTo: string | null;
  lines: PoPdfLine[];
  /** The header total — for a line-bearing PO this equals the footed line sum;
   *  for a legacy PO it is the typed figure and may not foot (stated, R-L1). */
  totalLabel: string;
  legacyUnfooted: boolean;
}

const fmt = (v: number) =>
  `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica', color: '#1a2437' },
  company: { fontSize: 16, fontFamily: 'Helvetica-Bold' },
  rule: { height: 3, marginTop: 6, marginBottom: 14 },
  h1: { fontSize: 13, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  meta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  metaCol: { maxWidth: '46%' },
  label: { fontSize: 8, color: '#5c6784', marginTop: 6 },
  value: { fontSize: 10 },
  headRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#1a2437',
    paddingBottom: 4,
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#d5dae4',
    paddingVertical: 4,
  },
  groupRow: { backgroundColor: '#eef1f6', paddingVertical: 3, paddingHorizontal: 2, marginTop: 6 },
  cDesc: { flex: 1 },
  cQty: { width: 50, textAlign: 'right' },
  cUnit: { width: 50, textAlign: 'right' },
  cCost: { width: 70, textAlign: 'right' },
  cTotal: { width: 80, textAlign: 'right' },
  totalRow: { flexDirection: 'row', marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#1a2437' },
  note: { fontSize: 8, color: '#5c6784', marginTop: 10 },
});

export function PoDocument({ data }: { data: PoPdfData }) {
  const groups = new Map<string, PoPdfLine[]>();
  for (const line of data.lines) {
    const key = line.costCode ?? '';
    const list = groups.get(key) ?? [];
    list.push(line);
    groups.set(key, list);
  }

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.company}>{data.companyName}</Text>
        <View style={[styles.rule, { backgroundColor: data.brandColor }]} />
        <Text style={styles.h1}>Purchase Order {data.poNumber}</Text>

        <View style={styles.meta}>
          <View style={styles.metaCol}>
            <Text style={styles.label}>VENDOR</Text>
            <Text style={styles.value}>{data.vendorName}</Text>
            <Text style={styles.label}>PROJECT</Text>
            <Text style={styles.value}>{data.projectName}</Text>
          </View>
          <View style={styles.metaCol}>
            <Text style={styles.label}>ORDERED</Text>
            <Text style={styles.value}>{data.orderedAt ?? '—'}</Text>
            <Text style={styles.label}>NEED BY</Text>
            <Text style={styles.value}>{data.needBy ?? '—'}</Text>
            {data.deliverTo ? (
              <>
                <Text style={styles.label}>DELIVER TO</Text>
                <Text style={styles.value}>{data.deliverTo}</Text>
              </>
            ) : null}
          </View>
        </View>

        <View style={styles.headRow}>
          <Text style={[styles.cDesc, { fontFamily: 'Helvetica-Bold' }]}>Item</Text>
          <Text style={[styles.cQty, { fontFamily: 'Helvetica-Bold' }]}>Qty</Text>
          <Text style={[styles.cUnit, { fontFamily: 'Helvetica-Bold' }]}>Unit</Text>
          <Text style={[styles.cCost, { fontFamily: 'Helvetica-Bold' }]}>Unit cost</Text>
          <Text style={[styles.cTotal, { fontFamily: 'Helvetica-Bold' }]}>Total</Text>
        </View>

        {[...groups.entries()].map(([code, lines]) => (
          <View key={code || 'nocode'}>
            {code ? (
              <View style={styles.groupRow}>
                <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#3f4a60' }}>
                  {code}
                </Text>
              </View>
            ) : null}
            {lines.map((line, i) => (
              <View key={i} style={styles.row}>
                <Text style={styles.cDesc}>{line.description}</Text>
                <Text style={styles.cQty}>{line.qty}</Text>
                <Text style={styles.cUnit}>{line.unit ?? '—'}</Text>
                <Text style={styles.cCost}>{line.unitCost != null ? fmt(line.unitCost) : '—'}</Text>
                <Text style={styles.cTotal}>
                  {line.unitCost != null ? fmt(Math.round(line.qty * line.unitCost * 100) / 100) : '—'}
                </Text>
              </View>
            ))}
          </View>
        ))}

        <View style={styles.totalRow}>
          <Text style={[styles.cDesc, { fontFamily: 'Helvetica-Bold' }]}>PO total</Text>
          <Text style={[styles.cTotal, { fontFamily: 'Helvetica-Bold', marginLeft: 'auto' }]}>
            {data.totalLabel}
          </Text>
        </View>

        {data.legacyUnfooted ? (
          <Text style={styles.note}>
            This order&rsquo;s total was entered as a single figure; line items are listed without
            prices.
          </Text>
        ) : null}
      </Page>
    </Document>
  );
}
