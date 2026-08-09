// ===========================================================================
// THE DESKTOP PUSH WORKER — ND-4. Spec: notifications-architecture.md §5.3.
// ===========================================================================
//
// Registered from app/dashboard/register-push-sw.tsx with scope '/dashboard'.
//
// ---------------------------------------------------------------------------
// THIS WORKER HAS NO `fetch` HANDLER, AND THAT IS ITS ENTIRE DESIGN.
// ---------------------------------------------------------------------------
// It caches nothing, serves nothing, and intercepts no request. A worker with no
// fetch handler cannot serve a stale response, because it never serves any
// response at all. Everything under /dashboard reaches the network exactly as it
// did before this file existed.
//
// ---------------------------------------------------------------------------
// WHY A SECOND WORKER INSTEAD OF WIDENING public/sw.js's SCOPE TO '/'
// ---------------------------------------------------------------------------
// Because push is delivered to a REGISTRATION, and the /m worker is registered
// with `scope: '/m'`, a desktop-only user — Owner, Admin, an office PM who never
// opens the phone app — has no registration and therefore no push subscription.
// Traces 3d through 3h are all addressed to exactly those people. Without this
// file, the majority of the spec's push traces would deliver to nobody.
//
// The tempting fix is one line: change `scope: '/m'` to `scope: '/'`. ND-4 rules
// against it, and the reason is on the record rather than theoretical. The /m
// worker carries a static-asset cache whose policy is load-bearing: at S121 a
// stale-while-revalidate entry served a PREVIOUS build's JavaScript against the
// CURRENT build's server-rendered HTML, and a real handset reported
//
//     Expected server HTML to contain a matching <button> in <nav>
//
// because dev-server chunks carry no content hash. The fix keyed the cache on
// `Cache-Control: immutable` and bumped the cache VERSION to evict poisoned
// entries. Widening scope to '/' would place the ENTIRE DESKTOP APP behind that
// logic — an app that has never had a service worker, does not need caching, and
// would inherit a whole class of failure to gain nothing. The desktop needs
// push. It does not need a cache.
//
// ---------------------------------------------------------------------------
// THE THREE HANDLERS ARE DUPLICATED FROM public/sw.js, ON PURPOSE
// ---------------------------------------------------------------------------
// A worker in public/ is plain JS: it cannot import from TypeScript, and it
// cannot import from another worker. This is the same tax that makes
// 'm6m-queue-sync' a string literal duplicated across sw.js and offline-sync.tsx
// and asserted in both by the unit suite. The suite does the same here: it
// asserts BOTH workers register push, notificationclick and pushsubscriptionchange,
// rather than pretending the duplication is shared code.
//
// The one intentional difference is `surface: 'desktop'` in the re-subscribe
// body, and the '/dashboard/notifications' fallback URL.

self.addEventListener('install', () => {
  // Take over immediately. There is no cache to migrate and no old worker state
  // to preserve, so the usual caution around skipWaiting does not apply.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Claim open /dashboard tabs so push works in THIS session rather than after
  // the next full reload. Deliberately does NOT enumerate or delete caches —
  // this worker owns none, and deleting by name here could reach the /m
  // worker's caches on the same origin.
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  // ⚠️ ALWAYS SHOW SOMETHING. Chrome revokes subscriptions that receive pushes
  // and display nothing, so even a malformed payload produces a notification.
  event.waitUntil(
    (async () => {
      let payload = {};
      try {
        payload = event.data ? event.data.json() : {};
      } catch {
        // Non-JSON payload. Still show a notification.
      }

      const title = payload.title || 'FrameFocus';
      await self.registration.showNotification(title, {
        body: payload.body || '',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        // ND-11: the sender already resolved this for the 'desktop' surface.
        data: {
          url: payload.url || '/dashboard/notifications',
          id: payload.notificationId,
        },
        tag: payload.tag || undefined,
      });
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url =
    (event.notification.data && event.notification.data.url) || '/dashboard/notifications';

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of clients) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) {
            try {
              await client.navigate(url);
            } catch {
              // Refused; the focus still happened.
            }
          }
          return;
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(url);
    })()
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const applicationServerKey =
          (event.oldSubscription && event.oldSubscription.options
            ? event.oldSubscription.options.applicationServerKey
            : null) || null;
        if (!applicationServerKey) return;

        const fresh = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });

        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscription: fresh.toJSON(),
            surface: 'desktop',
            previousEndpoint: event.oldSubscription ? event.oldSubscription.endpoint : null,
          }),
        });
      } catch {
        // The next enrolment check in the page re-subscribes.
      }
    })()
  );
});
