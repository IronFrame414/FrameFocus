import type { Metadata, Viewport } from 'next';
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
  // ⚠️ THE MANIFEST LINK IS HERE NOW [S164]. _Superseded, quoted rather than
  // deleted:_ "The <link rel='manifest'> is NOT here: app/manifest.ts is a file
  // convention and Next injects that link itself. Adding it here too would emit
  // two."
  //
  // The file convention is gone — it is collected only at the app root and
  // applied AFTER the metadata chain, so nothing nested could override it, and
  // M9's client portal needs its own (`app/portal/layout.tsx`). Measured before
  // changing anything: a nested layout's `title` overrode and its `manifest`
  // did not.
  //
  // The rule the old comment protects is unchanged and is still enforced —
  // exactly ONE link per page, emitted by `metadata.manifest`, never
  // hand-written in JSX. This is the crew/default one; `/portal` replaces it
  // for its own subtree.
  //
  // Verified after the change, not assumed: the served document is
  // byte-identical, the content-type and cache-control headers match, and Next
  // still emits `crossorigin="use-credentials"` on the link. A field user's
  // installed app cannot tell the difference — `start_url` is still `/m`.
  manifest: '/manifest.webmanifest',
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
    // 'black-translucent' [S121 1-A, RULED Josh ASK-33]: the status-bar strip
    // must be the header navy, not white or black. Translucent renders the page
    // UNDER the status bar, so the /m app bar pads itself down by
    // env(safe-area-inset-top) (mobile-shell.tsx) and its navy fills the strip;
    // the status-bar text stays WHITE, on navy. That padding only resolves
    // because `viewport` below sets viewportFit: 'cover'.
    // SUPERSEDED [S97/S105]: "'black', deliberately, and NOT 'black-translucent'
    // … the app bar does not [pad the top safe area], so translucent would
    // still ship an overlap." The app bar now does.
    // Check A-26e still holds — this pair of metas is the iOS Web Push
    // precondition (D-10); losing them silently blocks Gate 4.
    statusBarStyle: 'black-translucent',
  },
};

// [S121 1-A] Next 14 emits <meta name="theme-color"> ONLY from this export —
// before it, no page carried one, so the OS chrome had no navy to use.
// viewportFit 'cover' is what makes env(safe-area-inset-*) non-zero on iOS;
// without it every safe-area padding in the shell resolved to 0.
export const viewport: Viewport = {
  themeColor: brand.themeColor,
  viewportFit: 'cover',
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
