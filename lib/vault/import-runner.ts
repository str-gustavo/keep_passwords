import type { ImportedRecord } from '@/lib/import-export/import';
import type { RecordData } from '@/lib/record-types/record-data';
import type { VaultFolder } from './store';

export interface ImportDeps {
  createRecord: (data: RecordData, folderId: string | null) => Promise<unknown>;
  createPersonalFolder: (name: string, parentId: string | null) => Promise<VaultFolder>;
  folders: VaultFolder[];
}

/** Last segment of a folder path: `Casa/Contas` maps to `Contas`. */
const leaf = (p: string) => p.split('/').filter(Boolean).pop() ?? '';

export function planImport(records: ImportedRecord[], existing: VaultFolder[]): { foldersToCreate: string[]; total: number } {
  const names = new Set(existing.filter((f) => f.kind === 'personal').map((f) => f.name.toLowerCase()));
  const toCreate = [...new Set(records.map((r) => (r.folderPath ? leaf(r.folderPath) : '')).filter((n) => n && !names.has(n.toLowerCase())))];
  return { foldersToCreate: toCreate, total: records.length };
}

/** Creates the records one at a time; missing folders are created under `targetFolderId` when `createMissingFolders` is set. */
export async function runImport(records: ImportedRecord[], targetFolderId: string | null, createMissingFolders: boolean, deps: ImportDeps): Promise<{ created: number }> {
  const byName = new Map(deps.folders.filter((f) => f.kind === 'personal').map((f) => [f.name.toLowerCase(), f.id] as const));
  let created = 0;
  for (const r of records) {
    let folderId = targetFolderId;
    const name = r.folderPath ? leaf(r.folderPath) : '';
    if (name) {
      const existing = byName.get(name.toLowerCase());
      if (existing) folderId = existing;
      else if (createMissingFolders) {
        const f = await deps.createPersonalFolder(name, targetFolderId);
        byName.set(name.toLowerCase(), f.id);
        folderId = f.id;
      }
    }
    await deps.createRecord(r.data, folderId);
    created++;
  }
  return { created };
}
