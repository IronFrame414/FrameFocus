import type { MetadataRoute } from 'next';
import { brand } from '@/lib/brand';

// M6M §7.1 — the PWA manifest. The FIELD CREW's, and it is unchanged.
//
// ---------------------------------------------------------------------------
// ⚠️ MOVED OUT OF `app/manifest.ts` AT S164, AND THE CONTENT IS BYTE-IDENTICAL
// ---------------------------------------------------------------------------
// _Superseded, quoted rather than deleted:_
//
//   "Next serves this at /manifest.webmanifest and injects the
//    <link rel='manifest'> itself. Do NOT hand-write that link in layout.tsx;
//    two manifest links is a spec violation and browsers pick unpredictably."
//
// Both sentences were true and the FIRST one is why M9 could not give the
// client portal its own manifest. **Measured, not reasoned about**: a nested
// layout exporting `metadata.manifest` had its `title` honoured and its
// `manifest` IGNORED — the served page still linked `/manifest.webmanifest`.
// Next collects the manifest FILE CONVENTION only at the app root and applies
// it AFTER the metadata chain, so nothing nested can override it.
//
// So the file convention is gone and the same object is now served by
// `app/manifest.webmanifest/route.ts` at **the same URL, with the same
// content-type and the same bytes**, linked from the root layout's
// `metadata.manifest`. A field user's installed app cannot tell the difference:
// `start_url` is still `/m`.
//
// The rule the superseded comment states still holds and is now enforced from
// the other end — the LINK is emitted by `metadata.manifest` (root layout for
// crew, `app/portal/layout.tsx` for the portal), never hand-written, so exactly
// one is emitted per page.
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

export function crewManifest(): MetadataRoute.Manifest {
  return {
    name: brand.name,
    short_name: brand.shortName,
    description: 'The all-in-one platform for residential and commercial contractors.',

    // The two fields M6M owns outright (§7.1).
    //
    // start_url is the mobile shell (D-12, §1) — NOT the desktop dashboard.
    // [S105] The S99 note that stood here — "/m does not exist yet; an
    // installed PWA opens on a 404" — is retired: the full /m tree is built
    // and an install now lands on the real shell.
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
