import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api/client';
import type { SessionUser } from '@/lib/api/types';
import { generateAesKey } from '@/lib/crypto/aes';
import { bootstrapSession, changeMasterPassword, unlockWithPassword } from '@/lib/vault/actions';
import { useVault } from '@/lib/vault/store';

vi.mock('@/lib/api/client', () => ({ api: { post: vi.fn(), get: vi.fn(), put: vi.fn(), delete: vi.fn(), upload: vi.fn(), download: vi.fn() }, ApiClientError: class extends Error {} }));

const UNSAFE = 'Parâmetros de segurança inválidos do servidor';
const user = (kdfIterations: number): SessionUser => ({
  id: 'u1', email: 'a@b.c', name: 'A', lockMinutes: 10, kdfSalt: 'AAAAAAAAAAAAAAAAAAAAAA==', kdfIterations, encDataKey: 'x', publicKey: 'p', encPrivateKey: 'e',
});

beforeEach(() => {
  useVault.getState().reset();
  vi.mocked(api.get).mockReset();
  vi.mocked(api.put).mockReset();
});

describe('KDF iteration guard in the vault actions', () => {
  it('bootstrapSession treats a session with unsafe KDF parameters as no session', async () => {
    vi.mocked(api.get).mockResolvedValue({ user: user(1_000) });
    expect(await bootstrapSession()).toBeNull();
    expect(useVault.getState().user).toBeNull();
    vi.mocked(api.get).mockResolvedValue({ user: user(600_000) });
    expect(await bootstrapSession()).toMatchObject({ id: 'u1' });
  });

  it('changeMasterPassword refuses to derive the current authKey with downgraded parameters', async () => {
    const k = await generateAesKey();
    useVault.setState({ user: user(10_000), keys: { dataKey: k, privateKey: k }, status: 'ready' });
    await expect(changeMasterPassword('atual 123', 'nova senha 456')).rejects.toThrow(UNSAFE);
    expect(api.put).not.toHaveBeenCalled();
  });

  it('unlockWithPassword refuses absurd iteration counts before deriving', async () => {
    useVault.setState({ user: user(50_000_000), status: 'locked' });
    await expect(unlockWithPassword('qualquer')).rejects.toThrow(UNSAFE);
    expect(useVault.getState().keys).toBeNull();
  });
});
