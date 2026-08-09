import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Runner for the LIVE harnesses — every `test/*.live.ts`. Deliberately SEPARATE
// from vitest.config.ts: these hit a real database and must never join the
// committed suite or CI. The `.live.ts` suffix also keeps them outside that
// config's include glob.
//
//   cd apps/web && npx vitest run --config test/live.vitest.config.ts
//
// One file only:
//   … --config test/live.vitest.config.ts s97ct-isolation
//
// Both harnesses need the persistent test identities:
//   node scripts/seed-test-identities.mjs
//
// .env.local is read directly rather than via dotenv — dotenv is only present
// transitively here, and a committed harness should not depend on hoisting.
// [S123] ENV FIRST, FILE SECOND — the ordering the loop below already had for
// VALUES (`if (process.env[k] === undefined)`), now extended to the file's own
// absence. The old version threw on a missing file even when the environment
// already carried every variable, which is the same defect that made
// e2e/hub-fixture.ts red in CI. These harnesses are excluded from CI by their
// `.live.ts` suffix and are meant to stay that way, so this is not a live
// failure — it is the trap removed from the one copy of it that is left.
function loadEnvLocal(): void {
  let raw: string;
  try {
    raw = readFileSync(fileURLToPath(new URL('../.env.local', import.meta.url)), 'utf8');
  } catch {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return;
    throw new Error(
      'apps/web/.env.local not found, and NEXT_PUBLIC_SUPABASE_URL / ' +
        'SUPABASE_SERVICE_ROLE_KEY are not in the environment either.\n' +
        '  Codespace / local: the file is gitignored and does not survive a rebuild — ' +
        'recreate it from the Vercel env vars (STATE.md → Environment Variables).\n' +
        '  Any other environment: export both variables before running the live ' +
        'click-test. These harnesses hit a REAL database and never run in CI.'
    );
  }
  for (const line of raw.split('\n')) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const value = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
}
loadEnvLocal();

export default defineConfig({
  // The app's tsconfig sets jsx: "preserve" (Next compiles it), so the runner
  // would otherwise hand raw JSX to the parser and fail. The role harness
  // renders real client components to static markup to execute their gates, so
  // JSX has to compile here. Vitest 4 transforms through oxc — the `esbuild.jsx`
  // option is silently ignored, which cost a while to work out.
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    tsconfigPaths: true,
    alias: {
      'server-only': fileURLToPath(new URL('./server-only-stub.ts', import.meta.url)),
    },
  },
  test: {
    include: ['test/*.live.ts'],
    environment: 'node',
    testTimeout: 120_000,
    hookTimeout: 240_000,
    fileParallelism: false,
    sequence: { concurrent: false },
    server: { deps: { inline: ['server-only'] } },
  },
});
