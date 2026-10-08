import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAccountMaterial, computeAuthKey, computeRecoveryAuthKey, unlockDataKey, WrongPasswordError } from '@/lib/crypto/account';
import { exportAesKey } from '@/lib/crypto/aes';
import { t } from '@/lib/i18n/pt-br';
import { useVault } from '@/lib/vault/store';

vi.mock('@/lib/api/client', () => ({ api: { post: vi.fn(), get: vi.fn(), put: vi.fn(), delete: vi.fn(), upload: vi.fn(), download: vi.fn(), setUnauthorizedHandler: vi.fn() }, ApiClientError: class extends Error {} }));
const { api } = await import('@/lib/api/client');
const { signIn, signUp } = await import('@/lib/auth/flows');

describe('auth flows', () => {
  beforeEach(() => { useVault.getState().reset(); vi.mocked(api.post).mockReset(); vi.mocked(api.get).mockReset(); });

  it('signUp posts material without the password and leaves the vault unlocked', async () => {
    vi.mocked(api.post).mockImplementation(async (path, body) => {
      if (path === '/api/auth/register') { const b = body as Record<string, string>; return { user: { id: 'u1', email: 'a@b.c', name: 'A', lockMinutes: 10, kdfSalt: b.kdfSalt, kdfIterations: 600_000, encDataKey: b.encDataKey, publicKey: b.publicKey, encPrivateKey: b.encPrivateKey } }; }
      throw new Error('unexpected ' + path);
    });
    vi.mocked(api.get).mockResolvedValue({ records: [], folders: [] });
    const { phrase } = await signUp('a@b.c', 'A', 'senha forte 123');
    expect(phrase.split(' ')).toHaveLength(24);
    const body = vi.mocked(api.post).mock.calls[0]![1] as Record<string, unknown>;
    expect(JSON.stringify(body)).not.toContain('senha forte 123');
    expect(body).not.toHaveProperty('dataKey');
    expect(useVault.getState().keys).not.toBeNull();
    expect(useVault.getState().status).toBe('ready');
  });

  it('signIn uses prelogin salt and derived auth key, then unlocks locally', async () => {
    const m = await createAccountMaterial('a@b.c', 'pw 123456');
    vi.mocked(api.post).mockImplementation(async (path, body) => {
      if (path === '/api/auth/prelogin') return { kdfSalt: m.kdfSalt, kdfIterations: 600_000 };
      if (path === '/api/auth/login') {
        expect((body as { authKey: string }).authKey).toBe(await computeAuthKey('a@b.c', 'pw 123456', m.kdfSalt, 600_000));
        return { user: { id: 'u1', email: 'a@b.c', name: 'A', lockMinutes: 10, kdfSalt: m.kdfSalt, kdfIterations: 600_000, encDataKey: m.encDataKey, publicKey: m.publicKey, encPrivateKey: m.encPrivateKey } };
      }
      throw new Error('unexpected ' + path);
    });
    vi.mocked(api.get).mockResolvedValue({ records: [], folders: [] });
    await signIn('a@b.c', 'pw 123456');
    expect(useVault.getState().status).toBe('ready');
  });
});

