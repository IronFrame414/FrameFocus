'use client';

import { useEffect } from 'react';

/**
 * Registers the DESKTOP PUSH WORKER. ND-4; spec §5.3.
 *
 * Mirrors app/m/register-sw.tsx in shape, and differs in the two ways that
 * matter: a different worker file, and scope '/dashboard'.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS AT ALL
 * ---------------------------------------------------------------------------
 * Push is delivered to a service-worker REGISTRATION. `public/sw.js` is
 * registered with scope '/m', so a desktop-only user — an Owner, an Admin, an
 * office PM who never opens the phone app — has no registration and therefore
 * cannot hold a push subscription. Traces 3d–3h are addressed to exactly those
 * people, so without this file most of the spec's push traces reach nobody.
 *
 * ---------------------------------------------------------------------------
 * WHY NOT JUST WIDEN sw.js's SCOPE TO '/'
 * ---------------------------------------------------------------------------
 * Because that would put the whole desktop app behind the /m worker's
 * static-asset cache, whose policy exists because of a real S121 failure on a
 * real handset (a stale cached chunk hydrating against fresh server HTML). The
 * desktop app has never had a service worker and needs push, not caching.
 * public/sw-dashboard.js therefore has NO fetch handler — it cannot serve a
 * stale response because it never serves any response.
 *
 * ---------------------------------------------------------------------------
 * REGISTERING IS NOT SUBSCRIBING
 * ---------------------------------------------------------------------------
 * This mounts on every dashboard page and registers the worker. It does NOT
 * request permission and does NOT subscribe — that happens only from a user
 * gesture in PushEnrolment. A registration is inert until someone opts in;
 * prompting on mount is the A-N27 failure.
 */
export function RegisterPushSw() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw-dashboard.js', { scope: '/dashboard' }).catch(() => {
      // Private mode, an unsupported browser, or a blocked worker: degrade to
      // the no-push behaviour the app shipped with. Never user-visible — the
      // in-app notification list is the guaranteed channel (R3).
    });
  }, []);

  return null;
}
