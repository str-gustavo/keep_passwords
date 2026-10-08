import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: true,
  },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  // tsconfig uses jsx: preserve (Next compiles it); tests that render components need the automatic runtime.
  esbuild: { jsx: 'automatic' },
});
