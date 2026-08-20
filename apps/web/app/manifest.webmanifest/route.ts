import { NextResponse } from 'next/server';
import { crewManifest } from '@/lib/crew-manifest';

/**
 * Serves the FIELD CREW's manifest at `/manifest.webmanifest` — the same URL
 * Next's file convention served it from, with the same bytes.
 *
 * ⚠️ WHY THIS IS A ROUTE NOW AND WAS A FILE CONVENTION BEFORE [S164].
 * The convention is collected only at the app root and applied AFTER the
 * metadata chain, so a nested layout cannot override it — measured: a probe
 * layout's `title` was honoured and its `manifest` was ignored, and the page
 * still linked this document. That made a second manifest for the client portal
 * impossible while the convention was in place.
 *
 * ⚠️ MEASURED BEFORE AND AFTER, NOT ASSUMED. The served JSON is byte-identical,
 * the content-type is the same, `cache-control: public, max-age=0,
 * must-revalidate` is reproduced by the header below, and Next still emits
 * `crossorigin="use-credentials"` on the link. **No observable difference to a
 * field user.** If the cache header is ever dropped the symptom is a manifest
 * that stops being re-validated — a stale `start_url` on already-installed
 * phones, which is the worst class of PWA bug because it survives a reload.
 */
export function GET() {
  return NextResponse.json(crewManifest(), {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
}
