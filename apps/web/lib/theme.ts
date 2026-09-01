// 1a "Refined Navy" design tokens (ui-01 §4) for the inline-style screen
// bodies. The Tailwind theme (tailwind.config.ts) is the same palette for
// class-based components — these constants exist so style={{}} code reuses
// tokens instead of re-pasting hex (§S1). Pure constants: safe in server and
// client components alike.

export const color = {
  // Shell / primary — README palette values per the desktop-redesign spec §2
  // R5: navy/primary and their near-identical shades move; text ramp, hover
  // and semantic colours have no README counterpart and deliberately stay.
  navy: '#0f1729', // sidebar bg, headings, primary text, dark cards
  navText: '#cdd6e8', // sidebar nav text (inactive)
  navySecondary: '#8fa0c4', // sidebar secondary text
  primary: '#3b4ae0', // buttons, active nav, active tab, progress fill, links
  primaryHover: '#1f33a8',
  blueTint: '#f2f4ff', // ghost-primary bg (same token as the Tailwind 50 stop)
  blueTintAlt: '#e8ecfb', // info chip bg (same token as the Tailwind 100 stop)
  amber: '#f59e0b', // logo "Works", avatar, event accents

  // Surfaces
  pageBg: '#f4f6fa',
  cardBg: '#ffffff',
  cardBorder: '#e4e8ef',
  tableHeadBg: '#fbfcfe', // table header / total-row bg
  rowDivider: '#f4f6fa',
  inputBorder: '#d5dae4',

  // Text — the README ramp, adopted whole (R5 AS AMENDED [Josh, 2026-08-28]:
  // the original R5 scoped this pass to navy/primary + near-identical shades;
  // that was under-scoped and the design's text/semantic ramp is ruled in).
  body: '#3f4a60',
  bodyAlt: '#4b5670',
  muted: '#7b8699',
  mutedAlt: '#8792a8',
  faint: '#9aa4b8', // placeholder / disabled / em-dash
  faintAlt: '#c3cad8',

  // Semantic — the design carries ONE warning text (#b45309) and ONE danger
  // red (#c0362c). The duplicate token names `warningDeep` (== `warning`) and
  // `dangerAlt` (== `danger`) were consolidated away [register K8, S180]: the
  // base names `warning`/`danger` are what new code reaches for, so they stay
  // and the aliases were deleted with their call sites rewritten. This is a
  // rename only — the hex values are unchanged (these are semantic-status
  // colours, deliberately NOT the brand amber #EDA122).
  success: '#1f8f4e',
  successBg: '#e6f0e9',
  successOnBg: '#3d7a4b',
  warning: '#b45309',
  warningBg: '#fdece0',
  danger: '#c0362c',
  neutralBadgeBg: '#eef1f6',
  neutralBadgeText: '#7b8699',

  // Desktop-redesign spec §2 additions. The row tints are TOKENS, NOT
  // BEHAVIOUR — tables are per-page inline styles, so every screen that tints
  // a row applies these itself, per that screen's spec.
  purple: '#5b45c4', // subcontractor category, Owner role, retainage
  purpleBg: '#ede9f8',
  rowTintAttention: '#fffdf7', // table row needing attention (amber)
  rowTintProblem: '#fdf7f6', // table row with a compliance/data failure (red)
} as const;

export const font = {
  sans: 'var(--font-barlow), Barlow, system-ui, sans-serif',
  mono: 'var(--font-plex-mono), "IBM Plex Mono", ui-monospace, monospace',
} as const;

// ---------------------------------------------------------------------------
// Shared style fragments (ui-01 §4 geometry) for inline-style screens.
// ---------------------------------------------------------------------------

/** White card: border not shadow (§4 — the heavy prototype shadow is frame-only). */
export const cardStyle: React.CSSProperties = {
  backgroundColor: color.cardBg,
  border: `1px solid ${color.cardBorder}`,
  borderRadius: '13px',
};

/**
 * Permanent attention-card treatment (desktop-redesign spec §2 R7). The README
 * calls this a review device that disappears on acceptance; Josh overruled
 * that FOR THE CARD STYLE ONLY — blocking-work and expiring-soon cards wear it
 * permanently. The NEW badge still disappears. Compose over cardStyle:
 * `{...cardStyle, ...attentionCardStyle}`.
 */
export const attentionCardStyle: React.CSSProperties = {
  border: '1.5px solid #f5cf8f',
  boxShadow: '0 0 0 4px rgba(245,165,36,.09)',
};

/** Page H2 (25–28px / 800 / navy / −.01em). */
export const h2Style: React.CSSProperties = {
  fontFamily: font.sans,
  fontSize: '26px',
  fontWeight: 800,
  letterSpacing: '-0.01em',
  color: color.navy,
  margin: 0,
};

/** IBM Plex Mono uppercase micro-label (11px / 600 / .04em). */
export const microLabelStyle: React.CSSProperties = {
  fontFamily: font.mono,
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: color.mutedAlt,
};

/** Primary button (§4: 9px 16px, radius 9, #2f49d1 → hover #1f33a8). */
export const primaryButtonStyle: React.CSSProperties = {
  padding: '9px 16px',
  borderRadius: '9px',
  backgroundColor: color.primary,
  color: '#fff',
  fontFamily: font.sans,
  fontSize: '13px',
  fontWeight: 600,
  border: 'none',
  cursor: 'pointer',
  textDecoration: 'none',
  display: 'inline-block',
  transition: 'background-color 140ms ease',
};

/** Secondary button (white / 1px #e0e4ea / #374151). */
export const secondaryButtonStyle: React.CSSProperties = {
  padding: '9px 16px',
  borderRadius: '9px',
  backgroundColor: '#fff',
  color: color.body,
  fontFamily: font.sans,
  fontSize: '13px',
  fontWeight: 600,
  border: `1px solid ${color.inputBorder}`,
  cursor: 'pointer',
  textDecoration: 'none',
  display: 'inline-block',
  transition: 'background-color 140ms ease',
};

/** Status badge base (Barlow 600 / 12px, 4px 10px, radius 20). */
export const badgeStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '4px 10px',
  borderRadius: '20px',
  fontFamily: font.sans,
  fontSize: '12px',
  fontWeight: 600,
};
