// WHERE THE DESKTOP PHOTO MARKUP SCREEN RETURNS TO — the `?from=` token [S122 0-B-5].
//
// RULED [Josh, 2026-09-30]: "Go back to where you came from." The screen is
// reachable from BOTH a project's Files tab and its Photos tab, and it used to
// hard-code "← Back to files" whichever one you came from. Deciding by the
// file's category was the rejected alternative.
//
// `from` arrives in the URL, so it is user-supplied. It is therefore a TOKEN
// from a fixed set, never a path [S122 Q6-A]: the page builds the destination
// itself from its own project id, so there is no user-supplied path to
// validate and nothing here can become an open redirect. This is deliberately
// NOT lib/safe-next.ts — that helper accepts any same-origin path, which is
// the right contract for `?next=` after sign-in and the wrong one here.
//
// Anything that is not a known token (missing, junk, a path) falls back to
// Files, which is what the screen always did.

export const MARKUP_FROM_TOKENS = ['files', 'photos'] as const;
export type MarkupFrom = (typeof MARKUP_FROM_TOKENS)[number];

export interface MarkupReturn {
  from: MarkupFrom;
  href: string;
  label: string;
}

/** Narrow an untrusted `?from=` value to a known token; anything else is 'files'. */
export function parseMarkupFrom(raw: string | string[] | null | undefined): MarkupFrom {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === 'photos' ? 'photos' : 'files';
}

/** Where "back" (and a delete) goes from this project's markup screen. */
export function markupReturnTo(
  projectId: string,
  raw: string | string[] | null | undefined
): MarkupReturn {
  const from = parseMarkupFrom(raw);
  return from === 'photos'
    ? { from, href: `/dashboard/projects/${projectId}/photos`, label: '← Back to photos' }
    : { from, href: `/dashboard/projects/${projectId}/files`, label: '← Back to files' };
}

/** The markup screen's URL, carrying where the user is coming from. */
export function markupHref(projectId: string, fileId: string, from: MarkupFrom): string {
  return `/dashboard/projects/${projectId}/files/${fileId}/markup?from=${from}`;
}
