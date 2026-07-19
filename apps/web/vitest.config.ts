import { defineConfig } from 'vitest/config';

// Path aliases (@/*, @framefocus/*) resolve from ./tsconfig.json via
// resolve.tsconfigPaths — never redeclare them here.
export default defineConfig({
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
