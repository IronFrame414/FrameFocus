import type { CompanyRole } from '@framefocus/shared';

// D-12's SIGN-IN LANDING — WHICH APP A FRESH SIGN-IN OPENS. [S121, Josh]
//
// ===========================================================================
// USER AGENT, SERVER-SIDE, AND WHY NOT VIEWPORT
// ===========================================================================
// Ruled [Josh, S121]: a phone signing in lands on `/m`, and the decision is made
// from the USER-AGENT on the server, before anything renders.
//
// Viewport width is the more accurate question — it describes the screen rather
// than guessing from a string — but it is only knowable in the browser. Using
// it would mean signing in, landing on `/dashboard`, measuring, and bouncing to
// `/m`: a visible flicker on **every** sign-in, plus a wasted dashboard render.
// The UA is available in the request headers, so the answer exists before the
// first byte of HTML.
//
// ===========================================================================
// ⚠️ TWO WRONG ANSWERS, ACCEPTED ON PURPOSE
// ===========================================================================
//   1. A PHONE-SIZED BROWSER WINDOW ON A LAPTOP gets `/dashboard`. The UA says
//      desktop and the UA is what we asked. Defensible: someone narrowing a
//      desktop window is not a field user, and `/m` is one URL away.
//   2. AN iPAD GETS `/dashboard`. iPadOS reports a Macintosh UA by default
//      ("desktop-class browsing"), so it is indistinguishable from a laptop
//      here without touch-point sniffing, which is client-side again.
//      Defensible: a tablet has room for the desktop app, and D-12's target is
//      the phone in a pocket.
//
// Both are listed so a future reader recognises them as decisions rather than
// bugs, and so nobody "fixes" (1) by adding a client-side viewport check that
// reintroduces the flicker this file exists to avoid.
//
// ===========================================================================
// WHAT THIS IS **NOT**
// ===========================================================================
// This is not a router. It chooses a DEFAULT DESTINATION for one moment — the
// instant after a successful sign-in, when nobody has said where they want to
// go. It never redirects a user away from a URL they typed, and it is
// overridden by `?next=` (see `safeNextPath`, which takes this as its
// fallback rather than duplicating the decision).
//
// §1's "a viewport or user-agent check is NOT the router" is amended rather
// than broken — see the M6M spec's §1 note. What survives of it: URL entry and
// the PWA `start_url` still reach `/m` for every device, no route is gated on
// device class, and a desktop opening `/m` still gets the mobile shell.

/**
 * A phone (or phone-like handset), from the user-agent string.
 *
 * Deliberately NARROW. The tokens below are the ones that identify a HANDSET,
 * not merely a touch device:
 *
 *   Android + Mobile  — Android tablets omit `Mobile`, so this is phones only.
 *   iPhone / iPod     — iPad is excluded on purpose (see the note above).
 *   Windows Phone, BlackBerry, Opera Mini — small, and free to include.
 *
 * The cost of a false NEGATIVE is one extra tap; the cost of a false POSITIVE
 * is a laptop user dropped into the field app. The bias is towards `/dashboard`.
 */
export function isPhoneUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  if (ua.includes('ipad')) return false;
  if (ua.includes('android')) return ua.includes('mobile');
  return /iphone|ipod|windows phone|blackberry|bb10|opera mini|iemobile/.test(ua);
}

/** `/m` for a phone, `/dashboard` otherwise. The default only — `?next=` wins. */
export function defaultSignedInPath(userAgent: string | null | undefined): string {
  return isPhoneUserAgent(userAgent) ? '/m' : '/dashboard';
}

// ===========================================================================
// #101 — THE SURFACE TOGGLE. An explicit preference over the UA guess.
// ===========================================================================
// The UA default above is a GUESS about which app you want. The toggle lets a
// user who knows better (an Owner who runs the office from a phone; anyone who
// wants the field app on a laptop) SAVE that choice, so it survives the next
// sign-in instead of being re-guessed each time.
//
// ⚠️ NOT A SECURITY BOUNDARY, and deliberately client-settable. Every route is
// reachable by URL on any device regardless of this cookie (§1's "no route is
// gated on device class" still holds); the dashboard role guard
// (`dashboardDeniedRedirect`) and the Financial Floor are enforced server-side
// and never consult it. All this cookie decides is where a fresh sign-in LANDS
// — exactly the one moment `defaultSignedInPath` governs. That is why the UI
// that SETS it is role-gated (only Owner/Admin/PM see the toggle) but the
// override READ below is role-agnostic: a stray cookie can only land you on a
// page the guards already let you reach.
//
// A-6 is preserved for everyone who never touches it: with no preference,
// `landingPathFor` IS `defaultSignedInPath`, so a phone still lands on /m.
export const SURFACE_COOKIE = 'ff_surface';

// The three roles that see the toggle, in BOTH shells. Field roles (foreman,
// crew) land on /m by design and have no office screens to reach; a client is
// off the dashboard entirely. One list so the two surfaces cannot disagree
// about who may switch (PARITY).
export const SURFACE_TOGGLE_ROLES: readonly CompanyRole[] = [
  'owner',
  'admin',
  'project_manager',
];

export type SurfacePreference = 'desktop' | 'mobile' | null;

/** Narrow a raw cookie value to a known preference; anything else is "no preference". */
export function surfacePreferenceFrom(
  cookieValue: string | null | undefined
): SurfacePreference {
  return cookieValue === 'desktop' || cookieValue === 'mobile' ? cookieValue : null;
}

/**
 * The sign-in landing with the #101 toggle honoured: an explicit preference
 * wins over the UA guess; with none, this is `defaultSignedInPath` unchanged.
 * `?next=` still wins over both — this is only the fallback for safeNextPath.
 */
export function landingPathFor(
  surface: SurfacePreference,
  userAgent: string | null | undefined
): string {
  if (surface === 'desktop') return '/dashboard';
  if (surface === 'mobile') return '/m';
  return defaultSignedInPath(userAgent);
}
