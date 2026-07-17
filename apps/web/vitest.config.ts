import { defineConfig } from 'vitest/config';

// Path aliases (@/*, @framefocus/*) resolve from ./tsconfig.json via
// resolve.tsconfigPaths — never redeclare them here.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules/**', '.next/**'],
    environment: 'node',
  },
});
