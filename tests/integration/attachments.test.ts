import { describe, expect, it } from 'vitest';
import { useFreshDb } from '../helpers/db';
import { call, req, registerUser } from '../helpers/client';
import { POST as createRecord } from '@/app/api/records/route';
import { POST as upload } from '@/app/api/records/[id]/attachments/route';
import { GET as download, DELETE as remove } from '@/app/api/records/[id]/attachments/[aid]/route';
import { encryptBytes, encryptJson, generateAesKey, wrapAesKey } from '@/lib/crypto/aes';
import { emptyRecordData } from '@/lib/record-types/record-data';
import { getDb, schema } from '@/server/db';

useFreshDb();

async function setup() {
  const a = await registerUser('a@b.c');
  const b = await registerUser('b@b.c');
  const key = await generateAesKey();
  const created = await call(createRecord, req('POST', '/api/records', { cookie: a.cookie, body: { type: 'file', encData: await encryptJson(key, emptyRecordData('file')), encKey: await wrapAesKey(a.material.dataKey, key) } }));
  const id = created.data.record.id as string;
  return { a, b, key, id };
}
const dl = (id: string, aid: string, cookie: string) => download(req('GET', `/api/records/${id}/attachments/${aid}`, { cookie }), { params: Promise.resolve({ id, aid }) });

describe('attachments', () => {
  it('uploads, downloads, deletes and enforces the 4 MB limit and permissions', async () => {
    const { a, b, key, id } = await setup();

    const blob = await encryptBytes(key, new Uint8Array(1000).fill(7));
    const up = await call(upload, req('POST', `/api/records/${id}/attachments`, { cookie: a.cookie, raw: blob }), { id });
    expect(up.status).toBe(201);
    expect(up.data).toMatchObject({ id: expect.any(String), size: blob.length });
    const aid = up.data.id as string;

    const down = await dl(id, aid, a.cookie);
    expect(down.status).toBe(200);
    expect(new Uint8Array(await down.arrayBuffer())).toEqual(blob);
    expect((await dl(id, aid, b.cookie)).status).toBe(404);

    const tooBig = new Uint8Array(4 * 1024 * 1024 + 65); tooBig[0] = 0x01;
    expect((await call(upload, req('POST', `/api/records/${id}/attachments`, { cookie: a.cookie, raw: tooBig }), { id })).status).toBe(413);
    const notBlob = new Uint8Array(100);
    expect((await call(upload, req('POST', `/api/records/${id}/attachments`, { cookie: a.cookie, raw: notBlob }), { id })).status).toBe(400);

    expect((await call(remove, req('DELETE', `/api/records/${id}/attachments/${aid}`, { cookie: b.cookie }), { id, aid })).status).toBe(404);
    expect((await call(remove, req('DELETE', `/api/records/${id}/attachments/${aid}`, { cookie: a.cookie }), { id, aid })).status).toBe(200);
    expect((await dl(id, aid, a.cookie)).status).toBe(404);
  });

  it('accepts a ciphertext of exactly the maximum size', async () => {
    const { a, id } = await setup();
    const exact = new Uint8Array(4 * 1024 * 1024 + 64); exact[0] = 0x01;
    const r = await call(upload, req('POST', `/api/records/${id}/attachments`, { cookie: a.cookie, raw: exact }), { id });
    expect(r.status).toBe(201);
    expect(r.data.size).toBe(exact.length);
  });

  it('lets a view-only sharee download but not upload or delete', async () => {
    const { a, b, key, id } = await setup();
    const blob = await encryptBytes(key, new Uint8Array(50).fill(3));
    const up = await call(upload, req('POST', `/api/records/${id}/attachments`, { cookie: a.cookie, raw: blob }), { id });
    const aid = up.data.id as string;
    const db = await getDb();
    await db.insert(schema.recordKeys).values({ recordId: id, userId: b.userId, encKey: 'x', keyType: 'rsa', permission: 'view', canShare: false });

    const down = await dl(id, aid, b.cookie);
    expect(down.status).toBe(200);
    expect(new Uint8Array(await down.arrayBuffer())).toEqual(blob);
    expect((await call(upload, req('POST', `/api/records/${id}/attachments`, { cookie: b.cookie, raw: blob }), { id })).status).toBe(403);
    expect((await call(remove, req('DELETE', `/api/records/${id}/attachments/${aid}`, { cookie: b.cookie }), { id, aid })).status).toBe(403);
  });
});
