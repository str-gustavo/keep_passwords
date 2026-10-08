import { describe, expect, it } from 'vitest';
import { filterRecords, folderTree } from '@/lib/vault/selectors';
import type { VaultFolder, VaultRecord } from '@/lib/vault/store';
import { emptyRecordData } from '@/lib/record-types/record-data';

const rec = (id: string, title: string, over: Partial<VaultRecord> = {}): VaultRecord => ({ id, type: 'login', data: { ...emptyRecordData('login'), title, fields: { login: 'u' } }, key: null, ownerId: 'me', ownerEmail: 'me@x', createdAt: '', updatedAt: '', deletedAt: null, access: { permission: 'owner', canShare: true, favorite: false, folderId: null }, sharedFolderIds: [], hasDirectKey: true, keyVia: 'data', ...over });

describe('filterRecords', () => {
  const rs = [rec('1', 'Zeta'), rec('2', 'Água', { access: { permission: 'owner', canShare: true, favorite: true, folderId: 'f1' } }), rec('3', 'Lixo', { deletedAt: 'x' }), rec('4', 'Deles', { ownerId: 'other', access: { permission: 'view', canShare: false, favorite: false, folderId: null } }), rec('5', 'Pasta', { sharedFolderIds: ['sf'] })];
  it('all excludes trash and sorts by locale', () => expect(filterRecords(rs, { kind: 'all' }, '', 'me').map((r) => r.id)).toEqual(['2', '4', '5', '1']));
  it('favorites, folder, shared, trash', () => {
    expect(filterRecords(rs, { kind: 'favorites' }, '', 'me').map((r) => r.id)).toEqual(['2']);
    expect(filterRecords(rs, { kind: 'folder', folderId: 'f1' }, '', 'me').map((r) => r.id)).toEqual(['2']);
    expect(filterRecords(rs, { kind: 'folder', folderId: 'sf' }, '', 'me').map((r) => r.id)).toEqual(['5']);
    expect(filterRecords(rs, { kind: 'shared' }, '', 'me').map((r) => r.id)).toEqual(['4']);
    expect(filterRecords(rs, { kind: 'trash' }, '', 'me').map((r) => r.id)).toEqual(['3']);
  });
  it('searches title and fields case-insensitively', () => expect(filterRecords(rs, { kind: 'all' }, 'zE', 'me').map((r) => r.id)).toEqual(['1']));
});

describe('folderTree', () => {
  it('nests by parent and sorts siblings', () => {
    const f = (id: string, name: string, parentId: string | null): VaultFolder => ({ id, kind: 'personal', name, parentId, ownerId: 'me', role: 'owner', key: null });
    const tree = folderTree([f('b', 'Beta', null), f('a', 'Alfa', null), f('c', 'Filha', 'b')]);
    expect(tree.map((x) => [x.folder.id, x.depth])).toEqual([['a', 0], ['b', 0], ['c', 1]]);
  });
});
