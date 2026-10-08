import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VaultResponse } from '@/lib/api/types';
import type { VaultRecord, VaultStatus } from '@/lib/vault/store';

const get = vi.fn<(path: string) => Promise<VaultResponse>>();
vi.mock('@/lib/api/client', () => ({ api: { get: (path: string) => get(path) } }));
// Decryption is covered elsewhere: here each downloaded record id becomes a store record with that id.
vi.mock('@/lib/vault/decrypt', () => ({
  decryptVault: async (dto: VaultResponse) => ({ records: dto.records.map((r) => ({ id: r.id }) as unknown as VaultRecord), folders: [] }),
}));

type Actions = typeof import('@/lib/vault/actions');
type Store = typeof import('@/lib/vault/store');
let actions: Actions;
let useVault: Store['useVault'];

const keys = { dataKey: {} as CryptoKey, privateKey: {} as CryptoKey };
const vaultWith = (...ids: string[]) => ({ records: ids.map((id) => ({ id })), folders: [] }) as unknown as VaultResponse;
const ids = () => useVault.getState().records.map((r) => r.id);

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-08T12:00:00Z'));
  vi.resetModules();
  get.mockReset();
  get.mockResolvedValue(vaultWith('a'));
  actions = await import('@/lib/vault/actions');
  ({ useVault } = await import('@/lib/vault/store'));
  useVault.setState({ keys, status: 'ready', records: [], folders: [] });
});
afterEach(() => { vi.useRealTimers(); });

describe('refreshVault', () => {
  it('reloads the vault without leaving the ready state, flagging refreshing meanwhile', async () => {
    const statuses: VaultStatus[] = [];
    const flags: boolean[] = [];
    const unsubscribe = useVault.subscribe((s) => { statuses.push(s.status); flags.push(s.refreshing); });
    await actions.refreshVault();
    unsubscribe();
    expect(get).toHaveBeenCalledWith('/api/vault');
    expect(ids()).toEqual(['a']);
    expect(statuses.every((st) => st === 'ready')).toBe(true);
    expect(flags[0]).toBe(true);
    expect(useVault.getState().refreshing).toBe(false);
  });

  it('runs at most once every 30 s', async () => {
    await actions.refreshVault();
    vi.advanceTimersByTime(29_999);
    await actions.refreshVault();
    expect(get).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    get.mockResolvedValue(vaultWith('a', 'b'));
    await actions.refreshVault();
    expect(get).toHaveBeenCalledTimes(2);
    expect(ids()).toEqual(['a', 'b']);
  });

  it('force bypasses the throttle (the "Atualizar" button)', async () => {
    await actions.refreshVault();
    await actions.refreshVault({ force: true });
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('an unlock (loadVault) counts as a run', async () => {
    await actions.loadVault();
    await actions.refreshVault();
    expect(get).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(30_000);
    await actions.refreshVault();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('shares one request between concurrent calls', async () => {
    let release: (v: VaultResponse) => void = () => undefined;
    get.mockReturnValueOnce(new Promise((r) => { release = r; }));
    const first = actions.refreshVault();
    const second = actions.refreshVault({ force: true });
    expect(useVault.getState().refreshing).toBe(true);
    release(vaultWith('x'));
    await Promise.all([first, second]);
    expect(get).toHaveBeenCalledTimes(1);
    expect(ids()).toEqual(['x']);
  });

  it('drops a snapshot that predates a local change or a lock', async () => {
    let release: (v: VaultResponse) => void = () => undefined;
    get.mockReturnValueOnce(new Promise((r) => { release = r; }));
    const pending = actions.refreshVault();
    useVault.getState().upsertRecord({ id: 'local' } as unknown as VaultRecord);
    release(vaultWith('stale'));
    await pending;
    expect(ids()).toEqual(['local']);

    get.mockReturnValueOnce(new Promise((r) => { release = r; }));
    const afterLock = actions.refreshVault({ force: true });
    useVault.getState().lock();
    release(vaultWith('stale'));
    await afterLock;
    expect(useVault.getState()).toMatchObject({ status: 'locked', records: [], refreshing: false });
  });

  it('does nothing while locked or during the initial load', async () => {
    useVault.setState({ keys: null, status: 'locked' });
    await actions.refreshVault({ force: true });
    useVault.setState({ keys, status: 'loading' });
    await actions.refreshVault({ force: true });
    expect(get).not.toHaveBeenCalled();
  });

  it('a failed refresh rejects but keeps the vault on screen', async () => {
    useVault.setState({ records: [{ id: 'kept' } as unknown as VaultRecord] });
    get.mockRejectedValueOnce(new Error('offline'));
    await expect(actions.refreshVault()).rejects.toThrow('offline');
    expect(useVault.getState()).toMatchObject({ status: 'ready', refreshing: false });
    expect(ids()).toEqual(['kept']);
  });
});
