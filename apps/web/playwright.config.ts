import { defineConfig, devices } from '@playwright/test';

// M6M §10a / D-18 — the browser harness.
//
// WHY THIS EXISTS
//   The [live] harness (test/live.vitest.config.ts) sets `environment: 'node'`
//   and mints a bare supabase-js client. That gives real RLS against the real
//   rebuild-test database and NOTHING ELSE — no DOM, no navigator.onLine, no
//   service worker, no IndexedDB. It cannot simulate offline and never will.
//   Equally, a unit test with fakes can prove the queue reorders correctly but
//   can never prove the amber strip rendered or that a tap landed.
//   Playwright covers exactly that gap: context.setOffline(true), computed
//   styles, bounding boxes, real taps.
//
// LIVES IN apps/web, NOT THE REPO ROOT, deliberately — vitest already runs from
// here (`npm test` -> `vitest run` in apps/web/package.json). Two test runners
// rooted in two different places would be a trap.
//
// ---------------------------------------------------------------------------
// KEEPING PLAYWRIGHT OUT OF THE VITEST RUN — TWO INDEPENDENT MECHANISMS
// ---------------------------------------------------------------------------
//   vitest.config.ts includes '**/*.{test,spec}.{ts,tsx}'. Playwright's own
//   default testMatch is '**/*.@(spec|test).?(c|m)[jt]s?(x)'. Those overlap
//   COMPLETELY: a file named *.spec.ts in this package would be collected by
//   BOTH runners, and vitest would execute a Playwright test with no browser
//   and fail in a way that looks like a broken test rather than a broken
//   config. So:
//     1. Playwright owns ./e2e and only ./e2e (testDir below).
//     2. vitest EXCLUDES 'e2e/**' explicitly (see vitest.config.ts).
//   Either alone would work today. Both, because the failure mode is confusing
//   and the cost of the second guard is one line.
//
// ---------------------------------------------------------------------------
// BROWSER BINARIES ARE NOT IN node_modules AND NOT IN THE REPO
// ---------------------------------------------------------------------------
//   They live in ~/.cache/ms-playwright (~656 MB for Chromium alone) and DO NOT
//   survive a Codespace rebuild — same class as .env.local and the Supabase CLI
//   link. `npm ci` will NOT restore them. After any rebuild:
//       npx playwright install chromium
//   Roughly 30 seconds. Without it the suite fails at launch, not at assert.

