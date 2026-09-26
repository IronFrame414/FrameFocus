// [S112, RULED Josh 3c] SHOW THE MARKED-UP IMAGE THE CLIENT JUST BUILT.
//
// A markup save flattens original + shapes into a JPEG in memory, uploads it
// as `{path}.markup.jpg`, and navigates to the viewer — which then DOWNLOADED
// THE SAME BYTES BACK to display them: a full-size round trip (2.09 MB on a
// 12 MP photo, 4.4 s at 4 Mbps down) spent re-fetching an image the phone had
// just made. This module holds that blob so the viewer can show it at once.
//
// SHARED, NOT SURFACE-OWNED (PARITY). `saveMarkup()` — the one save both
// editors call — is the only writer, so a save from either surface lands here
// identically. Readers are wherever a derivative is displayed right after a
// save (today: the /m viewer's stage; the desktop editor stays on its own live
// canvas after a save and never displays the derivative back).
//
// ⚠️ KEYED BY FINGERPRINT, NOT JUST FILE ID. The local bytes are shown only
// while the server says the photo carries EXACTLY the markup those bytes were
// built from. The fingerprint on both sides is `markupFingerprint()` over the
// markup AS STORED (jsonb's canonical key order): the save fingerprints the
// row the UPDATE returned, and the server fingerprints `files.markup_data`.
// So a later save from another device, a cleared markup, or a reload that
// lost this module's memory all fall through to the stored derivative — never
// to stale local bytes.
//
// In-memory only: it lives as long as the tab's JS context, which is exactly
// the client-side navigation from the editor to the viewer. Nothing persists.

type Entry = { fingerprint: string; url: string };

const entries = new Map<string, Entry>();

/** Called by saveMarkup() after the derivative upload succeeded. */
export function rememberLocalDerivative(fileId: string, fingerprint: string, blob: Blob): void {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return;
  const previous = entries.get(fileId);
  if (previous) URL.revokeObjectURL(previous.url);
  entries.set(fileId, { fingerprint, url: URL.createObjectURL(blob) });
}

/**
 * The just-built image for this photo, or null. Null unless the fingerprint
 * the server reports for the photo's current markup matches the one the bytes
 * were built from.
 */
export function localDerivativeFor(fileId: string, fingerprint: string | null): string | null {
  if (!fingerprint) return null;
  const entry = entries.get(fileId);
  return entry && entry.fingerprint === fingerprint ? entry.url : null;
}
