import { thumbPathFor } from '@framefocus/shared/utils/markup';

// [S111 D] Every image uploaded through the app now gets a stored grid
// thumbnail (`{path}.thumb.webp`, generated server-side right after the upload).
// A teardown that removes only the original leaves that thumbnail behind — no
// row points at it and the read policy makes it unreadable, but it is clutter,
// and CI would add a handful on every run (111 were found on rebuild-test).
//
// Pass the ORIGINAL paths a teardown is about to remove; this adds each one's
// plain thumbnail. Removing an object that does not exist is a no-op, so it is
// safe for non-images too.
export function withThumbnails(paths: string[]): string[] {
  return paths.flatMap((p) => [p, thumbPathFor(p, null)]);
}
