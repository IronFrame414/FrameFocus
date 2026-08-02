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
function loadEnvLocal(): void {
  let raw: string;
  try {
    raw = readFileSync(fileURLToPath(new URL('../.env.local', import.meta.url)), 'utf8');
  } catch {
    throw new Error(
      'apps/web/.env.local not found — it is gitignored and does not survive a Codespace ' +
        'rebuild. Recreate it from the Vercel env vars before running the live click-test.'
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