describe('auth flows — hardening', () => {
  beforeEach(() => { useVault.getState().reset(); vi.mocked(api.post).mockReset(); vi.mocked(api.get).mockReset(); });

  const userFrom = (b: Record<string, unknown>) => ({ id: 'u1', email: 'a@b.c', name: 'A', lockMinutes: 10, kdfSalt: b.kdfSalt, kdfIterations: b.kdfIterations, encDataKey: b.encDataKey, publicKey: b.publicKey, encPrivateKey: b.encPrivateKey });

  it('signUp sends exactly the register fields and never the recovery phrase', async () => {
    vi.mocked(api.post).mockImplementation(async (path, body) => {
      if (path === '/api/auth/register') return { user: userFrom(body as Record<string, unknown>) };
      throw new Error('unexpected ' + path);
    });
    vi.mocked(api.get).mockResolvedValue({ records: [], folders: [] });
    const { phrase } = await signUp('a@b.c', 'A', 'senha forte 123');
    const body = vi.mocked(api.post).mock.calls[0]![1] as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['authKey', 'email', 'encDataKey', 'encDataKeyRecovery', 'encPrivateKey', 'kdfIterations', 'kdfSalt', 'name', 'publicKey', 'recoveryAuthKey', 'recoverySalt']);
    expect(JSON.stringify(body)).not.toContain(phrase);
    expect(body.kdfIterations).toBe(600_000);
  });

  it('signUp opens the brand-new (empty) vault without a network round trip that could hide the phrase', async () => {
    vi.mocked(api.post).mockImplementation(async (path, body) => {
      if (path === '/api/auth/register') return { user: userFrom(body as Record<string, unknown>) };
      throw new Error('unexpected ' + path);
    });
    vi.mocked(api.get).mockRejectedValue(new Error('offline'));
    const { phrase } = await signUp('a@b.c', 'A', 'senha forte 123');
    expect(phrase.split(' ')).toHaveLength(24);
    expect(api.get).not.toHaveBeenCalled();
    expect(useVault.getState().status).toBe('ready');
    expect(useVault.getState().keys).not.toBeNull();
  });

  it('recoverComplete still returns the new phrase when loading the vault fails after the credentials were rotated', async () => {
    const m = await createAccountMaterial('a@b.c', 'senha antiga 123');
    vi.mocked(api.post).mockImplementation(async (path, body) => {
      if (path === '/api/auth/recovery/verify') return { token: 'token-1234567890', encDataKeyRecovery: m.recovery.encDataKeyRecovery };
      if (path === '/api/auth/recovery/complete') return { user: userFrom({ ...(body as Record<string, unknown>), publicKey: m.publicKey, encPrivateKey: m.encPrivateKey }) };
      throw new Error('unexpected ' + path);
    });
    vi.mocked(api.get).mockRejectedValue(new Error('offline'));
    const { recoverComplete } = await import('@/lib/auth/flows');
    const { phrase } = await recoverComplete('a@b.c', m.recoveryPhrase, 'nova senha forte 789', m.recovery.recoverySalt);
    expect(phrase.split(' ')).toHaveLength(24);
    expect(useVault.getState().keys).not.toBeNull();
    expect(useVault.getState().status).toBe('error');
  });

  it('signIn refuses weak KDF parameters from prelogin without deriving keys or logging in', async () => {
    vi.mocked(api.post).mockImplementation(async (path) => {
      if (path === '/api/auth/prelogin') return { kdfSalt: 'AAAAAAAAAAAAAAAAAAAAAA==', kdfIterations: 1_000 };
      throw new Error('unexpected ' + path);
    });
    await expect(signIn('a@b.c', 'pw 123456')).rejects.toThrow('Parâmetros de segurança inválidos do servidor');
    expect(vi.mocked(api.post).mock.calls.map((c) => c[0])).toEqual(['/api/auth/prelogin']);
    expect(useVault.getState().keys).toBeNull();
  });

  it('signIn refuses absurd KDF iteration counts above the server ceiling (5_000_000)', async () => {
    vi.mocked(api.post).mockImplementation(async (path) => {
      if (path === '/api/auth/prelogin') return { kdfSalt: 'AAAAAAAAAAAAAAAAAAAAAA==', kdfIterations: 5_000_001 };
      throw new Error('unexpected ' + path);
    });
    await expect(signIn('a@b.c', 'pw 123456')).rejects.toThrow('Parâmetros de segurança inválidos do servidor');
    expect(vi.mocked(api.post).mock.calls.map((c) => c[0])).toEqual(['/api/auth/prelogin']);
    expect(useVault.getState().keys).toBeNull();
  });

  it('signIn refuses weak KDF parameters in the login user object', async () => {
    const m = await createAccountMaterial('a@b.c', 'pw 123456');
    vi.mocked(api.post).mockImplementation(async (path) => {
      if (path === '/api/auth/prelogin') return { kdfSalt: m.kdfSalt, kdfIterations: 600_000 };
      if (path === '/api/auth/login') return { user: userFrom({ ...m, kdfIterations: 10_000 }) };
      throw new Error('unexpected ' + path);
    });
    await expect(signIn('a@b.c', 'pw 123456')).rejects.toThrow('Parâmetros de segurança inválidos do servidor');
    expect(useVault.getState().keys).toBeNull();
    expect(useVault.getState().user).toBeNull();
  });

  it('recoverComplete verifies the phrase, rewraps the data key under the new password and returns a fresh phrase', async () => {
    const m = await createAccountMaterial('a@b.c', 'senha antiga 123');
    let completeBody: Record<string, unknown> = {};
    vi.mocked(api.post).mockImplementation(async (path, body) => {
      if (path === '/api/auth/recovery/verify') {
        expect((body as { recoveryAuthKey: string }).recoveryAuthKey).toBe(await computeRecoveryAuthKey(m.recoveryPhrase, m.recovery.recoverySalt));
        return { token: 'token-1234567890', encDataKeyRecovery: m.recovery.encDataKeyRecovery };
      }
      if (path === '/api/auth/recovery/complete') { completeBody = body as Record<string, unknown>; return { user: userFrom({ ...completeBody, publicKey: m.publicKey, encPrivateKey: m.encPrivateKey }) }; }
      throw new Error('unexpected ' + path);
    });
    vi.mocked(api.get).mockResolvedValue({ records: [], folders: [] });
    const { recoverComplete } = await import('@/lib/auth/flows');
    const { phrase } = await recoverComplete('a@b.c', m.recoveryPhrase, 'nova senha forte 789', m.recovery.recoverySalt);
    expect(phrase.split(' ')).toHaveLength(24);
    expect(phrase).not.toBe(m.recoveryPhrase);
    const sent = JSON.stringify(vi.mocked(api.post).mock.calls.map((c) => c[1]));
    expect(sent).not.toContain('nova senha forte 789');
    expect(sent).not.toContain(m.recoveryPhrase);
    expect(sent).not.toContain(phrase);
    expect(completeBody.token).toBe('token-1234567890');
    const dk = await unlockDataKey('a@b.c', 'nova senha forte 789', completeBody.kdfSalt as string, completeBody.kdfIterations as number, completeBody.encDataKey as string);
    expect(await exportAesKey(dk)).toEqual(await exportAesKey(m.dataKey));
    expect(useVault.getState().status).toBe('ready');
  });

  it('recoverComplete refuses weak KDF parameters returned by the server', async () => {
    const m = await createAccountMaterial('a@b.c', 'senha antiga 123');
    vi.mocked(api.post).mockImplementation(async (path, body) => {
      if (path === '/api/auth/recovery/verify') return { token: 'token-1234567890', encDataKeyRecovery: m.recovery.encDataKeyRecovery };
      if (path === '/api/auth/recovery/complete') return { user: userFrom({ ...(body as Record<string, unknown>), kdfIterations: 1_000, publicKey: m.publicKey, encPrivateKey: m.encPrivateKey }) };
      throw new Error('unexpected ' + path);
    });
    const { recoverComplete } = await import('@/lib/auth/flows');
    await expect(recoverComplete('a@b.c', m.recoveryPhrase, 'nova senha forte 789', m.recovery.recoverySalt)).rejects.toThrow('Parâmetros de segurança inválidos do servidor');
    expect(useVault.getState().keys).toBeNull();
  });

  it('recoverStart posts only the email', async () => {
    vi.mocked(api.post).mockResolvedValue({ recoverySalt: 'c2FsdA==' });
    const { recoverStart } = await import('@/lib/auth/flows');
    expect(await recoverStart('a@b.c')).toEqual({ recoverySalt: 'c2FsdA==' });
    expect(vi.mocked(api.post).mock.calls).toEqual([['/api/auth/recovery/start', { email: 'a@b.c' }]]);
  });

  it('safeNextPath only allows same-origin paths', async () => {
    const { safeNextPath } = await import('@/lib/auth/flows');
    expect(safeNextPath(null)).toBe('/cofre');
    expect(safeNextPath('')).toBe('/cofre');
    expect(safeNextPath('/cofre/auditoria?r=1')).toBe('/cofre/auditoria?r=1');
    expect(safeNextPath('//evil.example')).toBe('/cofre');
    expect(safeNextPath('https://evil.example')).toBe('/cofre');
    expect(safeNextPath('/\\evil.example')).toBe('/cofre');
    expect(safeNextPath('/\t/evil.example')).toBe('/cofre');
    expect(safeNextPath('javascript:alert(1)')).toBe('/cofre');
    // Dot segments that normalize to a protocol-relative path.
    expect(safeNextPath('/..//evil.example')).toBe('/cofre');
    expect(safeNextPath('/.//evil.example')).toBe('/cofre');
    expect(safeNextPath('/%2e%2e//evil.example')).toBe('/cofre');
    expect(safeNextPath('/cofre/..//evil.example')).toBe('/cofre');
    expect(safeNextPath('/cofre/gerador#topo')).toBe('/cofre/gerador#topo');
  });

  it('authErrorMessage maps errors to safe pt-BR messages', async () => {
    const { authErrorMessage } = await import('@/lib/auth/flows');
    const { ApiClientError } = await import('@/lib/api/client');
    const MockedApiError = ApiClientError as unknown as new (message: string) => Error;
    expect(authErrorMessage(new MockedApiError('E-mail ou senha incorretos'))).toBe('E-mail ou senha incorretos');
    expect(authErrorMessage(new WrongPasswordError())).toBe(t.wrongMasterPassword);
    expect(authErrorMessage(new WrongPasswordError(), 'Frase de recuperação incorreta')).toBe('Frase de recuperação incorreta');
    expect(authErrorMessage(new Error('Parâmetros de segurança inválidos do servidor'))).toBe('Parâmetros de segurança inválidos do servidor');
    expect(authErrorMessage(new Error('OperationError: internal detail'))).toBe(t.genericAuthError);
    expect(authErrorMessage('boom')).toBe(t.genericAuthError);
  });
});
