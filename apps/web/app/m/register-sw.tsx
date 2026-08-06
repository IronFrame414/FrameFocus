'use client';

import { useEffect } from 'react';

// M6M §7.2 item 3 — registers public/sw.js, from the MOBILE layout only
// (A-26d). Scope '/m' is the whole point: the worker never controls the
// desktop app, so nothing under /dashboard gains a caching layer it did not
// ask for (A-28's spirit). The registration is idempotent — calling it on
// every mount is the platform-recommended pattern, not a leak.
export function RegisterSw() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/m' }).catch(() => {
      // Registration failure (private mode, unsupported browser) degrades to
      // the no-SW behavior the app shipped with — never user-visible.
    });
  }, []);
  return null;
}
