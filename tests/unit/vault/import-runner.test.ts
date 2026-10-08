import { describe, expect, it, vi } from 'vitest';
import { planImport, runImport } from '@/lib/vault/import-runner';
import { emptyRecordData, type RecordData } from '@/lib/record-types/record-data';
import type { VaultFolder } from '@/lib/vault/store';
const rec = (title: string, folderPath: string | null) => ({ data: { ...emptyRecordData('login'), title }, folderPath });
const folder = (id: string, name: string): VaultFolder => ({ id, kind: 'personal', name, parentId: null, ownerId: 'me', role: 'owner', key: null });
describe('import runner', () => {
  it('plans missing folders and creates records in the right folder', async () => {
    const records = [rec('a', 'Trabalho'), rec('b', 'Casa/Contas'), rec('c', null), rec('d', 'Trabalho')];
    expect(planImport(records, [folder('f1', 'Trabalho')])).toEqual({ foldersToCreate: ['Contas'], total: 4 });
    const createRecord = vi.fn<(data: RecordData, folderId: string | null) => Promise<unknown>>(async () => ({}));
    const createPersonalFolder = vi.fn(async (name: string) => folder('new-' + name, name));
    const r = await runImport(records, null, true, { createRecord, createPersonalFolder, folders: [folder('f1', 'Trabalho')] });
    expect(r.created).toBe(4);
    expect(createPersonalFolder).toHaveBeenCalledWith('Contas', null);
    expect(createRecord.mock.calls.map((c) => c[1])).toEqual(['f1', 'new-Contas', null, 'f1']);
  });
  it('falls back to the target folder when missing folders are not created', async () => {
    const records = [rec('a', 'Novo'), rec('b', null), rec('c', 'trabalho')];
    const createRecord = vi.fn<(data: RecordData, folderId: string | null) => Promise<unknown>>(async () => ({}));
    const createPersonalFolder = vi.fn(async (name: string) => folder('new-' + name, name));
    const r = await runImport(records, 'alvo', false, { createRecord, createPersonalFolder, folders: [folder('f1', 'Trabalho')] });
    expect(r.created).toBe(3);
    expect(createPersonalFolder).not.toHaveBeenCalled();
    expect(createRecord.mock.calls.map((c) => c[1])).toEqual(['alvo', 'alvo', 'f1']);
  });
  it('creates each missing folder once, under the target folder', async () => {
    const createRecord = vi.fn<(data: RecordData, folderId: string | null) => Promise<unknown>>(async () => ({}));
    const createPersonalFolder = vi.fn(async (name: string) => folder('new-' + name, name));
    await runImport([rec('a', 'X/Novo'), rec('b', 'novo')], 'alvo', true, { createRecord, createPersonalFolder, folders: [] });
    expect(createPersonalFolder).toHaveBeenCalledTimes(1);
    expect(createPersonalFolder).toHaveBeenCalledWith('Novo', 'alvo');
    expect(createRecord.mock.calls.map((c) => c[1])).toEqual(['new-Novo', 'new-Novo']);
  });
});
