// 1a "Refined Navy" design tokens (ui-01 §4) for the inline-style screen
// bodies. The Tailwind theme (tailwind.config.ts) is the same palette for
// class-based components — these constants exist so style={{}} code reuses
// tokens instead of re-pasting hex (§S1). Pure constants: safe in server and
// client components alike.

export const color = {
  // Shell / primary
  navy: '#14213d', // sidebar bg, headings, primary text, dark cards
  navText: '#cdd6e8', // sidebar nav text (inactive)
  navySecondary: '#8fa0c4', // sidebar secondary text
  primary: '#2f49d1', // buttons, active nav, active tab, progress fill, links
  primaryHover: '#1f33a8',
  blueTint: '#eef1fb', // ghost-primary bg
  blueTintAlt: '#e7ebf9', // info chip bg
  amber: '#f59e0b', // logo "Works", avatar, event accents

  // Surfaces
  pageBg: '#f4f6f9',
  cardBg: '#ffffff',
  cardBorder: '#e6e9ef',
  tableHeadBg: '#f7f9fc', // table header / total-row bg
  rowDivider: '#f1f3f7',
  inputBorder: '#e0e4ea',

  // Text
  body: '#374151',
  bodyAlt: '#4b5563',
  muted: '#6b7280',
  mutedAlt: '#8a919c',
  faint: '#9aa1ac', // placeholder / disabled / em-dash
  faintAlt: '#c3c9d4',

  // Semantic
  success: '#16a34a',
  successBg: '#e4f0e6',
  successOnBg: '#3d7a4b',
  warning: '#d97706',
  warningDeep: '#b45309',
  warningBg: '#fdece0',
  danger: '#dc2626',
  dangerAlt: '#c0362c',
  neutralBadgeBg: '#eef1f6',
  neutralBadgeText: '#6b7280',
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
