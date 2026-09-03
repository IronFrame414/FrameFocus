import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { ProposalData } from './proposal-data';
import { resolveProposalFormat } from '@framefocus/shared/utils/proposal-format';

// Spec 2 (4E) — branded React-PDF proposal. Rendered server-side
// (renderToBuffer in the generate/send routes) and in-browser
// (<PDFViewer> on the preview page). Layout per spec §UI:
// header → estimate info → client info → cover letter → scope →
// pricing (by pricing level) → totals block → allowances → terms →
// signature line → footer.
//
// Page breaks (build decision Q2): sections use wrap={false} where
// they must stay intact (info blocks, totals, signature); long
// flows (line items, terms) wrap naturally.

function fmtMoney(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
    paddingBottom: 56,
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
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    marginTop: 14,
    marginBottom: 6,
  },
  paragraph: { lineHeight: 1.5, color: '#374151' },
  bullet: { flexDirection: 'row', marginBottom: 2 },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#d1d5db',
    paddingBottom: 3,
    marginBottom: 4,
  },
  th: { fontSize: 8, color: '#6b7280', textTransform: 'uppercase' },
  row: {
    flexDirection: 'row',
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: '#f3f4f6',
  },
  totalsBlock: {
    marginTop: 12,
    alignSelf: 'flex-end',
    width: 220,
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: '#111827',
    marginTop: 2,
  },
  allowanceBox: {
    marginTop: 14,
    padding: 10,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 4,
  },
  signatureBlock: { marginTop: 28 },
  signatureLine: {
    flexDirection: 'row',
    gap: 32,
    marginTop: 24,
  },
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

