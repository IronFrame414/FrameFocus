import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { SelectionSpecSheetData } from './spec-sheet-data';

// ============================================================================
// Allowances & Selections — STAGE 6: the specifications sheet's TEMPLATE.
// Spec: docs/specs/allowances-selections-spec.md §7.3, §9.4. [S175 item 4]
// ============================================================================
//
// ⚠️ ONE SHEET, ONE RENDERING — RULED [Josh, S175]. The earlier proposal was
// one template with two renderings: sell for the client, cost and vendor
// detail for the field. Josh rejected it: *"Same sheet. Emailed to client and
// added to project files. No need to inform field employees."* So there is no
// `variant` prop, no caller-chosen presentation and no cost variant, and there
// must not be one added later "for the field" — the field reads the project
// Selections tab (§9.2), which already exists and deliberately carries no
// money either.
//
// ⚠️ NO PRODUCT FOOTER. `lib/brand.ts` says it in its own words: client-facing
// proposals, invoices and change orders are *"deliberately white-label: they
// carry the contractor's identity, never this one. Do not 'helpfully' add a
// product footer to them."* This sheet is emailed to the client. The daily log
// carries `brand.name` because it is an internal record; this one must not.
//
// ⚠️ NO MONEY, ANYWHERE. `SelectionSpecSheetData` has no field that could
// carry a figure — see its header for why that is a Financial Visibility Floor
// decision and not a layout one.
//
// Q4.3 — the "approved as of" stamp is in the header AND in the FIXED footer,
// so a second page torn off and carried onto the site still says what it is a
// snapshot of. A build document loses its cover sheet; the date has to survive
// that.
// ============================================================================

function fmtDate(iso: string, timeZone: string | null): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...(timeZone ? { timeZone } : {}),
  });
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 52,
    paddingHorizontal: 48,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#1f2937',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  logo: { width: 120, maxHeight: 46, objectFit: 'contain' },
  companyName: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#14213d' },
  companyLine: { fontSize: 8.5, color: '#6b7280' },
  titleBlock: { alignItems: 'flex-end' },
  docTitle: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#14213d' },
  meta: { fontSize: 9, color: '#6b7280', marginTop: 2, textAlign: 'right' },
  rule: { borderBottomWidth: 2, marginTop: 6, marginBottom: 10 },
  intro: { fontSize: 9, color: '#6b7280', lineHeight: 1.4, marginBottom: 4 },
  areaTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#14213d',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 14,
    marginBottom: 5,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: '#e6e9ef',
  },
  selection: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f4f6f9',
  },
  thumb: { width: 96, height: 72, objectFit: 'cover', borderRadius: 3 },
  thumbEmpty: {
    width: 96,
    height: 72,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#e6e9ef',
    borderStyle: 'dashed',
  },
  body: { flex: 1 },
  selectionName: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#14213d' },
  chosenName: { marginTop: 2 },
  chosenLabel: { fontFamily: 'Helvetica-Bold' },
  detail: { fontSize: 9, color: '#4b5563', marginTop: 1.5, lineHeight: 1.35 },
  link: { fontSize: 8.5, color: '#6b7280', marginTop: 1.5 },
  supplied: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    color: '#8a5a12',
    marginTop: 3,
  },
  approved: { fontSize: 8, color: '#9aa1ac', marginTop: 3 },
  extraOption: { marginTop: 6, paddingTop: 5, borderTopWidth: 1, borderTopColor: '#f4f6f9' },
  empty: { color: '#9aa1ac', marginTop: 10 },
  caption: { fontSize: 8, color: '#9aa1ac', marginTop: 12 },
  footer: {
    position: 'absolute',
    bottom: 26,
    left: 48,
    right: 48,
    fontSize: 8,
    color: '#9aa1ac',
    textAlign: 'center',
  },
});

function companyAddressLines(c: SelectionSpecSheetData['company']): string[] {
  const cityLine = [c.city, c.state].filter(Boolean).join(', ');
  return [
    c.addressLine1,
    c.addressLine2,
    [cityLine, c.zip].filter(Boolean).join(' ').trim() || null,
  ].filter((l): l is string => !!l && l.trim() !== '');
}

