import { beforeEach, describe, expect, it } from 'vitest';
import { useVault, type VaultFolder } from '@/lib/vault/store';

const f = (id: string, parentId: string | null): VaultFolder => ({ id, kind: 'personal', name: id, parentId, ownerId: 'me', role: 'owner', key: null });

describe('vault store', () => {
  beforeEach(() => useVault.getState().reset());
  it('removeFolder re-parents children to the removed folder parent', async () => {
    const k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
    useVault.getState().setKeys({ dataKey: k, privateKey: k });
    useVault.getState().setVault({ records: [], folders: [f('a', null), f('b', 'a'), f('c', 'b'), f('d', 'b')] });
    useVault.getState().removeFolder('b');
    expect(useVault.getState().folders.map((x) => [x.id, x.parentId])).toEqual([['a', null], ['c', 'a'], ['d', 'a']]);
  });
  it('ignores writes when locked', () => {
    useVault.getState().upsertFolder(f('x', null));
    expect(useVault.getState().folders).toEqual([]);
  });
});
