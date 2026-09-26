// [S111 D, option A] Ask the server to (re)generate a photo's stored grid
// thumbnail. Called after every displayable write from the browser — an image
// upload (uploadFile) and a markup save (saveMarkup) — shared by both surfaces.
//
// FIRE-AND-FORGET, NEVER THROWS, NEVER AWAITED BY THE WRITE IT FOLLOWS. The
// upload or save has already succeeded; a thumbnail that fails or is slow costs
// nothing visible, because the grid falls back to the FULL display file when no
// thumbnail exists (ruling: a slow tile is acceptable, an invisible photo is
// not). `keepalive` lets the request outlive a navigation that follows a save.
export function requestThumbnail(fileId: string): void {
  try {
    void fetch('/api/photos/thumbnail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // fetch unavailable (tests, very old browsers) — the fallback covers it.
  }
}
