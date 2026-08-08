import { test, expect, type Page } from '@playwright/test';

// M6M — HYDRATION ON /m, AND THE HOLE THAT LET A HYDRATION BUG SHIP [S121].
//
// ===========================================================================
// WHY 340 PASSING TESTS DID NOT CATCH THIS. THE GAP IS THE POINT.
// ===========================================================================
// The defect, reported from a phone: `Expected server HTML to contain a
// matching <button> in <nav>` on /m. The suite had nothing that could see it,
// for two independent reasons — and the second is the one that generalises.
//
// 1. NOTHING IN THE SUITE LISTENS TO THE CONSOLE. Not one spec attached a
//    `console` or `pageerror` handler. React 18 does not throw on a hydration
//    mismatch — it logs an error and RECOVERS by re-rendering that subtree on
//    the client. The recovered DOM is the client's, which is the correct one,
//    so `toBeVisible()`, `toHaveText()` and every geometry assertion in
//    m-shell.spec.ts still pass. **A hydration error leaves behind a DOM that
//    looks healthy to every assertion the suite makes.** Passing tests were
//    not evidence of the absence of this bug; they were incapable of evidence
//    either way. That is why the first test below asserts on the CONSOLE and
//    not on the DOM — a new kind of observation, not a new assertion of the
//    same kind.
//
// 2. A FRESH BROWSER PROFILE CANNOT REPRODUCE IT. The cause was not a
//    server/client divergence in the source at all — the source was consistent
//    (proven by the first test). It was `public/sw.js` storing
//    `/_next/static/**` under stale-while-revalidate: on the dev server those
//    chunk URLs carry NO content hash and answer `no-store, must-revalidate`,
//    so after 4b5f84d changed the tab bar's centre control from a `<button>`
//    to a `<label>`, the cache handed the phone the PREVIOUS build's
//    `app/m/layout.js` to hydrate the CURRENT build's HTML. Reproducing that
//    needs assets from TWO builds. Every Playwright context is created fresh,
//    with an empty Cache Storage and no service worker, so the suite can only
//    ever pair a build's HTML with its own JS. **No amount of end-to-end
//    testing in a clean profile can reach a cross-build defect.** Hence the
//    second test, which does not try: it asserts the STRUCTURAL property that
//    makes the pairing impossible, the same way test/middleware-matcher.test.ts
//    asserts the matcher's contents rather than a stale-token round trip.
//
// The lasting fix for gap 1 is that the guard below is cheap and route-driven:
// a new /m screen is covered by adding one string to ROUTES.

/** React's hydration failures, across the wordings React 18 uses for them. */
const HYDRATION = /hydrat|did not match|Expected server HTML|Text content does not match/i;

type Collected = { hydration: string[]; errors: string[] };

/**
 * Attach BEFORE any navigation — a listener added afterwards misses the
 * messages that hydration emits during the first paint, which is all of them.
 */
function collect(page: Page): Collected {
  const out: Collected = { hydration: [], errors: [] };
  page.on('console', (msg) => {
    if (msg.type() !== 'error' && msg.type() !== 'warning') return;
    const text = msg.text();
    if (HYDRATION.test(text)) out.hydration.push(text);
  });
  page.on('pageerror', (err) => {
    const text = `${err.name}: ${err.message}`;
    if (HYDRATION.test(text)) out.hydration.push(text);
    else out.errors.push(text);
  });
  return out;
}

// The shell renders on every one of these, so each is a fresh chance for the
// app bar, the tab bar and the sheet host to disagree with the server. /m is
// first because it is the PWA's start_url and the reported route.
const ROUTES = ['/m', '/m/projects', '/m/timeclock', '/m/logs', '/m/field', '/m/logs/new'];

test('the /m shell hydrates with no server/client mismatch', async ({ page }) => {
  const seen = collect(page);

  for (const route of ROUTES) {
    await page.goto(route);
    // The tab bar is the element that broke, and waiting on it also guarantees
    // hydration has been attempted rather than merely that HTML arrived.
    await expect(page.getByTestId('m-tabbar')).toBeVisible();
  }

  // Reported per-route in the message: a bare "expected 0" would not say which
  // screen diverged, and the shell renders on all of them.
  expect(seen.hydration, `hydration mismatches on ${ROUTES.join(', ')}`).toEqual([]);
});

test('the guard is actually wired — a hydration error would be seen', async ({ page }) => {
  // WITHOUT THIS, THE TEST ABOVE IS UNFALSIFIABLE. "No hydration errors" and
  // "no listener attached" produce identical results, and the suite has just
  // spent 340 tests demonstrating how comfortable that failure mode is. This
  // drives one real console.error through the same collector and asserts it
  // lands, so a future refactor that breaks the plumbing fails HERE, loudly,
  // instead of quietly turning the guard above into a no-op.
  const seen = collect(page);
  await page.goto('/m/timeclock');
  await page.evaluate(() => {
    console.error('Warning: Expected server HTML to contain a matching <button> in <nav>.');
  });
  await expect.poll(() => seen.hydration.length).toBeGreaterThan(0);
});

test('the service worker caches no asset the origin refuses to have cached', async ({ page }) => {
  // THE ASSERTION THAT WOULD HAVE CAUGHT THE DEFECT, and the one that keeps it
  // fixed. A stale-bundle hydration mismatch requires the worker to serve code
  // from an earlier build; it can only do that if it STORED a response whose
  // URL is allowed to change. `Cache-Control: immutable` is the origin's
  // promise that a URL's bytes never change, and Next sends it for
  // content-hashed assets only — dev chunks answer `no-store, must-revalidate`.
  //
  // So: every entry in the static cache must carry `immutable`. On the dev
  // server that means the hashed fonts are present and no JS or CSS chunk is;
  // in production it means the hashed chunks are cached as §7.2 intended. One
  // assertion, correct in both, with no environment sniffing.
  //
  // Against the pre-fix worker this FAILS, listing `chunks/app/m/layout.js`
  // — the exact file whose stale copy produced the reported error.
  await page.goto('/m/timeclock');
  await page.evaluate(() => navigator.serviceWorker.ready);

  // Reload under the active worker so its fetch handler, not the first
  // uncontrolled load, is what populates the cache.
  await page.reload();
  await expect(page.getByTestId('m-tabbar')).toBeVisible();

  const mutable = await page.evaluate(async () => {
    const found: string[] = [];
    for (const name of await caches.keys()) {
      if (!name.endsWith('-static')) continue;
      const cache = await caches.open(name);
      for (const req of await cache.keys()) {
        const resp = await cache.match(req);
        const cc = resp?.headers.get('cache-control') ?? '';
        if (!cc.includes('immutable')) found.push(`${new URL(req.url).pathname} :: ${cc}`);
      }
    }
    return found;
  });

  expect(mutable, 'these were cached but may change at the same URL').toEqual([]);
});
