'use client';
import { create } from 'zustand';
import type { FolderRole, SessionUser, VaultRecordDto } from '@/lib/api/types';
import type { RecordTypeId } from '@/lib/record-types/catalog';
import type { RecordData } from '@/lib/record-types/record-data';

export interface VaultRecord { id: string; type: RecordTypeId; data: RecordData | null; key: CryptoKey | null; ownerId: string; ownerEmail: string; createdAt: string; updatedAt: string; deletedAt: string | null; access: VaultRecordDto['access']; sharedFolderIds: string[]; hasDirectKey: boolean; keyVia: 'data' | 'rsa' | 'folder' | null }
export interface VaultFolder { id: string; kind: 'personal' | 'shared'; name: string; parentId: string | null; ownerId: string; role: FolderRole; key: CryptoKey | null }
export type VaultStatus = 'idle' | 'loading' | 'ready' | 'locked' | 'error';
export interface VaultKeys { dataKey: CryptoKey; privateKey: CryptoKey }
export interface VaultState {
  status: VaultStatus; user: SessionUser | null; keys: VaultKeys | null; records: VaultRecord[]; folders: VaultFolder[]; error: string | null;
  setUser: (u: SessionUser | null) => void; setKeys: (k: VaultKeys | null) => void; setStatus: (s: VaultStatus, error?: string | null) => void;
  setVault: (v: { records: VaultRecord[]; folders: VaultFolder[] }) => void; upsertRecord: (r: VaultRecord) => void; removeRecord: (id: string) => void;
  upsertFolder: (f: VaultFolder) => void; removeFolder: (id: string) => void; lock: () => void; reset: () => void;
}
const empty = { status: 'idle' as VaultStatus, user: null, keys: null, records: [], folders: [], error: null };
export const useVault = create<VaultState>((set) => ({
  ...empty,
  setUser: (user) => set({ user }),
  setKeys: (keys) => set({ keys }),
  setStatus: (status, error = null) => set({ status, error }),
  setVault: ({ records, folders }) => set({ records, folders, status: 'ready', error: null }),
  upsertRecord: (r) => set((s) => ({ records: s.records.some((x) => x.id === r.id) ? s.records.map((x) => (x.id === r.id ? r : x)) : [...s.records, r] })),
  removeRecord: (id) => set((s) => ({ records: s.records.filter((x) => x.id !== id) })),
  upsertFolder: (f) => set((s) => ({ folders: s.folders.some((x) => x.id === f.id) ? s.folders.map((x) => (x.id === f.id ? f : x)) : [...s.folders, f] })),
  removeFolder: (id) => set((s) => ({ folders: s.folders.filter((x) => x.id !== id), records: s.records.map((r) => (r.access.folderId === id ? { ...r, access: { ...r.access, folderId: null } } : r)) })),
  lock: () => set({ keys: null, records: [], folders: [], status: 'locked', error: null }),
  reset: () => set({ ...empty }),
}));
