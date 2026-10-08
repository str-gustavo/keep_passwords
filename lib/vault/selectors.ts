import { recordSearchText } from '@/lib/record-types/record-data';
import type { VaultFolder, VaultRecord } from './store';

export type ListFilter = { kind: 'all' } | { kind: 'favorites' } | { kind: 'folder'; folderId: string } | { kind: 'shared' } | { kind: 'trash' };
const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });
const titleOf = (r: VaultRecord) => r.data?.title ?? '';

export function filterRecords(records: VaultRecord[], filter: ListFilter, query: string, userId: string): VaultRecord[] {
  const q = query.trim().toLowerCase();
  return records
    .filter((r) => (filter.kind === 'trash' ? r.deletedAt !== null : r.deletedAt === null))
    .filter((r) => {
      switch (filter.kind) {
        case 'favorites': return r.access.favorite;
        case 'folder': return r.access.folderId === filter.folderId || r.sharedFolderIds.includes(filter.folderId);
        case 'shared': return r.ownerId !== userId;
        default: return true;
      }
    })
    .filter((r) => !q || (r.data ? recordSearchText(r.data).includes(q) : false))
    .sort((a, b) => collator.compare(titleOf(a), titleOf(b)));
}

export function folderTree(folders: VaultFolder[]): { folder: VaultFolder; depth: number }[] {
  const personal = folders.filter((f) => f.kind === 'personal');
  const out: { folder: VaultFolder; depth: number }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const f of personal.filter((x) => x.parentId === parentId).sort((a, b) => collator.compare(a.name, b.name))) { out.push({ folder: f, depth }); if (depth < 10) walk(f.id, depth + 1); }
  };
  walk(null, 0);
  return out;
}
export const folderNameOf = (folders: VaultFolder[], id: string | null) => (id ? folders.find((f) => f.id === id)?.name ?? null : null);
