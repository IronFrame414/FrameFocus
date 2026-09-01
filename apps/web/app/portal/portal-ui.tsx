import type { CSSProperties, ReactNode } from 'react';
import { cardStyle, color, font } from '@/lib/theme';

/**
 * Module 9 stage 4 — the portal's shared presentation pieces.
 *
 * ⚠️ SERVER-SAFE ON PURPOSE. Nothing here is `'use client'`, because nothing
 * here holds state. The portal's read surfaces are all server components so the
 * caller's session — and therefore RLS — is the only thing that decides what
 * renders. A client component would need the data handed to it, and handing it
 * over is where a bypass gets written.
 *
 * The tokens come from `lib/theme.ts`, the same ones the dashboard uses. R20
 * swaps the COMPANY's identity in (logo, name, brand colour); it does not give
 * the client a different design system.
 */

export function PortalCard({
  title,
  subtitle,
  children,
  action,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section style={{ ...cardStyle, padding: '20px 22px', marginBottom: '16px' }}>
      {(title || action) && (
        <header
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: '12px',
            marginBottom: subtitle ? '4px' : '14px',
          }}
        >
          {title && (
            <h2
              style={{
                fontFamily: font.sans,
                fontSize: '17px',
                fontWeight: 700,
                color: color.navy,
                margin: 0,
              }}
            >
              {title}
            </h2>
          )}
          {action}
        </header>
      )}
      {subtitle && (
        <p style={{ fontSize: '13px', color: color.muted, margin: '0 0 14px' }}>{subtitle}</p>
      )}
      {children}
    </section>
  );
}

/**
 * R16 — "a mostly empty page with a line telling her the project hasn't started
 * yet."
 *
 * One component, used everywhere a section has nothing in it, so the portal
 * never renders a bare heading over white space. An empty section is the NORMAL
 * state early in a job, not an error, and it must not read like one.
 */
export function PortalEmpty({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        fontSize: '13.5px',
        color: color.muted,
        margin: 0,
        padding: '18px 0',
        lineHeight: 1.6,
      }}
    >
      {children}
    </p>
  );
}

const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  signed: { bg: color.successBg, fg: color.successOnBg },
  notarized: { bg: color.successBg, fg: color.successOnBg },
  paid: { bg: color.successBg, fg: color.successOnBg },
  sent: { bg: color.blueTintAlt, fg: color.primary },
  active: { bg: color.blueTintAlt, fg: color.primary },
  complete: { bg: color.successBg, fg: color.successOnBg },
  on_hold: { bg: color.warningBg, fg: color.warning },
  cancelled: { bg: color.neutralBadgeBg, fg: color.neutralBadgeText },
};

export function PortalStatus({ value }: { value: string }) {
  const tone = STATUS_TONE[value] ?? { bg: color.neutralBadgeBg, fg: color.neutralBadgeText };
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 9px',
        borderRadius: '999px',
        backgroundColor: tone.bg,
        color: tone.fg,
        fontSize: '11px',
        fontWeight: 700,
        letterSpacing: '0.02em',
        textTransform: 'uppercase',
        fontFamily: font.mono,
      }}
    >
      {value.replace(/_/g, ' ')}
    </span>
  );
}

export const money = (v: number | null | undefined): string =>
  v === null || v === undefined
    ? '—'
    : v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export const day = (v: string | null | undefined): string =>
  v ? new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

export const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  padding: '11px 0',
  borderTop: `1px solid ${color.rowDivider}`,
  fontSize: '13.5px',
  color: color.body,
};

/**
 * A labelled fact in a row of them. [moved here S168 from the one-page project
 * view, when it stopped being one page — three of the four routes need it.]
 */
export function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontFamily: font.mono,
          fontSize: '10.5px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: color.mutedAlt,
          marginBottom: '4px',
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: '14px', color: color.navy, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

/** One line of a totals block. */
export function Total({
  label,
  value,
  strong,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px' }}>
      <span style={{ color: color.bodyAlt, fontWeight: strong ? 700 : 400 }}>{label}</span>
      <span style={{ color: color.navy, fontWeight: strong ? 800 : 600 }}>{money(value)}</span>
    </div>
  );
}

/** A cell in the full-detail invoice table. */
export function cell(align: 'left' | 'right'): CSSProperties {
  return {
    textAlign: align,
    fontSize: '12.5px',
    color: color.body,
    padding: '6px',
    borderBottom: `1px solid ${color.rowDivider}`,
  };
}
