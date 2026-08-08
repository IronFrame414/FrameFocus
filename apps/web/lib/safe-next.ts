// WHERE A SIGN-IN RETURNS TO — the `?next=` contract [S121].
//
// ===========================================================================
// WHY THIS EXISTS
// ===========================================================================
// Three files independently hard-coded '/dashboard' as "where you go once you
// are signed in": `middleware.ts` (an authenticated request landing on
// /sign-in), `app/sign-in/page.tsx` (a successful sign-in), and — by
// omission — `app/m/layout.tsx`, which redirected an unauthenticated field
// user to a bare '/sign-in' and so threw the destination away.
//
// Chained, those three turned an ordinary lapsed session on a PHONE into "the
// field app is unreachable":
//
//     GET /m  ->  app/m/layout.tsx: getUser() is null  ->  redirect('/sign-in')
//             ->  the user signs in
//             ->  app/sign-in/page.tsx: router.push('/dashboard')
//             ->  the desktop app, on a handset, with no way back
//
// No stale token, no service worker and no race is needed — only a refresh
// token old enough to have lapsed, which is the NORMAL state of a phone that
// has been in a pocket for a week and the reason the defect looked
// phone-specific. A desktop session is refreshed constantly, never reaches
// /sign-in, and so "works fine" — which is what made the two look like
// different bugs rather than one.
//
// ===========================================================================
// THE VALIDATION IS THE POINT, NOT A FORMALITY
// ===========================================================================
// `next` arrives from a URL, so it is attacker-controlled: the moment a
// redirect target comes from a query parameter, an unvalidated one is an open
// redirect (`/sign-in?next=https://evil.example` phishing a real, correctly
// branded sign-in page). Every value must therefore be a SAME-ORIGIN,
// ABSOLUTE PATH, and anything else falls back to the default rather than
// erroring — a bad `next` should never cost a user their sign-in.
//
// The three rejected shapes and why each one matters:
//   · 'https://evil.example'  — absolute URL, the plain case.
//   · '//evil.example/x'      — PROTOCOL-RELATIVE. Starts with '/', so a naive
//                               `startsWith('/')` check passes it, and the
//                               browser then resolves it to another ORIGIN.
//                               This is the check that is usually missed.
//   · '/\evil.example'        — backslash variant of the same trick; several
//                               browsers normalise '\' to '/' in URLs.

/** Where anyone with no stated destination goes — the desktop app, as before. */
export const DEFAULT_SIGNED_IN_PATH = '/dashboard';

/**
 * Narrow an untrusted `?next=` value to a safe same-origin path.
 *
 * Returns `fallback` for anything that is not a plain absolute path, so a
 * caller can use the result unconditionally.
 */
export function safeNextPath(
  next: string | null | undefined,
  fallback: string = DEFAULT_SIGNED_IN_PATH
): string {
  if (!next) return fallback;
  // Must be an absolute path...
  if (!next.startsWith('/')) return fallback;
  // ...and must not be the protocol-relative form, in either slash direction.
  if (next.startsWith('//') || next.startsWith('/\\')) return fallback;
  return next;
}
