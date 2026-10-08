import { describe, expect, it } from 'vitest';
import { t } from '@/lib/i18n/pt-br';

describe('scaffold', () => {
  it('exposes pt-BR strings', () => {
    expect(t.appName).toBe('Keep Passwords');
    expect(globalThis.crypto?.subtle).toBeDefined();
  });
});
