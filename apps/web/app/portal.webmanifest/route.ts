import { NextResponse } from 'next/server';
import { portalManifest } from '@/lib/portal-manifest';

/**
 * Serves the client portal's manifest at `/portal.webmanifest`.
 *
 * ⚠️ A ROUTE HANDLER, NOT A `manifest.ts` FILE CONVENTION. Next collects the
 * manifest file convention **only at the app root** — `app/portal/manifest.ts`
 * would never be detected, silently, and the portal would keep serving the crew
 * manifest with `start_url: '/m'`. A URL in `metadata.manifest` is the
 * documented way to link a route-specific manifest from a nested layout.
 *
 * ⚠️ AND IT IS SERVED FROM THE ROOT PATH ON PURPOSE. A manifest's default scope
 * is its own directory, and browsers reject a `scope` broader than that. Served
 * from `/portal/...` this document could not declare `scope: '/portal'` without
 * a trailing-slash argument; served from `/` it can. The manifest's location and
 * the app's scope are separate things and this keeps them from colliding.
 */
export function GET() {
  return NextResponse.json(portalManifest(), {
    headers: {
      'Content-Type': 'application/manifest+json',
      // Static for every caller — see `lib/portal-manifest.ts` on why it cannot
      // be per-tenant. Cached briefly so an install prompt does not re-fetch it
      // on every navigation, short enough that a change ships within the hour.
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
