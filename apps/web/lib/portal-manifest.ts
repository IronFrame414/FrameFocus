import type { MetadataRoute } from 'next';
import { brand } from '@/lib/brand';

/**
 * M9 R12 / Q5 — the CLIENT PORTAL's web app manifest.
 *
 * ===========================================================================
 * ⚠️ THE CREW MANIFEST IS NOT TOUCHED. THAT WAS THE CONSTRAINT.
 * ===========================================================================
 * `app/manifest.ts` keeps `start_url: '/m'` and every other value it had. A
 * client and a field crew member installing "the app" must land in different
 * places, and changing the shared manifest to serve the client would redirect
 * every field user's home-screen icon.
 *
 * The mechanism, and it is the SUPPORTED one rather than a trick: Next's
 * `manifest` FILE convention is collected only at the app root (a
 * `app/portal/manifest.ts` is never detected), but `metadata.manifest` may be
 * set to any URL in any nested layout, and metadata merges shallowly — a nested
 * segment REPLACES the parent's value for that field. So `app/portal/layout.tsx`
 * points at this one and exactly one `<link rel="manifest">` is emitted under
 * `/portal`. Nothing under `/m` or `/dashboard` sees it.
 *
 * ===========================================================================
 * ⚠️ THE NAME IS NEUTRAL, AND IT IS THE ONE PLACE R20 CANNOT BE SATISFIED
 * ===========================================================================
 * R20 says the company's identity replaces the product's inside the portal, and
 * the portal does that everywhere it can. **It cannot do it here**, for two
 * reasons that compound:
 *
 *   1. **One document, every tenant.** There is no per-company URL — §11 rules
 *      out a subdomain and a path-carried company.
 *   2. The document is served from a static, cached route, so it cannot vary by
 *      caller as written.
 *
 * So the home-screen label under a client's portal icon reads "Project Portal"
 * and not the contractor's name. **`brand.name` is deliberately ABSENT** — R20's
 * point is that the product does not name itself to a client, and a neutral
 * label honours that even though it cannot go the whole way.
 *
 * ⚠️ **CORRECTION TO MY OWN REASONING, kept because the conclusion changed.**
 * The version first written here gave a second reason: *"A manifest is fetched
 * WITHOUT credentials … which Next emits only under a Vercel preview
 * deployment. So even a dynamic route handler could not see who is asking."*
 * **That is false, and it was measured false in this session.** Next 14.2 emits
 * `crossorigin="use-credentials"` on the manifest link in a plain local
 * production build:
 *
 *     <link rel="manifest" href="/portal.webmanifest" crossorigin="use-credentials"/>
 *
 * So the fetch DOES carry cookies, and a per-tenant portal manifest **is
 * achievable** — a dynamic route reading the session, returning the company's
 * name and `Cache-Control: private, no-store`, falling back to the neutral name
 * when there is no session (which is also what keeps §11 intact).
 *
 * **Not done here, and it is Josh's call, because the failure mode is real:** a
 * manifest is read at INSTALL time, so a client who installs from a cold start
 * with no session would get the generic label permanently, and the label an
 * installed app shows can drift from the one it was installed with. That is a
 * product decision about what a home-screen icon says, not an implementation
 * detail. Flagged rather than assumed either way.
 *
 * ===========================================================================
 * WHY `scope` IS SET HERE AND IS NOT SET ON THE CREW MANIFEST
 * ===========================================================================
 * `scope: '/portal'` keeps an installed portal from capturing navigations to
 * `/m` or `/dashboard` — a client's installed app must never open the field
 * shell, which is the failure §2.5 of the Phase 1 findings describes.
 *
 * ⚠️ The crew manifest has NO explicit scope, so its default is the manifest's
 * own directory — `/` — which technically contains `/portal`. **Adding
 * `scope: '/m'` there would be the correct symmetry and is NOT done here**,
 * because it changes what an already-installed field app captures, and the
 * brief for this work is explicit that crew behaviour does not move. Recorded
 * so the asymmetry reads as a decision.
 */
export function portalManifest(): MetadataRoute.Manifest {
  return {
    // See the header: neutral by necessity, and `brand.name` is absent by rule.
    name: 'Project Portal',
    short_name: 'Portal',
    description: 'Follow your project, review documents and see what you have been billed.',

    // The two fields that make this a DIFFERENT app from the crew shell.
    start_url: '/portal',
    scope: '/portal',

    // `standalone` is not cosmetic here — GATED.md Gate 4: iOS delivers Web
    // Push ONLY to an installed PWA, so this is the precondition for R12 on an
    // iPhone rather than a presentation choice.
    display: 'standalone',

    // Shared with the crew manifest on purpose: these tint OS chrome, and the
    // OS chrome is the platform's, not the tenant's. See lib/brand.ts on why
    // these are brand values rather than UI tokens.
    theme_color: brand.themeColor,
    background_color: brand.backgroundColor,

    // The same three icons. A separate icon set would be a second piece of
    // artwork to keep in step for no gain — the tile is the platform's mark,
    // and R20 governs what is INSIDE the app.
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
