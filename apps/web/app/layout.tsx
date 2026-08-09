import type { Metadata } from 'next';
import { Barlow, IBM_Plex_Mono } from 'next/font/google';
import { brand } from '@/lib/brand';
import './globals.css';

// ui-01 §S2 — the two 1a families, loaded via next/font (no other mechanism
// existed). Barlow = all UI text; IBM Plex Mono = all numbers + micro-labels.
// Do NOT load Barlow Semi Condensed (1c only).
const barlow = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-barlow',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: `${brand.name} — Construction Management`,
  description: 'The all-in-one platform for residential and commercial contractors.',

  // M6M §7.2 — home-screen install assets.
  //
  // The <link rel="manifest"> is NOT here: app/manifest.ts is a file
  // convention and Next injects that link itself. Adding it here too would
  // emit two.
  //
  // NO favicon.ico EXISTS. Next's automatic favicon handling keys off
  // app/favicon.ico specifically, so with none present nothing is emitted by
  // default and the browser falls back to requesting /favicon.ico -> 404.
  // These explicit entries are what prevent that.
  icons: {
    icon: [
      // SVG first: any browser that understands it takes it and scales
      // cleanly at every density. The 48px PNG is the fallback, and is listed
      // second so it is only used when the SVG is not supported.
      { url: '/app-icon.svg', type: 'image/svg+xml' },
      { url: '/favicon-ez-48.png', sizes: '48x48', type: 'image/png' },
    ],
    // iOS ignores the manifest icons for the home-screen tile and uses this.
    // 180x180 is the size current iPhones ask for.
    apple: [{ url: '/apple-touch-icon-180.png', sizes: '180x180', type: 'image/png' }],
  },

  // §7.2 — iOS home-screen install. Required before Web Push works on iPhone
  // at all (Safari 16.4+ delivers push only to an installed PWA), which is why
  // this is a prerequisite rather than polish.
  appleWebApp: {
    capable: true,
    // The home-screen label on iOS. Same short form as the manifest.
    title: brand.shortName,
    // 'black', deliberately, and NOT 'black-translucent': translucent makes
    // content render UNDER the status bar, which needs safe-area-inset padding
    // at the TOP of the shell. The shell is built now [S105] but pads the
    // safe area at the bottom only (the tab bar) — the app bar does not, so
    // translucent would still ship an overlap. 'black' does not overlay and
    // sits closer to the navy app bar than 'default' (a white strip) would.
    // Revisit only with top safe-area padding in hand, and check A-26e still
    // holds — this pair of metas is the iOS Web Push precondition (D-10);
    // losing them silently blocks Gate 4.
    statusBarStyle: 'black',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${barlow.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
