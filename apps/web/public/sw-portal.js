// ===========================================================================
// THE CLIENT PORTAL WORKER — M9 R12 / Q5. Spec: 9-spec.md §9, §9.1.
// ===========================================================================
//
// Registered from app/portal/register-portal-sw.tsx with scope '/portal'.
//
// ---------------------------------------------------------------------------
// THIS WORKER HAS NO `fetch` HANDLER, AND THAT IS DELIBERATE
// ---------------------------------------------------------------------------
// Same design as public/sw-dashboard.js, for the same reason and with the same
// evidence behind it. The /m worker carries a static-asset cache whose policy is
// load-bearing: at S121 a stale-while-revalidate entry served a PREVIOUS build's
// JavaScript against the CURRENT build's server-rendered HTML, and a real
// handset reported
//
//     Expected server HTML to contain a matching <button> in <nav>
//
// The portal needs an INSTALL and, later, PUSH. It does not need a cache — it
// is a handful of server-rendered pages a client opens occasionally, not a
// field app used with no signal. A worker with no fetch handler cannot serve a
// stale response, because it never serves any response at all.
//
// ---------------------------------------------------------------------------
// ⚠️ WHY IT EXISTS NOW, BEFORE THERE IS ANY CLIENT PUSH TO DELIVER
// ---------------------------------------------------------------------------
// GATED.md Gate 4: **iOS delivers Web Push ONLY to an installed PWA.** The
// install is therefore a PRECONDITION for R12 on an iPhone, not a companion to
// it — which is why Q5 is its own piece of work and why it lands before stage 6.
//
// `9-spec.md` §13 gates stage 6 (notifications) on push enrolment being verified
// on a handset. Nothing here jumps that gate: **the portal does not subscribe.**
// `subscribeToPush()` is never called from `app/portal/**`. This worker is the
// surface that must exist first.
//
// ---------------------------------------------------------------------------
// ⚠️ WHAT STAGE 6 MUST DO BEFORE A CLIENT CAN ENROL — READ THIS FIRST
// ---------------------------------------------------------------------------
// The re-subscribe below posts `surface: 'client'`, and **that value is not yet
// accepted anywhere**:
//
//   1. `push_subscriptions_surface_check` allows only 'mobile' and 'desktop'.
//   2. `lib/notify/links.ts` types Surface as 'mobile' | 'desktop' and every
//      LinkDef carries exactly those two resolvers.
//
// Both are stage 6's, and the ORDER matters: adding the surface to the CHECK
// without adding a resolver would let a client enrol and then receive a push
// whose URL resolves to `/m/...` or `/dashboard/...` — routes a client is
// bounced out of. **A dead link in a notification is worse than no
// notification**, and it would present as "the portal is broken" rather than as
// a missing case.
//
// `surface: 'client'` is written here rather than borrowing 'mobile' precisely
// so that failure cannot happen quietly: today the value is refused, loudly, by
// a constraint. A borrowed 'mobile' would be accepted and would be wrong.
//
// This handler is unreachable today in any case — `pushsubscriptionchange` fires
// only for an EXISTING subscription, and a client has none.
//
// ---------------------------------------------------------------------------
// THE THREE HANDLERS ARE DUPLICATED FROM sw-dashboard.js, ON PURPOSE
// ---------------------------------------------------------------------------
// A worker in public/ is plain JS: it cannot import TypeScript and it cannot
// import another worker. Same tax as the 'm6m-queue-sync' literal. The unit
// suite asserts all three workers carry all three handlers rather than
// pretending the duplication is shared code.
//
// The intentional differences from sw-dashboard.js: `surface: 'client'` and a
// '/portal' fallback URL. ⚠️ THE FALLBACK IS THE ONE THAT WOULD BE SILENTLY
// WRONG — a copy-paste leaving '/dashboard/notifications' here would send a
// client to a page the S131 guard bounces her out of.

self.addEventListener('install', () => {
  // Take over immediately. There is no cache to migrate and no old worker state
  // to preserve, so the usual caution around skipWaiting does not apply.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Claim open /portal tabs so an install works in THIS session rather than
  // after the next full reload. Deliberately does NOT enumerate or delete
  // caches — this worker owns none, and deleting by name here could reach the
  // /m worker's caches on the same origin.
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

      // ⚠️ NOT the product name — R20 says the product does not name itself to
      // a client, and a notification on a lock screen is the most public place
      // it could. The sender supplies the company's own title; the fallback is
      // neutral rather than branded.
      const title = payload.title || 'Your project';
      await self.registration.showNotification(title, {
        body: payload.body || '',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        data: {
          url: payload.url || '/portal',
          id: payload.notificationId,
        },
        tag: payload.tag || undefined,
      });
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/portal';

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
            // ⚠️ REFUSED TODAY, ON PURPOSE. See the header — stage 6 adds it to
            // the CHECK and to links.ts together, or a client gets a push
            // pointing at a route she cannot reach.
            surface: 'client',
            previousEndpoint: event.oldSubscription ? event.oldSubscription.endpoint : null,
          }),
        });
      } catch {
        // The next enrolment check in the page re-subscribes.
      }
    })()
  );
});
