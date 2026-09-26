'use client';

// SHARING A PHOTO — THE BYTES, NOT A CAPTION. [S121]
//
// ===========================================================================
// THE DEFECT
// ===========================================================================
// Both share surfaces computed the right target and then threw it away:
//
//   viewer.tsx     const target = shareTargetFor(photo);   // url computed…
//                  await nav.share({ title, text });        // …and discarded
//   photo-grid.tsx await nav.share({ title, text: names.join(', ') });
//
// So "Share" opened the OS sheet and transmitted a filename. It is the failure
// mode worth fixing first because it does not look like a failure: the sheet
// appears, the user picks a recipient, the send succeeds, and what arrives is
// the word "IMG_4471.jpg". A control that does nothing is reported in a day; a
// control that silently does the wrong thing is trusted until someone on site
// asks why the photo never came.
//
// ⚠️ It also defeated A-23t. `shareTargetFor` exists to decide whether the
// MARKED derivative or the unmarked original is what should travel, and warns
// when a marked photo has to degrade — "the sub receiving it would have no way
// to know the circle showing which stud was meant never made it". None of that
// could matter while the URL went unused.
//
// ===========================================================================
// ⚠️ FILES ONLY. NEVER FALL BACK TO SHARING THE URL.
// ===========================================================================
// The obvious degradation — `nav.share({ url })` where files are unsupported —
// is the one thing this must not do. Those URLs are **Supabase signed URLs**:
// time-limited bearer credentials to a private project file. Putting one in a
// text message hands whoever receives it, and every system that message passes
// through, direct access to the object for the life of the signature — no
// login, no RLS, no audit. A share sheet is exactly where a link gets forwarded.
//
// So: share the bytes or say the browser cannot. Ruled here [S121].
//
// ===========================================================================
// WHY THE FETCH IS NOT WASTEFUL
// ===========================================================================
// The image is already in the browser's HTTP cache — it is being displayed —
// so `fetch` on the same URL is normally served from cache. On a cold cache it
// is one request the user explicitly asked for by tapping Share.

// [S112 R1] A share item is a URL to fetch OR bytes already built. A marked-up
// photo is shared as a full-resolution rebuild made in the browser
// (lib/markup/export-marked.ts) — there is no URL for it, so a URL-only
// signature could only ever send the display-size stored derivative.
// A `blob: null` means the caller could not produce bytes (fetch-failed).
export type ShareImage =
  | { url: string | null; fileName: string }
  | { blob: Blob | null; fileName: string };

export type ShareOutcome =
  | { ok: true }
  | {
      ok: false;
      reason: 'unsupported' | 'no-url' | 'fetch-failed' | 'cancelled' | 'not-allowed';
    };

type ShareCapableNavigator = Navigator & {
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data: ShareData) => boolean;
};

/**
 * Turn a URL into a `File` the Web Share API can transmit.
 *
 * The MIME type comes from the RESPONSE, not from the filename: a `.jpg` that
 * is actually a PNG (HEIC conversion output, for instance) must not be
 * mislabelled, or the receiving app may refuse it.
 */
async function fileFromUrl(url: string, fileName: string): Promise<File | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return new File([blob], fileName, { type: blob.type || 'image/jpeg' });
  } catch {
    return null;
  }
}

/**
 * Share one or more images as FILES.
 *
 * Returns an outcome rather than throwing, so the caller can put the right
 * sentence on screen — a share that cannot happen must say why, which was the
 * other half of what the old code got right and this must not lose.
 */
export async function shareImages(images: ShareImage[]): Promise<ShareOutcome> {
  const nav = navigator as ShareCapableNavigator;
  if (!nav.share) return { ok: false, reason: 'unsupported' };

  // A blob item counts as a source even when null — its bytes were attempted,
  // so an all-null set is `fetch-failed`, not `no-url`.
  const sources = images.filter((i) => ('blob' in i ? true : Boolean(i.url)));
  if (sources.length === 0) return { ok: false, reason: 'no-url' };

  const files = (
    await Promise.all(
      sources.map((i) =>
        'blob' in i
          ? i.blob
            ? new File([i.blob], i.fileName, { type: i.blob.type || 'image/jpeg' })
            : null
          : fileFromUrl(i.url as string, i.fileName)
      )
    )
  ).filter((f): f is File => f !== null);

  if (files.length === 0) return { ok: false, reason: 'fetch-failed' };

  // `canShare` is the ONLY reliable feature test for file sharing — `share`
  // exists on browsers that accept no files at all and would reject at call
  // time, after the user has already tapped.
  if (!nav.canShare?.({ files })) return { ok: false, reason: 'unsupported' };

  try {
    await nav.share({ files });
    return { ok: true };
  } catch (err) {
    // [S112 R1] NotAllowedError = the browser no longer counts this as a
    // response to the tap. `share()` needs transient user activation (~5 s),
    // and a full-resolution rebuild of a 12 MP photo can take most of that on
    // a phone. It is NOT a cancel and must not be silent — the caller keeps
    // the bytes it built, so a second tap shares at once.
    if ((err as { name?: unknown } | null)?.name === 'NotAllowedError') {
      return { ok: false, reason: 'not-allowed' };
    }
    // A dismissed sheet is a cancel, not an error — the distinction the old
    // code drew correctly and which is preserved here.
    return { ok: false, reason: 'cancelled' };
  }
}

/** The sentence for each non-cancel outcome. `cancelled` says nothing. */
export function shareFailureNote(reason: Exclude<ShareOutcome, { ok: true }>['reason']): string | null {
  switch (reason) {
    case 'unsupported':
      return 'This browser cannot share images. Save the photo and attach it instead.';
    case 'no-url':
      return 'That photo is not available to share right now.';
    case 'fetch-failed':
      return 'The photo could not be loaded to share. Check your connection and try again.';
    case 'not-allowed':
      return 'The photo is ready — tap Share again to send it.';
    case 'cancelled':
      return null;
  }
}
