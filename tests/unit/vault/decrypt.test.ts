import { describe, expect, it } from 'vitest';
import { decryptVault } from '@/lib/vault/decrypt';
import { createAccountMaterial } from '@/lib/crypto/account';
import { encryptJson, encryptString, generateAesKey, wrapAesKey } from '@/lib/crypto/aes';
import { importPublicKey, rsaWrapAesKey } from '@/lib/crypto/rsa';
import { emptyRecordData } from '@/lib/record-types/record-data';
import type { VaultRecordDto, VaultFolderDto } from '@/lib/api/types';

const base = (over: Partial<VaultRecordDto>): VaultRecordDto => ({ id: 'r', type: 'login', encData: '', ownerId: 'o', ownerEmail: 'o@x', createdAt: '', updatedAt: '', deletedAt: null, access: { permission: 'owner', canShare: true, favorite: false, folderId: null }, keys: [], sharedFolderIds: [], ...over });

describe('decryptVault', () => {
  it('decrypts records via data, rsa and folder paths and tolerates bad blobs', async () => {
    const me = await createAccountMaterial('me@x', 'pw');
    const keys = { dataKey: me.dataKey, privateKey: me.privateKey };
    const k1 = await generateAesKey(), k2 = await generateAesKey(), k3 = await generateAesKey(), fk = await generateAesKey();
    const mk = (title: string) => ({ ...emptyRecordData('login'), title });
    const folders: VaultFolderDto[] = [
      { id: 'pf', kind: 'personal', encName: await encryptString(me.dataKey, 'Pessoal'), parentId: null, ownerId: 'me', role: 'owner', encKey: null, keyType: null },
      { id: 'sf', kind: 'shared', encName: await encryptString(fk, 'Equipe'), parentId: null, ownerId: 'o', role: 'viewer', encKey: await rsaWrapAesKey(await importPublicKey(me.publicKey), fk), keyType: 'rsa' },
    ];
    const records: VaultRecordDto[] = [
      base({ id: 'a', encData: await encryptJson(k1, mk('A')), keys: [{ via: 'data', encKey: await wrapAesKey(me.dataKey, k1) }] }),
      base({ id: 'b', encData: await encryptJson(k2, mk('B')), keys: [{ via: 'rsa', encKey: await rsaWrapAesKey(await importPublicKey(me.publicKey), k2) }] }),
      base({ id: 'c', encData: await encryptJson(k3, mk('C')), keys: [{ via: 'folder', encKey: await wrapAesKey(fk, k3), folderId: 'sf' }], sharedFolderIds: ['sf'] }),
      base({ id: 'd', encData: 'AQIDBA==', keys: [{ via: 'data', encKey: await wrapAesKey(me.dataKey, k1) }] }),
    ];
    const v = await decryptVault({ records, folders }, keys);
    expect(v.folders.map((f) => f.name)).toEqual(['Pessoal', 'Equipe']);
    expect(v.folders[1]!.key).not.toBeNull();
    expect(v.records.map((r) => [r.id, r.data?.title ?? null, r.keyVia])).toEqual([['a', 'A', 'data'], ['b', 'B', 'rsa'], ['c', 'C', 'folder'], ['d', null, 'data']]);
    expect(v.records[3]!.key).not.toBeNull();
    expect(v.records[0]!.hasDirectKey).toBe(true);
    expect(v.records[2]!.hasDirectKey).toBe(false);
  });
});
