import type { VaultFolderDto, VaultRecordDto, VaultResponse } from '@/lib/api/types';
import { decryptJson, decryptString, unwrapAesKey } from '@/lib/crypto/aes';
import { rsaUnwrapAesKey } from '@/lib/crypto/rsa';
import { recordDataSchema } from '@/lib/record-types/record-data';
import { isRecordTypeId } from '@/lib/record-types/catalog';
import type { VaultFolder, VaultKeys, VaultRecord } from './store';

export async function decryptFolders(dtos: VaultFolderDto[], keys: VaultKeys): Promise<VaultFolder[]> {
  const out: VaultFolder[] = [];
  for (const f of dtos) {
    let key: CryptoKey | null = null, name = '(pasta indisponível)';
    try {
      if (f.kind === 'shared' && f.encKey) key = f.keyType === 'rsa' ? await rsaUnwrapAesKey(keys.privateKey, f.encKey) : await unwrapAesKey(keys.dataKey, f.encKey);
      name = await decryptString(f.kind === 'shared' ? key! : keys.dataKey, f.encName);
    } catch { /* keep placeholder name */ }
    out.push({ id: f.id, kind: f.kind, name, parentId: f.parentId, ownerId: f.ownerId, role: f.role, key });
  }
  return out;
}

async function unwrapRecordKey(dto: VaultRecordDto, keys: VaultKeys, folderKeys: Map<string, CryptoKey>) {
  for (const k of dto.keys) {
    try {
      if (k.via === 'data') return { key: await unwrapAesKey(keys.dataKey, k.encKey), via: k.via };
      if (k.via === 'rsa') return { key: await rsaUnwrapAesKey(keys.privateKey, k.encKey), via: k.via };
      const fk = k.folderId ? folderKeys.get(k.folderId) : undefined;
      if (fk) return { key: await unwrapAesKey(fk, k.encKey), via: k.via };
    } catch { /* try next path */ }
  }
  return { key: null, via: null as null };
}

export async function decryptRecord(dto: VaultRecordDto, keys: VaultKeys, folderKeys: Map<string, CryptoKey>): Promise<VaultRecord> {
  const { key, via } = await unwrapRecordKey(dto, keys, folderKeys);
  let data: VaultRecord['data'] = null;
  if (key) { try { const parsed = recordDataSchema.safeParse(await decryptJson(key, dto.encData)); data = parsed.success ? parsed.data : null; } catch { data = null; } }
  return {
    id: dto.id, type: isRecordTypeId(dto.type) ? dto.type : 'login', data, key, ownerId: dto.ownerId, ownerEmail: dto.ownerEmail,
    createdAt: dto.createdAt, updatedAt: dto.updatedAt, deletedAt: dto.deletedAt, access: dto.access, sharedFolderIds: dto.sharedFolderIds,
    hasDirectKey: dto.keys.some((k) => k.via !== 'folder'), keyVia: via,
  };
}

export async function decryptVault(dto: VaultResponse, keys: VaultKeys) {
  const folders = await decryptFolders(dto.folders, keys);
  const folderKeys = new Map(folders.filter((f) => f.key).map((f) => [f.id, f.key!] as const));
  const records = await Promise.all(dto.records.map((r) => decryptRecord(r, keys, folderKeys)));
  return { records, folders };
}
