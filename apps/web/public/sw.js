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
//   · /_next/static + the app icons: stale-while-revalidate, and ONLY for
//     responses the ORIGIN declares immutable. See the block below — the
//     "SWR is at most one reload behind" reasoning this line used to carry was
//     wrong, and being one reload behind is not a small thing.
//   · Everything else (Supabase, API routes, non-/m pages): untouched — the
//     handler returns without respondWith and the browser does its default.
//     Data freshness stays the app's problem, never this file's.

// ---------------------------------------------------------------------------
// THE STATIC CACHE STORES ONLY WHAT THE ORIGIN CALLS `immutable` [S121]
// ---------------------------------------------------------------------------
// THE DEFECT THIS FIXES, because the old comment argued the opposite and would
// otherwise talk the next reader back into it:
//
//   The header above used to say "dev-server chunks are NOT immutable, and
//   cache-first would serve stale code across edits. SWR is at most one reload
//   behind." Both sentences are true. The conclusion drawn from them was not.
//   Stale-while-revalidate SERVES THE CACHED COPY FIRST and refreshes behind
//   it, so "one reload behind" means: on the first load after any code change,
//   the phone runs the PREVIOUS build's JavaScript against the CURRENT build's
//   server-rendered HTML. React hydrates the new DOM with the old component
//   tree and reports, from a device [S120, Josh]:
//
//       Expected server HTML to contain a matching <button> in <nav>
//
//   — the tab bar's centre control, which was a <button> before 4b5f84d and is
//   a <label> wrapping a file input after it. The server was emitting the
//   <label>; the cached bundle still expected the <button>.
//
//   `/_next/static/chunks/app/m/layout.js` and `main-app.js` carry NO CONTENT
//   HASH on the dev server, so the new build reuses the same URL and the cache
//   answers with yesterday's code. Production hashes those filenames, which is
//   why this was invisible there and fired on every markup change against the
//   Codespace — which is what a phone actually tests against.
//
// THE RULE: `Cache-Control: immutable` is the origin PROMISING the bytes at a
// URL will never change. Next.js sends it for content-hashed assets and sends
// `no-store, must-revalidate` for dev chunks. Storing a `no-store` response
// was always a violation of what the server asked for; keying on the header
// makes the cache correct in both environments with no build-time flag and no
// hostname sniffing to get wrong. Dev keeps its hashed fonts; production keeps
// every hashed chunk, which is the whole benefit §7.2 wanted.
//
// VERSION IS BUMPED TO v2 ON PURPOSE. `activate` deletes every cache whose
// name does not start with VERSION, so the bump is what evicts the poisoned
// `m6m-sw-v1-static` from handsets that already have one. Without it the fix
// ships and the affected phone keeps serving the same stale chunk forever.
const VERSION = 'm6m-sw-v2';
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

  // Static assets: stale-while-revalidate, over immutable responses only.
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
            // THE ONE-LINE GUARD THIS WHOLE COMMENT BLOCK IS ABOUT: store only
            // what the origin promises will never change at this URL. A dev
            // chunk answers `no-store, must-revalidate` and is therefore never
            // written, so the cache can never hand back code from a previous
            // build. Nothing is served from here that was not immutable when
            // it went in.
            if (resp.ok && (resp.headers.get('cache-control') || '').includes('immutable')) {
              cache.put(request, resp.clone());
            }
            return resp;
          })
          .catch(() => null);
        return cached ?? (await network) ?? Response.error();
      })()
    );
  }
});
