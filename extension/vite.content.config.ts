// Content script: a single classic-script IIFE (content scripts cannot be ES modules), no code
// splitting, no import/export. Imported assets are inlined (lib mode) so the shadow-DOM UI needs
// no web_accessible_resources.
import { defineConfig } from 'vite';
import { aliases } from './vite.aliases.ts';

export default defineConfig({
  resolve: { alias: aliases },
  css: { postcss: { plugins: [] } },
  publicDir: false,
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: 'src/content/index.ts',
      formats: ['iife'],
      name: 'NexusPasswordsContent',
      fileName: () => 'content.js',
    },
    // No rollupOptions.output.inlineDynamicImports: Vite 8 lib mode with an IIFE format already sets
    // `codeSplitting: false` (one file, dynamic imports inlined) and warns that the option is ignored.
  },
});
