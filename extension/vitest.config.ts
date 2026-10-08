import { defineConfig } from 'vitest/config';
import { aliases } from './vite.aliases.ts';

export default defineConfig({
  resolve: { alias: aliases },
  css: { postcss: { plugins: [] } },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    // Installs a fresh in-memory `chrome` mock (tests/helpers/chrome-mock.ts) for every test file.
    setupFiles: ['tests/setup.ts'],
  },
});
