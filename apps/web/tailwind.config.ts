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
        brand: {
          50: '#eef1fb', // blue tint — ghost-primary bg
          100: '#e7ebf9', // blue tint — info chip bg
          200: '#cdd6e8', // nav text (inactive)
          300: '#8fa0c4', // sidebar secondary text
          400: '#7385d8', // inspection chip bar
          500: '#2f49d1', // PRIMARY — buttons, active nav, links
          600: '#1f33a8', // primary hover
          700: '#182a8a',
          800: '#1a2c54',
          900: '#14213d', // shell navy — sidebar bg, headings
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
        m6m: {
          navy: '#14213d', // app bar, primary text
          blue: '#2f49d1', // active state, icons, primary button
          amber: '#f59e0b', // camera action, avatar, primary field CTA, counts
          danger: '#c0362c', // sign out, damage/blocking badges
          surface: '#f4f6f9', // page background
          card: '#ffffff', // all cards and tiles
          border: '#e6e9ef', // card border
          muted: '#8a919c', // inactive tab, captions — on light
          'muted-navy': '#8fa0c4', // the same role, on navy
          canvas: '#0d1220', // photo viewer and markup ONLY (M-9, M-10)
          // §4.4's amber status strip. Not in the §2 table — §4.4 names the two
          // hexes inline, and they appear nowhere else, so they live here
          // rather than being retyped at each use site.
          'strip-bg': '#fdf6ec',
          'strip-border': '#f3e2c4',
          // §3.3's Sign-out row border. Same reasoning.
          'danger-border': '#f0d4d1',
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
