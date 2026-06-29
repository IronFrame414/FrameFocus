import type { ProposalData } from './proposal-data';

// Spec 2 (4F F5) — HTML rendering of the proposal for the public
// signing page: same data as the PDF, responsive for mobile. Plain
// JSX + inline styles (no dashboard styling dependencies — this
// renders outside /dashboard).

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

export function ProposalHtml({ data }: { data: ProposalData }) {
  const { company, estimate, client, jobSite, categories, allowances } = data;
  const accent = company.brandColor;

  const sectionTitle: React.CSSProperties = {
    fontSize: '1rem',
    fontWeight: 700,
    color: accent,
    margin: '1.75rem 0 0.5rem',
  };
  const row: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '1rem',
    padding: '0.375rem 0',
    borderBottom: '1px solid #f3f4f6',
    fontSize: '0.9375rem',
  };

  const visibleTerms = estimate.termsSections.filter((s) => s.content.trim().length > 0);

  return (
    <div style={{ color: '#1f2937', lineHeight: 1.5 }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        {company.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={company.logoUrl}
            alt={company.name}
            style={{ maxHeight: '56px', maxWidth: '180px', objectFit: 'contain' }}
          />
        ) : (
          <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{company.name}</div>
        )}
        <div style={{ textAlign: 'right', fontSize: '0.8125rem', color: '#4b5563' }}>
          <div style={{ fontWeight: 700, color: '#111827' }}>{company.name}</div>
          {company.phone && <div>{company.phone}</div>}
          {company.email && <div>{company.email}</div>}
          {company.licenseNumber && <div>License {company.licenseNumber}</div>}
        </div>
      </div>
      <div style={{ height: '3px', backgroundColor: accent, margin: '0.75rem 0 1.25rem' }} />

      {/* Title + info */}
      <h1 style={{ fontSize: '1.375rem', fontWeight: 700, margin: '0 0 0.75rem' }}>
        {estimate.name}
      </h1>
      <div
        style={{
          display: 'flex',
          gap: '2rem',
          flexWrap: 'wrap',
          fontSize: '0.875rem',
          marginBottom: '0.5rem',
        }}
      >
        <div>
          <div style={{ fontSize: '0.6875rem', color: '#6b7280', textTransform: 'uppercase' }}>
            Proposal
          </div>
          <div>
            {estimate.number} · {estimate.version}
          </div>
          <div>Date: {fmtDate(estimate.date)}</div>
          <div>
            {estimate.expiresAt
              ? `Valid until ${fmtDate(estimate.expiresAt)}`
              : `Valid for ${estimate.expirationDays} days`}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.6875rem', color: '#6b7280', textTransform: 'uppercase' }}>
            Prepared for
          </div>
          <div>{client.name}</div>
          {client.companyName && <div>{client.companyName}</div>}
          {jobSite && (
            <>
              <div>
                {jobSite.addressLine1}
                {jobSite.addressLine2 ? `, ${jobSite.addressLine2}` : ''}
              </div>
              <div>
                {jobSite.city}, {jobSite.state} {jobSite.zip}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Cover letter */}
      {estimate.coverLetter && (
        <div>
          <div style={sectionTitle}>Introduction</div>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.9375rem' }}>
            {estimate.coverLetter}
          </div>
        </div>
      )}

      {/* Scope — summary + nested sections (4D-rev) */}
      {(estimate.scopeSummary || estimate.scopeSections.length > 0) && (
        <div>
          <div style={sectionTitle}>Scope of Work</div>
          {estimate.scopeSummary && (
            <p style={{ margin: '0 0 0.5rem', fontSize: '0.9375rem' }}>{estimate.scopeSummary}</p>
          )}
          {estimate.scopeSections.map((section, i) => (
            <div key={i} style={{ marginBottom: '0.5rem' }}>
              {section.title.trim().length > 0 && (
                <div style={{ fontWeight: 700, fontSize: '0.9375rem', marginBottom: '0.25rem' }}>
                  {section.title}
                </div>
              )}
              <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.9375rem' }}>
                {section.bullets.map((b, j) => (
                  <li key={j} style={{ marginBottom: '0.25rem' }}>
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Pricing */}
      <div style={sectionTitle}>Pricing</div>
      {estimate.pricingLevel === 'total_only' && (
        <div style={{ ...row, fontWeight: 700 }}>
          <span>Project Total</span>
          <span>{fmtMoney(estimate.grandTotal)}</span>
        </div>
      )}
      {estimate.pricingLevel === 'category_totals' &&
        categories.map((cat, i) => (
          <div key={i} style={row}>
            <span>{cat.name}</span>
            <span>{fmtMoney(cat.subtotal)}</span>
          </div>
        ))}
      {estimate.pricingLevel === 'line_items' &&
        categories.map((cat, i) => (
          <div key={i} style={{ marginBottom: '0.75rem' }}>
            <div style={{ fontWeight: 700, fontSize: '0.9375rem', margin: '0.5rem 0 0.25rem' }}>
              {cat.name}
            </div>
            {/* 4D-rev: a lump_sum category collapses to one number */}
            {cat.collapsed ? (
              <div style={row}>
                <span>Included scope</span>
                <span>{fmtMoney(cat.subtotal)}</span>
              </div>
            ) : (
              cat.lines.map((line, j) => (
                <div key={j}>
                  <div style={row}>
                    <span>
                      {line.name}
                      {line.description && (
                        <span
                          style={{
                            display: 'block',
                            fontSize: '0.75rem',
                            color: '#6b7280',
                          }}
                        >
                          {line.description}
                        </span>
                      )}
                    </span>
                    <span>
                      {line.originalTotal != null
                        ? fmtMoney(line.originalTotal)
                        : fmtMoney(line.total)}
                    </span>
                  </div>
                  {/* 4D-rev: itemized lines reveal their marked-up rows */}
                  {line.rows &&
                    line.rows.map((r, k) => (
                      <div
                        key={k}
                        style={{
                          ...row,
                          borderBottom: 'none',
                          color: '#6b7280',
                          fontSize: '0.8125rem',
                        }}
                      >
                        <span style={{ paddingLeft: '0.75rem' }}>{r.name}</span>
                        <span>{fmtMoney(r.total)}</span>
                      </div>
                    ))}
                  {line.originalTotal != null && (
                    <>
                      <div style={{ ...row, borderBottom: 'none', color: '#16a34a' }}>
                        <span style={{ flex: 1, textAlign: 'right' }}>
                          Discount ({line.discountLabel}):
                        </span>
                        <span>−{fmtMoney(line.originalTotal - line.total)}</span>
                      </div>
                      <div style={{ ...row, fontWeight: 700 }}>
                        <span style={{ flex: 1, textAlign: 'right' }}>Line total:</span>
                        <span>{fmtMoney(line.total)}</span>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        ))}

      {/* Totals block */}
      <div style={{ maxWidth: '320px', marginLeft: 'auto', marginTop: '1rem' }}>
        <div style={row}>
          <span>Subtotal</span>
          <span>{fmtMoney(estimate.subtotal)}</span>
        </div>
        {estimate.discountTotal > 0 && (
          <div style={row}>
            <span>Discount</span>
            <span>−{fmtMoney(estimate.discountTotal)}</span>
          </div>
        )}
        <div style={{ ...row, fontWeight: 700, borderTop: '2px solid #111827' }}>
          <span>Total</span>
          <span>{fmtMoney(estimate.grandTotal)}</span>
        </div>
      </div>

      {/* Allowances */}
      {allowances.length > 0 && (
        <div
          style={{
            marginTop: '1.25rem',
            padding: '0.875rem',
            backgroundColor: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: '0.5rem',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Allowances</div>
          <div style={{ fontSize: '0.75rem', color: '#92400e', marginBottom: '0.5rem' }}>
            The following amounts are allowances for client-selected items. Final pricing
            depends on the selections made.
          </div>
          {allowances.map((a, i) => (
            <div key={i} style={{ ...row, borderBottom: 'none', padding: '0.125rem 0' }}>
              <span>
                {a.name}
                {a.lineName ? ` (${a.lineName})` : ''}
              </span>
              <span>{fmtMoney(a.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Terms */}
      {visibleTerms.length > 0 && (
        <div>
          <div style={sectionTitle}>Terms &amp; Conditions</div>
          {visibleTerms.map((section, i) => (
            <div key={i} style={{ marginBottom: '0.75rem' }}>
              <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>{section.name}</div>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.875rem', color: '#374151' }}>
                {section.content}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
