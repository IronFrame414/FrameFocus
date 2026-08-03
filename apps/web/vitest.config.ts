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
    },
  },
  test: {
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules/**', '.next/**'],
    environment: 'node',
    server: {
      deps: {
        inline: ['server-only'],
      },
    },
  },
});
