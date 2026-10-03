// S127 P-3 — the thumbnail proxy's response contract, in one place so the
// route and its tests read the same values (a route file may export only its
// handlers and Next's config names).
//
// ⚠️⚠️ `private` — HARD CONDITION [S127 brief]. A `public` header would let
// Vercel's CDN keep the bytes and serve one company's thumbnail to another
// company's user requesting the same URL. `private` means only the browser
// that was authorised may keep it. `immutable` is safe because the URL is
// versioned by the markup fingerprint (`?v=`): an edit is a new URL.
export const THUMB_CACHE_CONTROL = 'private, max-age=604800, immutable';
export const THUMB_NOT_FOUND_CACHE_CONTROL = 'private, no-store';

/** Which object the proxy served — read by the e2e to classify tiles. */
export type ThumbSource = 'thumb' | 'derivative' | 'original';
export const THUMB_SOURCE_HEADER = 'X-Thumb-Source';