export function ProposalDocument({ data }: { data: ProposalData }) {
  const { company, estimate, client, jobSite, categories, allowances } = data;
  const accent = company.brandColor;

  const companyAddress = [
    [company.addressLine1, company.addressLine2].filter(Boolean).join(', '),
    [company.city, company.state, company.zip].filter(Boolean).join(', '),
  ].filter((s) => s.length > 0);

  return (
    <Document
      title={`${estimate.number} — ${estimate.name}`}
      author={company.name}
    >
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

        {/* 2 + 3. Estimate + client info */}
        <Text style={styles.title}>{estimate.name}</Text>
        <View style={styles.infoRow} wrap={false}>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Proposal</Text>
            <Text>
              {estimate.number} · {estimate.version}
            </Text>
            <Text>Date: {fmtDate(estimate.date)}</Text>
            <Text>
              {estimate.expiresAt
                ? `Valid until ${fmtDate(estimate.expiresAt)}`
                : `Valid for ${estimate.expirationDays} days`}
            </Text>
          </View>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Prepared For</Text>
            <Text>{client.name}</Text>
            {client.companyName && <Text>{client.companyName}</Text>}
            {jobSite && (
              <>
                <Text>
                  {jobSite.addressLine1}
                  {jobSite.addressLine2 ? `, ${jobSite.addressLine2}` : ''}
                </Text>
                <Text>
                  {jobSite.city}, {jobSite.state} {jobSite.zip}
                </Text>
              </>
            )}
          </View>
        </View>

        {/* 4. Cover letter */}
        {estimate.coverLetter && (
          <View>
            <Text style={[styles.sectionTitle, { color: accent }]}>Introduction</Text>
            <Text style={styles.paragraph}>{estimate.coverLetter}</Text>
          </View>
        )}

        {/* 5. Scope of work — summary + nested sections (4D-rev) */}
        {(estimate.scopeSummary || estimate.scopeSections.length > 0) && (
          <View>
            <Text style={[styles.sectionTitle, { color: accent }]}>Scope of Work</Text>
            {estimate.scopeSummary && (
              <Text style={[styles.paragraph, { marginBottom: 6 }]}>{estimate.scopeSummary}</Text>
            )}
            {estimate.scopeSections.map((section, i) => (
              <View key={i} style={{ marginBottom: 6 }}>
                {section.title.trim().length > 0 && (
                  <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 10, marginBottom: 2 }}>
                    {section.title}
                  </Text>
                )}
                {section.bullets.map((b, j) => (
                  <View key={j} style={[styles.bullet, { marginLeft: 8 }]}>
                    <Text style={{ marginRight: 6 }}>•</Text>
                    <Text style={[styles.paragraph, { flex: 1 }]}>{b}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        {/* 6. Pricing — 4D-rev3: five estimate-level presentation levels.
            The Subtotal/Discount/Total block below always renders, so the
            *_no_price levels still show the grand total. */}
        <Text style={[styles.sectionTitle, { color: accent }]}>Pricing</Text>
        {estimate.pricingLevel === 'lump_sum' && (
          <View style={styles.row}>
            <Text style={{ flex: 1, fontFamily: 'Helvetica-Bold' }}>Project Total</Text>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>{fmtMoney(estimate.grandTotal)}</Text>
          </View>
        )}
        {estimate.pricingLevel === 'category_with_price' &&
          categories.map((cat, i) => (
            <View key={i} style={styles.row} wrap={false}>
              <Text style={{ flex: 1 }}>{cat.name}</Text>
              <Text>{fmtMoney(cat.subtotal)}</Text>
            </View>
          ))}
        {estimate.pricingLevel === 'category_no_price' &&
          categories.map((cat, i) => (
            <View key={i} style={[styles.row, { borderBottomWidth: 0 }]} wrap={false}>
              <Text style={{ flex: 1 }}>{cat.name}</Text>
            </View>
          ))}
        {(estimate.pricingLevel === 'detail_with_price_qty' ||
          estimate.pricingLevel === 'detail_no_price') &&
          (() => {
            const showPrices = estimate.pricingLevel === 'detail_with_price_qty';
            return categories.map((cat, i) => (
              <View key={i} style={{ marginBottom: 8 }}>
                <View style={styles.row}>
                  <Text style={{ flex: 1, fontFamily: 'Helvetica-Bold', marginBottom: 2 }}>
                    {cat.name}
                  </Text>
                  {showPrices && (
                    <Text style={{ fontFamily: 'Helvetica-Bold' }}>{fmtMoney(cat.subtotal)}</Text>
                  )}
                </View>
                {cat.lines.map((line, j) => (
                  <View key={j} wrap={false}>
                    <View style={styles.row}>
                      <View style={{ flex: 1, paddingRight: 12 }}>
                        <Text>{line.name}</Text>
                        {line.description && (
                          <Text style={{ fontSize: 8, color: '#6b7280' }}>{line.description}</Text>
                        )}
                      </View>
                      {showPrices && (
                        <Text>
                          {line.originalTotal != null
                            ? fmtMoney(line.originalTotal)
                            : fmtMoney(line.total)}
                        </Text>
                      )}
                    </View>
                    {/* 4D-rev3: every line lists its rows. Row prices show only
                        at detail_with_price_qty. */}
                    {line.rows.map((r, k) => (
                      <View key={k} style={[styles.row, { borderBottomWidth: 0, paddingVertical: 1 }]}>
                        <Text style={{ flex: 1, paddingLeft: 12, fontSize: 9, color: '#6b7280' }}>
                          {r.name}
                        </Text>
                        {showPrices && (
                          <Text style={{ fontSize: 9, color: '#6b7280' }}>{fmtMoney(r.total)}</Text>
                        )}
                      </View>
                    ))}
                    {/* E1: original → discount sub-line → line total */}
                    {showPrices && line.originalTotal != null && (
                      <>
                        <View style={[styles.row, { borderBottomWidth: 0 }]}>
                          <Text style={{ flex: 1, textAlign: 'right', color: '#16a34a' }}>
                            Discount ({line.discountLabel}):
                          </Text>
                          <Text style={{ color: '#16a34a' }}>
                            −{fmtMoney(line.originalTotal - line.total)}
                          </Text>
                        </View>
                        <View style={styles.row}>
                          <Text
                            style={{ flex: 1, textAlign: 'right', fontFamily: 'Helvetica-Bold' }}
                          >
                            Line total:
                          </Text>
                          <Text style={{ fontFamily: 'Helvetica-Bold' }}>
                            {fmtMoney(line.total)}
                          </Text>
                        </View>
                      </>
                    )}
                  </View>
                ))}
              </View>
            ));
          })()}

        {/* Canonical eight (estimates-redesign §3.4) — a SEPARATE path from the
            legacy five above, which stay byte-for-byte so the 23 already-sent
            estimates render exactly as before. ⚠️ Open book (cost_plus / t&m)
            SHOULD print cost + fee, but ProposalData carries no cost, so it
            renders as itemized CLIENT prices — SAFE (never leaks cost), and
            incomplete vs §3.4. Flagged in the build report. */}
        {(() => {
          const info = resolveProposalFormat(estimate.pricingLevel);
          if (info.legacy) return null; // legacy stored value → handled above
          const c = info.code;
          if (c === 'total_only') {
            return (
              <View style={styles.row}>
                <Text style={{ flex: 1, fontFamily: 'Helvetica-Bold' }}>Project Total</Text>
                <Text style={{ fontFamily: 'Helvetica-Bold' }}>{fmtMoney(estimate.grandTotal)}</Text>
              </View>
            );
          }
          const showLines =
            c === 'itemized' ||
            c === 'itemized_with_descriptions' ||
            c === 'itemized_no_unit_pricing' ||
            c === 'cost_plus_itemized' ||
            c === 'time_and_materials_itemized';
          // itemized_no_unit_pricing: lines listed, prices only at category level.
          const linePrices = showLines && c !== 'itemized_no_unit_pricing';
          const descriptions =
            c === 'summary_with_descriptions' || c === 'itemized_with_descriptions';
          return categories.map((cat, i) => (
            <View key={i} style={{ marginBottom: 8 }}>
              <View style={styles.row}>
                <Text style={{ flex: 1, fontFamily: 'Helvetica-Bold' }}>{cat.name}</Text>
                <Text style={{ fontFamily: 'Helvetica-Bold' }}>{fmtMoney(cat.subtotal)}</Text>
              </View>
              {showLines &&
                cat.lines.map((line, j) => (
                  <View key={j} style={[styles.row, { borderBottomWidth: 0 }]} wrap={false}>
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <Text>{line.name}</Text>
                      {descriptions && line.description && (
                        <Text style={{ fontSize: 8, color: '#6b7280' }}>{line.description}</Text>
                      )}
                    </View>
                    {linePrices && (
                      <Text>
                        {line.originalTotal != null
                          ? fmtMoney(line.originalTotal)
                          : fmtMoney(line.total)}
                      </Text>
                    )}
                  </View>
                ))}
            </View>
          ));
        })()}

        {/* 7. Subtotal / Discount / Total block — always shown */}
        <View style={styles.totalsBlock} wrap={false}>
          <View style={styles.totalsRow}>
            <Text>Subtotal</Text>
            <Text>{fmtMoney(estimate.subtotal)}</Text>
          </View>
          {estimate.discountTotal > 0 && (
            <View style={styles.totalsRow}>
              <Text>Discount</Text>
              <Text>−{fmtMoney(estimate.discountTotal)}</Text>
            </View>
          )}
          <View style={styles.grandTotalRow}>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>Total</Text>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>{fmtMoney(estimate.grandTotal)}</Text>
          </View>
        </View>

        {/* 8. Allowance summary box */}
        {allowances.length > 0 && (
          <View style={styles.allowanceBox} wrap={false}>
            <Text style={{ fontFamily: 'Helvetica-Bold', marginBottom: 4 }}>Allowances</Text>
            <Text style={{ fontSize: 8, color: '#92400e', marginBottom: 6 }}>
              The following amounts are allowances for client-selected items. Final pricing
              depends on the selections made.
            </Text>
            {allowances.map((a, i) => (
              <View key={i} style={styles.totalsRow}>
                <Text style={{ flex: 1 }}>
                  {a.name}
                  {a.lineName ? ` (${a.lineName})` : ''}
                </Text>
                <Text>{fmtMoney(a.amount)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* 9. Terms sections — heading omitted when content empty */}
        {estimate.termsSections.filter((s) => s.content.trim().length > 0).length > 0 && (
          <View>
            <Text style={[styles.sectionTitle, { color: accent }]}>Terms &amp; Conditions</Text>
            {estimate.termsSections
              .filter((s) => s.content.trim().length > 0)
              .map((section, i) => (
                <View key={i} style={{ marginBottom: 6 }}>
                  <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 9, marginBottom: 2 }}>
                    {section.name}
                  </Text>
                  <Text style={[styles.paragraph, { fontSize: 9 }]}>{section.content}</Text>
                </View>
              ))}
          </View>
        )}

        {/* 10. Signature line */}
        <View style={styles.signatureBlock} wrap={false}>
          <Text style={[styles.sectionTitle, { color: accent }]}>Acceptance</Text>
          <Text style={styles.paragraph}>
            By signing below, I accept this proposal and agree to the terms and conditions
            stated herein.
          </Text>
          <View style={styles.signatureLine}>
            <View style={styles.signatureField}>
              <Text>Accepted by</Text>
            </View>
            <View style={styles.signatureField}>
              <Text>Date</Text>
            </View>
          </View>
        </View>

        {/* 11. Footer */}
        <View style={[styles.footer, { borderTopColor: accent }]} fixed>
          <Text>Proposal prepared by {company.name}</Text>
          <Text
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
