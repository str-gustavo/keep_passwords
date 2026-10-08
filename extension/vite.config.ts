// Popup (React + Tailwind) and service worker (ES module, "type": "module" in the manifest).
// The content script is a separate IIFE build: vite.content.config.ts.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { aliases } from './vite.aliases.ts';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: aliases },
  // Inline (empty) PostCSS config: stops Vite from picking up the Next app's ../postcss.config.mjs.
  css: { postcss: { plugins: [] } },
  // scripts/copy-static.mjs owns dist/manifest.json and dist/icons.
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    // Emit every asset as a file under dist/assets/ (no data: URIs in the popup bundle).
    assetsInlineLimit: 0,
    // Chrome 116+ supports modulepreload natively; the polyfill would only add DOM code to the bundle.
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: { popup: 'popup.html', sw: 'src/sw/index.ts' },
      output: {
        format: 'es',
        entryFileNames: (chunk) => (chunk.name === 'sw' ? 'sw.js' : 'assets/[name].js'),
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
