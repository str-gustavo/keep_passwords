import { fileURLToPath } from 'node:url';

const appLib = fileURLToPath(new URL('../lib/', import.meta.url));
const src = fileURLToPath(new URL('./src/', import.meta.url));

/**
 * Shared by vite.config.ts, vite.content.config.ts and vitest.config.ts (mirrored in tsconfig `paths`).
 * - `@app/*` → the web app's `lib/*` (crypto, record types, vault decrypt, API types).
 * - `@/lib/*` → also the app's `lib/*`: the shared lib files import each other as `@/lib/...` (the app's
 *   own alias), so this keeps them resolvable when bundled into the extension. Extension code therefore
 *   must not create `src/lib/`.
 * - `@/*` → `extension/src/*`.
 * Order matters: the first matching entry wins.
 */
export const aliases = [
  { find: /^@app\//, replacement: appLib },
  { find: /^@\/lib\//, replacement: appLib },
  { find: /^@\//, replacement: src },
];
