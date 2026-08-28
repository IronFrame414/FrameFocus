import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    '../../packages/ui/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // 1a "Refined Navy" tokens (ui-01 §4) — replaces the old Steel Blue
        // scale IN PLACE (§S1): stop semantics preserved (500 = primary
        // button, 600 = hover, 900 = darkest shell) so existing consumers
        // (auth pages) shift to the new palette without class changes.
        // Desktop-redesign spec §2: README-named stops only (50/100/500/900).
        // 200/300 keep their values because the design files still use those
        // exact hexes; 400/600/700/800/950 have no README counterpart and
        // re-deriving a scale is invention beyond the handoff.
        brand: {
          50: '#f2f4ff', // blue tint — ghost-primary bg
          100: '#e8ecfb', // blue tint — info chip bg
          200: '#cdd6e8', // nav text (inactive)
          300: '#8fa0c4', // sidebar secondary text
          400: '#7385d8', // inspection chip bar
          500: '#3b4ae0', // PRIMARY — buttons, active nav, links
          600: '#1f33a8', // primary hover
          700: '#182a8a',
          800: '#1a2c54',
          900: '#0f1729', // shell navy — sidebar bg, headings
          950: '#0e1830',
        },
        // Amber accent (logo "Works", avatar, event accents) — unchanged 500,
        // warning family per ui-01 §4.
        accent: {
          50: '#fffbeb',
          100: '#fdece0', // warning bg
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b', // amber accent
          600: '#d97706', // warning text
          700: '#b45309', // warning text (deep)
          800: '#92400e',
          900: '#78350f',
        },
        // M6M §2 — the mobile PWA's design tokens, verbatim.
        //
        // WHY A SEPARATE NAMESPACE AND NOT `brand`/`accent`. Three of these
        // values already exist on the 1a scale (brand.900 = navy, brand.500 =
        // blue, accent.500 = amber) and four do not (surface, card border,
        // muted-on-light, danger). Folding the new four into `brand`/`accent`
        // would renumber a live scale that every dashboard screen consumes.
        // Folding the mobile shell into `brand-900`/`brand-500` instead would
        // couple §2 to a palette it does not own — a future 1a revision would
        // silently repaint the field app. So: one namespace, all eight tokens
        // spelled out, and the duplicated hexes are duplicated ON PURPOSE.
        // Purely additive; no existing class changes meaning. A-28 untouched.
        //
        // ⚠️ R6, desktop-redesign spec §2 — RULED [Josh]: the protection the
        // paragraph above describes is DELIBERATELY DECLINED. One product, one
        // palette: a desktop repaint now moves m6m too, on purpose. The
        // namespace stays (structure is still ruled), but the duplicated hexes
        // track theme.ts. Two exceptions, both ruled: `canvas` (photo/markup
        // working surface, not a brand colour) and `danger` stay.
        m6m: {
          navy: '#0f1729', // app bar, primary text
          blue: '#3b4ae0', // active state, icons, primary button
          amber: '#f59e0b', // camera action, avatar, primary field CTA, counts
          danger: '#c0362c', // sign out, damage/blocking badges — RULED: stays
          surface: '#f4f6fa', // page background
          card: '#ffffff', // all cards and tiles
          border: '#e4e8ef', // card border
          muted: '#8792a8', // inactive tab, captions — on light
          'muted-navy': '#8fa0c4', // the same role, on navy
          canvas: '#0d1220', // photo viewer and markup ONLY (M-9, M-10)
          // §4.4's amber status strip. Not in the §2 table — §4.4 names the two
          // hexes inline, and they appear nowhere else, so they live here
          // rather than being retyped at each use site. Values now follow the
          // README's page-level warning (R5 as amended — ramp adopted).
          'strip-bg': '#fff5e6',
          'strip-border': '#f5cf8f',
          // §3.3's Sign-out row border. Same reasoning; README danger border.
          'danger-border': '#efd3d0',
        },
      },
      fontFamily: {
        sans: ['var(--font-barlow)', 'Barlow', 'system-ui', 'sans-serif'],
        mono: ['var(--font-plex-mono)', 'IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
