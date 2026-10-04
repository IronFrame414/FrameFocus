import { markupFingerprint } from '@framefocus/shared/utils/markup';

/**
 * [S127 P-3] A thumbnail's STABLE URL: the app proxy, versioned by the markup
 * fingerprint (the stored thumbnail's own name carries it), so the browser may
 * cache it and an edit to the markup changes the URL. Never a signed URL.
 *
 * [S128] Moved here from lib/services/photos.ts (which re-exports it) so a
 * CLIENT component can build the same URL — the project cover on /m and desktop
 * — without importing a server module. One implementation, not two.
 */
export function thumbProxyUrl(fileId: string, markup: unknown): string {
  const v = markup !== null && markup !== undefined ? markupFingerprint(markup) : 'o';
  return `/api/photos/${fileId}/thumb?v=${v}`;
}
