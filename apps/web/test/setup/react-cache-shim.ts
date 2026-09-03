import { vi } from 'vitest';

// Global test-infra shim for React's server-only `cache`.
//
// `cache` is exported only under React's `react-server` export condition (the
// Next server runtime). Under plain-node / vitest that condition is not set, so
// `import { cache } from 'react'` resolves the default build and `cache` is
// UNDEFINED. `lib/supabase-server.ts` calls `cache(...)` at module top level, so
// ANY test whose import graph reaches it (directly or transitively, by value)
// throws `TypeError: cache is not a function` at collection and registers ZERO
// tests — a suite that looks green while covering nothing.
//
// Applied globally via `setupFiles` in BOTH vitest configs (unit + live), this
// makes `cache` a PASSTHROUGH. That is also the CORRECT semantics: `cache()`
// memoizes only within a server render's request scope, which does not exist in
// a test, so outside a request each caller runs the factory fresh — exactly what
// `test/supabase-server.identity.test.ts` (the proven original of this shim, its
// lines 23-31) relies on to catch a cross-caller singleton.
//
// Only `cache` is overridden; every other React export is passed through from
// the real module, so client-component rendering (hooks, jsx-runtime) is
// unaffected.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, cache: <T,>(fn: T): T => fn };
});