export function SelectionSpecSheetDocument({ data }: { data: SelectionSpecSheetData }) {
  const tz = data.company.timezone;
  const asOf = fmtDate(data.approvedAsOf, tz);
  const accent = data.company.brandColor;
  const stamp = `Approved as of ${asOf}`;

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header} wrap={false}>
          <View>
            {data.company.logoUrl ? (
              // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop
              <Image src={data.company.logoUrl} style={styles.logo} />
            ) : (
              <Text style={styles.companyName}>{data.company.name}</Text>
            )}
            {data.company.logoUrl && <Text style={styles.companyName}>{data.company.name}</Text>}
            {companyAddressLines(data.company).map((line, i) => (
              <Text key={i} style={styles.companyLine}>
                {line}
              </Text>
            ))}
            {data.company.phone && <Text style={styles.companyLine}>{data.company.phone}</Text>}
            {data.company.email && <Text style={styles.companyLine}>{data.company.email}</Text>}
            {data.company.licenseNumber && (
              <Text style={styles.companyLine}>License {data.company.licenseNumber}</Text>
            )}
          </View>
          <View style={styles.titleBlock}>
            <Text style={styles.docTitle}>Specifications</Text>
            <Text style={styles.meta}>{data.project.name}</Text>
            {data.clientName && <Text style={styles.meta}>Prepared for {data.clientName}</Text>}
            {/* Q4.3 — the stamp that makes the snapshot honest. */}
            <Text style={styles.meta}>{stamp}</Text>
          </View>
        </View>

        <View style={[styles.rule, { borderBottomColor: accent }]} />

        <Text style={styles.intro}>
          {data.selectionCount === 0
            ? 'No selections have been approved on this project yet.'
            : `${data.selectionCount} approved selection${data.selectionCount === 1 ? '' : 's'}, by area. `}
          {data.selectionCount > 0
            ? 'Selections still being chosen are not on this sheet.'
            : ''}
        </Text>

        {data.areas.length === 0 ? (
          <Text style={styles.empty}>
            Nothing to specify yet. This sheet lists approved selections only.
          </Text>
        ) : (
          data.areas.map((area) => (
            <View key={area.id}>
              <Text style={styles.areaTitle}>{area.name}</Text>
              {area.selections.map((s) => {
                const first = s.chosen[0] ?? null;
                const rest = s.chosen.slice(1);
                return (
                  <View key={s.id} style={styles.selection} wrap={false}>
                    {first?.imageDataUri ? (
                      // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop
                      <Image style={styles.thumb} src={first.imageDataUri} />
                    ) : (
                      <View style={styles.thumbEmpty} />
                    )}
                    <View style={styles.body}>
                      <Text style={styles.selectionName}>{s.name}</Text>
                      {s.description && <Text style={styles.detail}>{s.description}</Text>}

                      {first ? (
                        <>
                          <Text style={styles.chosenName}>
                            <Text style={styles.chosenLabel}>Chosen: </Text>
                            {first.name}
                          </Text>
                          {first.specDetail && <Text style={styles.detail}>{first.specDetail}</Text>}
                          {first.linkUrl && <Text style={styles.link}>{first.linkUrl}</Text>}
                        </>
                      ) : (
                        <Text style={styles.detail}>No option recorded against this selection.</Text>
                      )}

                      {/* allow_multiple: every pick is part of the build. */}
                      {rest.map((o, i) => (
                        <View key={i} style={styles.extraOption}>
                          <Text>
                            <Text style={styles.chosenLabel}>Also chosen: </Text>
                            {o.name}
                          </Text>
                          {o.specDetail && <Text style={styles.detail}>{o.specDetail}</Text>}
                          {o.linkUrl && <Text style={styles.link}>{o.linkUrl}</Text>}
                        </View>
                      ))}

                      {/* Q4.4 — stated, never a blank price. The fixture still
                          has to be installed; the crew must not order it. */}
                      {s.clientSupplied && (
                        <Text style={styles.supplied}>Supplied by client — no charge</Text>
                      )}

                      {s.approvedAt && (
                        <Text style={styles.approved}>Approved {fmtDate(s.approvedAt, tz)}</Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          ))
        )}

        {data.imagesOmitted > 0 && (
          <Text style={styles.caption}>
            {data.imagesOmitted} image{data.imagesOmitted === 1 ? '' : 's'} could not be included on
            this sheet. Every selection above is listed in full; the pictures are on the project
            Selections page.
          </Text>
        )}

        <Text style={styles.footer} fixed>
          {stamp} · Approved selections only · {data.project.name} · {data.company.name}
        </Text>
      </Page>
    </Document>
  );
}
