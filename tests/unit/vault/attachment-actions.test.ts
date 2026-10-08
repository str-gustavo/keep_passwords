import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateAesKey } from '@/lib/crypto/aes';
import { emptyRecordData } from '@/lib/record-types/record-data';
import { deleteAttachment, uploadAttachment } from '@/lib/vault/actions';
import { useVault, type VaultRecord } from '@/lib/vault/store';

const ID = '11111111-1111-4111-8111-111111111111';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const current = () => useVault.getState().records.find((r) => r.id === ID)!;
/** Simulates the record form saving a new title while the attachment request is in flight. */
const saveTitleMeanwhile = (title: string) => { const r = current(); useVault.getState().upsertRecord({ ...r, data: { ...r.data!, title } }); };

beforeEach(async () => {
  const key = await generateAesKey();
  const record: VaultRecord = {
    id: ID, type: 'login', key, ownerId: 'u', ownerEmail: 'u@x.com', createdAt: '', updatedAt: '', deletedAt: null,
    data: { ...emptyRecordData('login'), title: 'Antes', attachments: [{ id: 'old', name: 'old.txt', size: 1, mime: 'text/plain' }] },
    access: { permission: 'owner', canShare: true, favorite: false, folderId: null }, sharedFolderIds: [], hasDirectKey: true, keyVia: 'data',
  };
  useVault.setState({ keys: { dataKey: key, privateKey: key }, records: [record], status: 'ready' });
});
afterEach(() => { vi.unstubAllGlobals(); useVault.getState().reset(); });

describe('attachment actions keep changes saved while the request was in flight', () => {
  it('uploadAttachment builds the new data from the record as it is after the upload', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      if (init.method === 'POST' && url.endsWith('/attachments')) { saveTitleMeanwhile('Depois'); return json({ id: 'new', size: 40 }, 201); }
      if (init.method === 'PUT' && url === `/api/records/${ID}`) return json({ record: { id: ID, updatedAt: 'now' } });
      throw new Error(`unexpected ${init.method} ${url}`);
    }));
    await uploadAttachment(ID, new File(['hello'], 'novo.txt', { type: 'text/plain' }));
    expect(current().data!.title).toBe('Depois');
    expect(current().data!.attachments.map((a) => a.id)).toEqual(['old', 'new']);
  });

  it('deleteAttachment builds the new data from the record as it is after the delete', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      if (init.method === 'DELETE' && url.endsWith('/attachments/old')) { saveTitleMeanwhile('Depois'); return new Response(null, { status: 204 }); }
      if (init.method === 'PUT' && url === `/api/records/${ID}`) return json({ record: { id: ID, updatedAt: 'now' } });
      throw new Error(`unexpected ${init.method} ${url}`);
    }));
    await deleteAttachment(ID, 'old');
    expect(current().data!.title).toBe('Depois');
    expect(current().data!.attachments).toEqual([]);
  });
});
