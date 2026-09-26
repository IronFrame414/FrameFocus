import { notFound } from 'next/navigation';

// Catch-all for /m URLs that match no route [/m visual sweep, 2026-09-24].
// Without it a mistyped or stale /m link — an old notification, a bookmark
// from before a route moved — reaches the ROOT 404, outside the /m shell.
// notFound() here hands it to app/m/not-found.tsx, inside the shell. A
// catch-all only ever matches what nothing more specific did, so it shadows
// no real route.
export default function MobileMissingRoute() {
  notFound();
}
