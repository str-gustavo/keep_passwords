import { describe, expect, it } from 'vitest';
// lib/crypto/kdf.ts itself imports `@/lib/i18n/pt-br` (the app's alias): this only resolves because
// vite.aliases.ts maps `@/lib/*` to the app's lib before `@/*` → extension/src.
import { KDF_ITERATIONS, assertKdfIterations } from '@app/crypto/kdf';
import { t } from '@/lib/i18n/pt-br';

describe('shared app lib aliases', () => {
  it('resolves @app/* and the lib-internal @/lib/* imports', () => {
    expect(() => assertKdfIterations(KDF_ITERATIONS)).not.toThrow();
    expect(() => assertKdfIterations(1_000)).toThrow(t.unsafeServerParams);
  });
});
