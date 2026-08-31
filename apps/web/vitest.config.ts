import { defineConfig } from 'vitest/config';

// Path aliases (@/*, @framefocus/*) resolve from ./tsconfig.json via
// resolve.tsconfigPaths — never redeclare them here.
export default defineConfig({
  // Vitest 4 transforms through oxc and SILENTLY IGNORES `esbuild.jsx`, and the
  // app's tsconfig sets jsx: "preserve" — which is why the repo had no render
  // test for any template until S97: a .tsx test could not compile at all.
  // This is what lets invoice-template.test.tsx exist.
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    tsconfigPaths: true,
    alias: {
      'server-only': new URL('./test/server-only-stub.ts', import.meta.url).pathname,
      // next/font is a build-time transform and throws outside the Next
      // compiler — see test/next-font-stub.ts.
      'next/font/google': new URL('./test/next-font-stub.ts', import.meta.url).pathname,
    },
  },
  test: {
    // pool: 'forks' isolates process.env PER FILE (each test file runs in its
    // own child process), so one file's env mutation cannot race another's.
    // Required since [Email §1]: the send gate made sendEmail() read
    // process.env.{EMAIL_SEND_ENABLED,VERCEL_ENV} at call time, and
    // email-send-gate.test.ts deliberately DELETES those across an await to
    // prove the closed-gate path. Under the thread-sharing default that racily
    // clobbered reply-to.test.ts's beforeEach (which needs the gate OPEN),
    // giving flaky "send gate refused" failures — green in isolation, red at
    // full-suite scale, the exact flaky-neighbour class the battery must not
    // ship. Forks makes it deterministic; full suite is 1011/1011 either way.
    pool: 'forks',
    include: ['**/*.{test,spec}.{ts,tsx}'],
    // e2e/** is Playwright's (playwright.config.ts testDir). The include glob
    // above and Playwright's default testMatch overlap completely, so without
    // this vitest would collect a browser test, run it with no browser, and
    // fail in a way that reads as a broken test rather than a broken config.
    exclude: ['node_modules/**', '.next/**', 'e2e/**'],
    environment: 'node',
    server: {
      deps: {
        inline: ['server-only'],
      },
    },
  },
});