export default defineConfig({
  testDir: './e2e',

  // Fail the build if a .only was left behind.
  forbidOnly: !!process.env.CI,

  // CI machines are noisier; a browser test that flakes once is not news.
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list']],

  use: {
    baseURL: 'http://localhost:3000',
    // Only kept for a test that already failed once — cheap, and the trace is
    // the difference between "it flaked" and knowing why.
    trace: 'on-first-retry',

    // -------------------------------------------------------------------------
    // --disable-dev-shm-usage — TECH_DEBT #145, and #145's DIAGNOSIS WAS WRONG
    // -------------------------------------------------------------------------
    // #145 recorded long runs dying with `Page crashed` on a different test each
    // time, and attributed it to the box running out of memory (7944 MB total,
    // ~130 MB free, no swap). **That was the wrong cause.** The kernel's own
    // counters say nothing was ever OOM-killed:
    //
    //     /proc/vmstat            oom_kill 0
    //     /sys/fs/cgroup/…events  oom_kill 0   (root and every child cgroup)
    //
    // What is actually true of this container is `df /dev/shm` → **64 MB**, the
    // Docker default. Chromium puts renderer shared memory there, and when it
    // runs out the renderer dies instantly — surfacing to Playwright as exactly
    // `Page crashed`, on whichever test happened to be running. This flag moves
    // that allocation to /tmp, which is disk-backed and not capped at 64 MB.
    //
    // Why the memory theory looked right: free memory WAS low, and splitting the
    // suite into smaller processes DID help — but only because a shorter run
    // opens fewer pages before /dev/shm fills, not because it used less RAM.
    // The split was treating a symptom.
    launchOptions: { args: ['--disable-dev-shm-usage'] },
  },

  // ---------------------------------------------------------------------------
  // THREE PROJECTS, AND THE SPLIT IS LOAD-BEARING [S99, M6M §3 slice]
  // ---------------------------------------------------------------------------
  //   setup          signs in once, writes e2e/.auth/user.json
  //   chromium       ANONYMOUS. Owns harness.spec.ts and anything else that
  //                  needs a signed-OUT browser. It must stay anonymous:
  //                  harness.spec.ts drives /sign-in, and middleware.ts
  //                  redirects an authenticated request away from /sign-in to
  //                  /dashboard — a shared session would break it.
  //   chromium-auth  Carries that session, and runs the m-*.spec.ts files only.
  //                  Every /m route is behind app/m/layout.tsx's auth gate.
  //
  // testIgnore/testMatch are complements on purpose: a new m-*.spec.ts is picked
  // up by exactly one project, and a spec named anything else by exactly the
  // other. Neither list needs editing to add a file.
  //
  // VIEWPORT 402x874 is M6M §2's reference canvas (iPhone 16 Pro logical px),
  // in a desktop Chromium. That is §1's stated testing model: "A desktop browser
  // opening /m gets the mobile shell; that is intended and is how it gets
  // tested." It matters for A-5 — tap-target geometry is viewport-dependent.
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /m-.*\.spec\.ts/,
    },
    {
      name: 'chromium-auth',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 402, height: 874 },
        storageState: 'e2e/.auth/user.json',
      },
      testMatch: /m-.*\.spec\.ts/,
      dependencies: ['setup'],
    },
  ],

  // ---------------------------------------------------------------------------
  // THE DEV SERVER: Playwright STARTS IT, you do not have to.
  // ---------------------------------------------------------------------------
  // Playwright drives a real browser against a real HTTP origin, so something
  // must be serving. `webServer` makes that the runner's job: it launches the
  // command, waits for the url to answer, runs the tests, and tears the server
  // down afterwards.
  //
  // reuseExistingServer: !process.env.CI — locally, if you already have
  // `npm run dev` open on :3000, Playwright ATTACHES to it instead of fighting
  // for the port. In CI there is never a server to reuse, and reusing a stale
  // one would silently test the wrong build, so CI always starts its own.
  //
  // ---------------------------------------------------------------------------
  // #135 [S122] — CI SERVES A PRODUCTION BUILD; LOCAL STAYS ON `next dev`.
  // ---------------------------------------------------------------------------
  // The old comment here said: "If e2e ever gates a merge, switch this to a
  // production build so CI tests what ships." That is now done, and the reason
  // was never only fidelity — it was that `next dev` compiles routes on first
  // request, so CI paid a cold compile inside `webServer.timeout` and a slow
  // runner could blow the 120s budget BEFORE A SINGLE TEST RAN. The failure
  // then names the web server rather than the app, which is #135's real sting.
  //
  // ⚠️ IN CI THE BUILD IS A SEPARATE WORKFLOW STEP, NOT PART OF THIS COMMAND.
  // `command: 'npm run build && npm run start'` would work but would fold a
  // BUILD failure into a webServer TIMEOUT — reintroducing the exact
  // misreporting this item is about. `.github/workflows/ci.yml` runs
  // `npm run build` as its own step, so a broken build fails there with the
  // compiler's own output, and by the time Playwright starts there is nothing
  // left to compile.
  //
  // MEASURED [S122], this box, rebuild-test:
  //   cold `next build`      175s   (a one-off, paid once per CI run)
  //   `next start` to serving  2s   (vs. dev's per-route compile-on-request)
  //   e2e/m-writes.spec.ts   2.8m   against production
  //                          5.0m   against `next dev` — the same 53 tests
  //   next-server RSS         320MB after that suite
  //                         ~1400MB for the dev server, growing monotonically
  //                                 (the figure #145 measured)
  // So the build pays for itself on any suite of meaningful size, and it
  // removes the only resource growth #145 ever managed to measure.
  //
  // LOCAL STAYS ON `next dev` deliberately: the 175s build on every iteration
  // would be a bad trade while writing tests, and `reuseExistingServer` lets a
  // dev server you already have open be attached to. Run
  // `scripts/e2e-preflight.sh` first (#138) to guarantee it is the RIGHT one.
  webServer: {
    command: process.env.CI ? 'npm run start' : 'npm run dev',
    url: 'http://localhost:3000',
    // Production `start` boots in ~2s; dev still needs room to compile.
    timeout: (process.env.CI ? 60 : 120) * 1000,
    reuseExistingServer: !process.env.CI,
  },
});
