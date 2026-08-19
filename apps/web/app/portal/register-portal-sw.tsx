'use client';

import { useEffect } from 'react';

/**
 * The portal's service worker, scope `/portal`.
 *
 * ⚠️ A THIRD SCOPE, AND THE OTHER TWO ARE UNTOUCHED. `public/sw.js` is scoped
 * `/m` and registered from the mobile layout; `public/sw-dashboard.js` is
 * scoped `/dashboard`. Neither changes here, and neither can be reached by this
 * registration — a worker's scope is bounded by the path it is served from and
 * the `scope` given, and both are `/portal`.
 *
 * Registered from THIS layout only, for the same reason `/m`'s is: the worker
 * then exists exactly where the portal exists and nowhere else.
 */
export function RegisterPortalSw() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw-portal.js', { scope: '/portal' }).catch(() => {
      // Private mode, unsupported browser, or a failed fetch. Degrades to the
      // no-worker behaviour — never user-visible, and push simply stays
      // unavailable rather than the portal failing to render.
    });
  }, []);
  return null;
}
