import { NextResponse } from 'next/server';
import { signedUrlFor } from '@/lib/services/files';
import { SIGNED_URL_TTL_SECONDS } from '@/lib/services/signed-url-ttl';
import { derivativePathFor } from '@framefocus/shared/utils/markup';

// TECH_DEBT #142 [S122] — THE ERROR CONTRACT, not the auth model.
//
// ===========================================================================
// ⚠️ THIS ROUTE STILL HAS NO AUTH CHECK OF ITS OWN, AND THAT IS CORRECT
// ===========================================================================
// `signedUrlFor` uses the USER'S RLS-scoped server client, so `createSignedUrl`
// on `project-files` is bound by `project_files_select_non_client`: a caller
// cannot sign a path they cannot read. M6M §4.11.6's "RLS does the gating, not
// the UI" rule stands, and #142 was explicit that this is NOT a reason to add a
// role check here. Do not add one.
//
// What was broken was what this route SAID when RLS refused. The refusal
// surfaced as a bare `null`, so the route answered 500 `Could not sign URL` —
// making a permission denial indistinguishable from a storage outage in both
// the response and the logs. CLAUDE.md forbids exactly that: permission
// failures return 401/403 with their own message, and every error response logs
// the real cause server-side with the route and the failing check.
//
// ===========================================================================
// ⚠️ 4xx → 403, AND WHY IT IS NOT 404
// ===========================================================================
// Storage DELIBERATELY CONFLATES "you may not read this" with "this is not
// here" — that conflation is an anti-enumeration property, not a bug, and it
// means this layer genuinely cannot separate the two. Given that, CLAUDE.md
// picks the answer for us: never fall through to a "not found" path on what may
// be a permission failure. A 4xx from Storage on this route IS the permission
// answer, because RLS is the only gate in front of it.
//
// The client message therefore does not claim which of the two it was — naming
// an unverified cause is the other half of the rule. The LOG carries Storage's
// own status, statusCode and message, so an operator can tell instantly.

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path');

  if (!path) {
    return NextResponse.json({ error: 'Missing path' }, { status: 400 });
  }

  // TECH_DEBT #100 — when the caller knows the file is annotated (hasMarkup),
  // it passes `markup=1` and the ORIGINAL path. We serve the flattened
  // `.markup.jpg` derivative so the marks are visible on open/download, and
  // DEGRADE to the original if the derivative is absent (save's derivative
  // step can fail independently of markup_data — A-23t / photos.ts resolveUrls).
  // The 403/anti-enumeration decision below is always made on the ORIGINAL
  // path, which is the real access question — the derivative is best-effort.
  if (searchParams.get('markup') === '1') {
    const derivative = await signedUrlFor(derivativePathFor(path), SIGNED_URL_TTL_SECONDS);
    if (derivative.url) {
      return NextResponse.json({ url: derivative.url });
    }
    // derivative missing/unreadable → fall through and sign the original.
  }

  const { url, error } = await signedUrlFor(path, SIGNED_URL_TTL_SECONDS);

  if (error) {
    // The log is never generic, even though the response is.
    console.error('[GET /api/files/signed-url] createSignedUrl failed', {
      check: 'storage RLS — project_files_select_non_client',
      path,
      storageStatus: error.status,
      storageCode: error.statusCode,
      storageError: error.name,
      message: error.message,
    });

    const denied = typeof error.status === 'number' && error.status >= 400 && error.status < 500;

    return denied
      ? NextResponse.json(
          { error: 'You do not have access to this file, or it is no longer available' },
          { status: 403 }
        )
      : NextResponse.json({ error: 'Could not sign URL' }, { status: 500 });
  }

  return NextResponse.json({ url });
}
