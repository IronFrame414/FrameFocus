import { redirect } from 'next/navigation';

// M6M §1 — `/m` redirects to `/m/timeclock` (D-12).
//
// D-12 is the landing rule: a field user's first screen is the clock, not a
// project list. This route is also the PWA's `start_url` (app/manifest.ts), so
// opening the installed app from the home screen lands here and continues to
// the timeclock.
//
// [S119 E-2] next.config.js now answers `/m` first, before middleware and this
// layout, so this page is the fallback, not the path a launch takes.
//
// A server-side redirect, not a client one: it costs no bundle, cannot flash an
// empty shell, and survives with JS disabled.

export default function MobileIndexPage() {
  redirect('/m/timeclock');
}
