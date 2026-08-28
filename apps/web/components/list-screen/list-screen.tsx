'use client';

import { attentionCardStyle, cardStyle, color, font, h2Style, microLabelStyle } from '@/lib/theme';

// ============================================================================
// Desktop redesign, build step 4 — the SHARED LIST-SCREEN ANATOMY.
// ============================================================================
// The six list screens (Projects · Cost Catalog · Contacts · Team · Subs &
// Vendors · Estimates) share one anatomy: page header → alert strip → metric
// strip → filter chips + search → table card. These are the shared pieces,
// built once on 14a and applied five more times.
//
// DELIBERATELY NOT SHARED: the table itself. The six tables differ in columns,
// grids, reflows and row affordances; a generic table component would be a
// framework, not a pattern. Tables stay per-screen, on the theme tokens.

/** Page header: title, counts subtitle, right-aligned actions (search, CTA). */
export function ListPageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '18px',
      }}
    >
      <div>
        <h2 style={h2Style}>{title}</h2>
        {subtitle && (
          <p style={{ color: color.muted, fontSize: '14px', margin: '4px 0 0' }}>{subtitle}</p>
        )}
      </div>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>{children}</div>
    </div>
  );
}

/** The standard search input for the header's action area. */
export function ListSearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '220px',
        padding: '9px 12px',
        backgroundColor: '#fff',
        border: `1px solid ${color.inputBorder}`,
        borderRadius: '9px',
        fontFamily: font.sans,
        fontSize: '13px',
        color: color.body,
      }}
    />
  );
}

export interface Metric {
  label: string;
  value: React.ReactNode;
  /** Small qualifier under the value (e.g. "active jobs"). */
  sub?: string;
}

/** Metric strip — a row of stat cards under the header. Renders nothing on an
 *  empty list so a gated role's strip reflows rather than showing husks. */
export function MetricStrip({ metrics }: { metrics: Metric[] }) {
  if (metrics.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
      {metrics.map((m) => (
        <div key={m.label} style={{ ...cardStyle, padding: '12px 16px', minWidth: '150px' }}>
          <p style={{ ...microLabelStyle, marginBottom: '4px' }}>{m.label}</p>
          <p
            style={{
              fontFamily: font.mono,
              fontSize: '20px',
              fontWeight: 700,
              color: color.navy,
              margin: 0,
            }}
          >
            {m.value}
          </p>
          {m.sub && (
            <p style={{ fontSize: '11px', color: color.faint, margin: '2px 0 0' }}>{m.sub}</p>
          )}
        </div>
      ))}
    </div>
  );
}

/** Permanent attention banner (R7 — attentionCardStyle is a named token, not a
 *  review device). Callers render it only when there is something to say;
 *  an empty alert strip is silence, not an empty box. */
export function AlertStrip({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        ...cardStyle,
        ...attentionCardStyle,
        padding: '11px 16px',
        marginBottom: '16px',
        fontFamily: font.sans,
        fontSize: '13px',
        fontWeight: 500,
        color: color.body,
      }}
    >
      {children}
    </div>
  );
}

/** Filter chips. The caller owns the state contract (URL param or local). */
export function FilterChips({
  options,
  selected,
  onSelect,
}: {
  options: { value: string; label: string }[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' }}>
      {options.map((f) => {
        const isSelected = selected === f.value;
        return (
          <button
            key={f.value}
            onClick={() => onSelect(f.value)}
            style={{
              padding: '7px 14px',
              fontFamily: font.sans,
              fontSize: '13px',
              fontWeight: 600,
              borderRadius: '8px',
              border: isSelected ? '1px solid transparent' : `1px solid ${color.cardBorder}`,
              backgroundColor: isSelected ? color.navy : '#fff',
              color: isSelected ? '#fff' : color.bodyAlt,
              cursor: 'pointer',
            }}
          >
            {f.label}
          </button>
        );
      })}
    </div>
  );
}
