import type { MetadataRoute } from 'next';
import { brand } from '@/lib/brand';

// M6M §7.1 — the PWA manifest.
//
// Next serves this at /manifest.webmanifest and injects the
// <link rel="manifest"> itself. Do NOT hand-write that link in layout.tsx;
// two manifest links is a spec violation and browsers pick unpredictably.
//
// ---------------------------------------------------------------------------
// EVERY BRAND VALUE IS IMPORTED. NONE IS A LITERAL. (§7.1)
// ---------------------------------------------------------------------------
// §7.1 is explicit that the manifest OWNS only `start_url` and `display`;
// name, short_name, theme_color and background_color are INHERITED from the
// rebrand's single shared source. The spec's own words: "a build that fills
// them from this spec has filled them wrong." Hence `brand.*` throughout —
// lib/brand.ts is that source.
//
// `short_name` matters more than it looks: it is the label under the icon on
// a phone home screen, and §7.1 calls a stale value there "the most visible
// possible regression". brand.shortName is kept ≤12 chars for that reason.
//
// ---------------------------------------------------------------------------
// theme_color IS NOT §2's navy TOKEN, EVEN THOUGH THE HEX MATCHES (§7.3)
// ---------------------------------------------------------------------------
// §7.3 answers this directly: they are two decisions that coincide on one
// value today. §2's `navy` is a UI token colouring the app bar INSIDE the app;
// theme_color is OS chrome — status bar, task-switcher card. Importing one
// from the other would let a future brand-chrome change silently drag the
// in-app palette, or block it. lib/brand.ts carries its own copy on purpose
// and explains why at length. Do not "de-duplicate" these.
//
// ---------------------------------------------------------------------------
// THE ICON IS INDIGO (#3F47CF) AND THE APP IS NAVY. THIS IS CORRECT.
// ---------------------------------------------------------------------------
// Ruled [Josh, S98]: indigo lives ONLY in the app-icon artwork. The tile will
// not match the app bar, and is not supposed to. Do not reconcile them.

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: brand.name,
    short_name: brand.shortName,
    description: 'The all-in-one platform for residential and commercial contractors.',

    // The two fields M6M owns outright (§7.1).
    //
    // start_url is the mobile shell (D-12, §1) — NOT the desktop dashboard.
    // NOTE [S99]: /m does not exist yet; the route tree is specced, not built.
    // Until it lands, an installed PWA opens on a 404. That is the spec's
    // intent — §7 is a PREREQUISITE built ahead of the routes — but it means
    // this must not be advertised as installable to real users yet.
    start_url: '/m',
    display: 'standalone',

    theme_color: brand.themeColor,
    background_color: brand.backgroundColor,

    // §7.2 — 192, 512, and a 512 maskable. The maskable is a genuinely
    // different file, not a re-export: it is full-bleed (no rounded corners of
    // its own) with the artwork inset into the safe zone, so Android's mask can
    // crop it to a circle/squircle without clipping the wordmark. Serving the
    // standard icon as maskable is the classic error and produces a visibly
    // cropped tile.
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
