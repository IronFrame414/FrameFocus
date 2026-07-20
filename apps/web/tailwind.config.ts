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
