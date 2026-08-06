// M6M §7.2 item 3 — the service worker: app-shell caching plus the queue's
// retry hook. Registered from app/m/layout.tsx (via register-sw.tsx) with
// scope '/m', so it NEVER controls the desktop app — /dashboard requests
// don't pass through here at all (A-28's spirit at the network layer).
//
// ---------------------------------------------------------------------------
// THE RETRY HOOK IS A TRIGGER, NOT A SECOND RETRY PATH.
// ---------------------------------------------------------------------------
// The queue and its replay engine live in lib/offline/* and run in the PAGE
// (OfflineSyncProvider). This worker holds no queue, replays nothing and
// touches IndexedDB not at all. Its one job on the retry front: when the
// Background Sync event fires (Chromium fires it on regained connectivity,
// even for a backgrounded tab), post {type: 'm6m-queue-sync'} to every open
// client — and the provider answers by calling the SAME sync() the `online`
// event and the backoff timer call. One retry path, three triggers. On iOS
// there is no SyncManager; registration fails silently in the provider and
// the online-event/backoff path carries it alone, as before.
//
// The 'm6m-queue-sync' literal appears here and in offline-sync.tsx — a plain
// JS worker in public/ cannot import the TS module, so the unit suite asserts
// both files carry it rather than sharing a constant.
//
// ---------------------------------------------------------------------------
// CACHING IS DELIBERATELY CONSERVATIVE.
// ---------------------------------------------------------------------------
//   · Navigations under /m: network-first. Online behavior is byte-identical
//     to no-SW; a successful navigation is cached as it happens. Offline, the
//     cached copy of that page serves — else the cached M-4 (/m/offline), so
//     the offline screen §4.4 specifies is reachable even on a cold route.
//   · /_next/static + the app icons: stale-while-revalidate, NOT cache-first.
//     Hashed production assets are immutable so SWR equals cache-first there;
//     dev-server chunks are NOT immutable, and cache-first would serve stale
//     code across edits. SWR is at most one reload behind.
//   · Everything else (Supabase, API routes, non-/m pages): untouched — the
//     handler returns without respondWith and the browser does its default.
//     Data freshness stays the app's problem, never this file's.

const VERSION = 'm6m-sw-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const STATIC_CACHE = `${VERSION}-static`;
const OFFLINE_FALLBACK = '/m/offline';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      // Precache M-4 as the navigation fallback. Guard against caching a
      // redirect: /m is auth-gated, and an unsigned install-time fetch lands
      // on /sign-in — caching THAT as the offline screen would be worse than
      // caching nothing. A signed-in visit caches it on navigation instead.
      try {
        const resp = await fetch(OFFLINE_FALLBACK);
        if (resp.ok && !resp.redirected) {
          const cache = await caches.open(SHELL_CACHE);
          await cache.put(OFFLINE_FALLBACK, resp);
        }
      } catch {
        // Offline at install time — navigations will populate the cache.
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => !n.startsWith(VERSION)).map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

// §7.2 item 3 — the queue's retry hook (see the header).
self.addEventListener('sync', (event) => {
  if (event.tag === 'm6m-queue-sync') {
    event.waitUntil(
      (async () => {
        const clients = await self.clients.matchAll({
          type: 'window',
          includeUncontrolled: true,
        });
        for (const client of clients) client.postMessage({ type: 'm6m-queue-sync' });
      })()
    );
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations under /m: network-first with the app-shell fallback chain.
  if (request.mode === 'navigate' && url.pathname.startsWith('/m')) {
    event.respondWith(
      (async () => {
        try {
          const resp = await fetch(request);
          if (resp.ok && !resp.redirected) {
            const cache = await caches.open(SHELL_CACHE);
            cache.put(request, resp.clone());
          }
          return resp;
        } catch {
          const cached = await caches.match(request);
          if (cached) return cached;
          const fallback = await caches.match(OFFLINE_FALLBACK);
          if (fallback) return fallback;
          // Nothing cached at all (first visit was already offline): a plain
          // response beats a browser error page inside an installed PWA.
          return new Response(
            '<!doctype html><title>Offline</title><p>You are offline and nothing is cached yet.</p>',
            { status: 503, headers: { 'Content-Type': 'text/html' } }
          );
        }
      })()
    );
    return;
  }

  // Static assets: stale-while-revalidate (see the header for why not
  // cache-first).
  const isStatic =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname === '/icon-192.png' ||
    url.pathname === '/icon-512.png' ||
    url.pathname === '/icon-maskable-512.png' ||
    url.pathname === '/apple-touch-icon-180.png';
  if (isStatic) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((resp) => {
            if (resp.ok) cache.put(request, resp.clone());
            return resp;
          })
          .catch(() => null);
        return cached ?? (await network) ?? Response.error();
      })()
    );
  }
});
