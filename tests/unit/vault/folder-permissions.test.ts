import { describe, expect, it } from 'vitest';
import type { MemberDto } from '@/lib/api/types';
import { emptyRecordData } from '@/lib/record-types/record-data';
import { canManageMembers, canMoveRecord, canShareIntoFolders, folderAbilities, sharedFolderTargets, sortMembers } from '@/lib/vault/folder-permissions';
import type { VaultFolder, VaultRecord } from '@/lib/vault/store';

const fakeKey = {} as CryptoKey;
const folder = (id: string, name: string, over: Partial<VaultFolder> = {}): VaultFolder => ({ id, kind: 'shared', name, parentId: null, ownerId: 'me', role: 'owner', key: null, ...over });
const rec = (over: Partial<VaultRecord> = {}): VaultRecord => ({
  id: 'r1', type: 'login', data: emptyRecordData('login'), key: fakeKey, ownerId: 'me', ownerEmail: 'me@x', createdAt: '', updatedAt: '', deletedAt: null,
  access: { permission: 'owner', canShare: true, favorite: false, folderId: null }, sharedFolderIds: [], hasDirectKey: true, keyVia: 'data', ...over,
});

describe('folderAbilities', () => {
  it('personal folders allow everything but members', () => {
    expect(folderAbilities({ kind: 'personal', role: 'owner' })).toEqual({ rename: true, addSubfolder: true, members: false, delete: true });
  });
  it('shared folders: admin renames, only the owner deletes, everyone sees members, no subfolders', () => {
    expect(folderAbilities({ kind: 'shared', role: 'owner' })).toEqual({ rename: true, addSubfolder: false, members: true, delete: true });
    expect(folderAbilities({ kind: 'shared', role: 'admin' })).toEqual({ rename: true, addSubfolder: false, members: true, delete: false });
    expect(folderAbilities({ kind: 'shared', role: 'editor' })).toEqual({ rename: false, addSubfolder: false, members: true, delete: false });
    expect(folderAbilities({ kind: 'shared', role: 'viewer' })).toEqual({ rename: false, addSubfolder: false, members: true, delete: false });
  });
  it('only owners and admins manage members', () => {
    expect(['owner', 'admin', 'editor', 'viewer'].map((r) => canManageMembers(r as VaultFolder['role']))).toEqual([true, true, false, false]);
  });
});

describe('sharedFolderTargets', () => {
  it('keeps shared folders the caller can add to, sorted by name', () => {
    const fs = [folder('z', 'Zeta', { role: 'editor' }), folder('v', 'Vista', { role: 'viewer' }), folder('p', 'Pessoal', { kind: 'personal' }), folder('a', 'Ágata', { role: 'admin' })];
    expect(sharedFolderTargets(fs).map((f) => f.id)).toEqual(['a', 'z']);
  });
});

describe('record move rules', () => {
  it('adding to a shared folder needs the key, edit access and canShare', () => {
    expect(canShareIntoFolders(rec())).toBe(true);
    expect(canShareIntoFolders(rec({ access: { permission: 'edit', canShare: false, favorite: false, folderId: null } }))).toBe(false);
    expect(canShareIntoFolders(rec({ access: { permission: 'view', canShare: true, favorite: false, folderId: null } }))).toBe(false);
    expect(canShareIntoFolders(rec({ key: null }))).toBe(false);
    expect(canShareIntoFolders(rec({ data: null }))).toBe(false);
  });
  it('move is offered with a direct key or when the record can go into a shared folder, never from the trash', () => {
    expect(canMoveRecord(rec())).toBe(true);
    const viewOnly = { permission: 'view' as const, canShare: false, favorite: false, folderId: null };
    expect(canMoveRecord(rec({ ownerId: 'other', access: viewOnly }))).toBe(true);
    expect(canMoveRecord(rec({ ownerId: 'other', access: viewOnly, hasDirectKey: false }))).toBe(false);
    expect(canMoveRecord(rec({ ownerId: 'other', hasDirectKey: false, access: { permission: 'edit', canShare: true, favorite: false, folderId: null } }))).toBe(true);
    expect(canMoveRecord(rec({ deletedAt: '2026-10-01' }))).toBe(false);
  });
});

describe('sortMembers', () => {
  it('puts the owner first, then by role, then by name', () => {
    const m = (userId: string, name: string, role: MemberDto['role']): MemberDto => ({ userId, email: `${userId}@x`, name, role });
    const sorted = sortMembers([m('v', 'Vera', 'viewer'), m('e2', 'Zé', 'editor'), m('o', 'Olga', 'owner'), m('e1', 'Ana', 'editor'), m('a', 'Bia', 'admin')]);
    expect(sorted.map((x) => x.userId)).toEqual(['o', 'a', 'e1', 'e2', 'v']);
  });
});
