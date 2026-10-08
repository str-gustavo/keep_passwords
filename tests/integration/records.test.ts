import { describe, expect, it } from 'vitest';
import { useFreshDb } from '../helpers/db';
import { call, req, registerUser } from '../helpers/client';
import { POST as create } from '@/app/api/records/route';
import { PUT as update, DELETE as trash } from '@/app/api/records/[id]/route';
import { POST as restore } from '@/app/api/records/[id]/restore/route';
import { DELETE as purge } from '@/app/api/records/[id]/purge/route';
import { PUT as meta } from '@/app/api/records/[id]/meta/route';
import { POST as rewrap } from '@/app/api/records/[id]/rewrap/route';
import { GET as vault } from '@/app/api/vault/route';
import { encryptJson, generateAesKey, wrapAesKey } from '@/lib/crypto/aes';
import { emptyRecordData } from '@/lib/record-types/record-data';

useFreshDb();

async function makeRecord(cookie: string, dataKey: CryptoKey, title = 'X') {
  const key = await generateAesKey();
  const encData = await encryptJson(key, { ...emptyRecordData('login'), title });
  const encKey = await wrapAesKey(dataKey, key);
  const r = await call(create, req('POST', '/api/records', { cookie, body: { type: 'login', encData, encKey } }));
  expect(r.status).toBe(201);
  return { id: r.data.record.id as string, key, encData };
}

describe('records', () => {
  it('creates, updates and lists a record', async () => {
    const a = await registerUser('a@b.c');
    const { id, key } = await makeRecord(a.cookie, a.material.dataKey);
    const newData = await encryptJson(key, { ...emptyRecordData('login'), title: 'Y' });
    const u = await call(update, req('PUT', `/api/records/${id}`, { cookie: a.cookie, body: { encData: newData } }), { id });
    expect(u.status).toBe(200);
    const v = await call(vault, req('GET', '/api/vault', { cookie: a.cookie }));
    expect(v.data.records[0]).toMatchObject({ id, encData: newData, access: { permission: 'owner' } });
  });

  it('rejects plaintext-looking blobs with 400', async () => {
    const a = await registerUser('a@b.c');
    const r = await call(create, req('POST', '/api/records', { cookie: a.cookie, body: { type: 'login', encData: Buffer.from('{"title":"x"}').toString('base64'), encKey: 'AQID' } }));
    expect(r.status).toBe(400);
    expect(r.data.error.code).toBe('not_a_blob');
  });

  it('trash, restore and purge are owner-only; trashed records are hidden from others', async () => {
    const a = await registerUser('a@b.c');
    const b = await registerUser('b@b.c');
    const { id } = await makeRecord(a.cookie, a.material.dataKey);
    expect((await call(trash, req('DELETE', `/api/records/${id}`, { cookie: b.cookie }), { id })).status).toBe(404);
    expect((await call(trash, req('DELETE', `/api/records/${id}`, { cookie: a.cookie }), { id })).status).toBe(200);
    let v = await call(vault, req('GET', '/api/vault', { cookie: a.cookie }));
    expect(v.data.records[0].deletedAt).not.toBeNull();
    expect((await call(restore, req('POST', `/api/records/${id}/restore`, { cookie: a.cookie }), { id })).status).toBe(200);
    v = await call(vault, req('GET', '/api/vault', { cookie: a.cookie }));
    expect(v.data.records[0].deletedAt).toBeNull();
    expect((await call(purge, req('DELETE', `/api/records/${id}/purge`, { cookie: a.cookie }), { id })).status).toBe(200);
    v = await call(vault, req('GET', '/api/vault', { cookie: a.cookie }));
    expect(v.data.records).toHaveLength(0);
  });

  it('meta sets favorite and personal folder (own folder only)', async () => {
    const a = await registerUser('a@b.c');
    const { id } = await makeRecord(a.cookie, a.material.dataKey);
    const m = await call(meta, req('PUT', `/api/records/${id}/meta`, { cookie: a.cookie, body: { favorite: true } }), { id });
    expect(m.status).toBe(200);
    const v = await call(vault, req('GET', '/api/vault', { cookie: a.cookie }));
    expect(v.data.records[0].access.favorite).toBe(true);
    const bad = await call(meta, req('PUT', `/api/records/${id}/meta`, { cookie: a.cookie, body: { folderId: '00000000-0000-0000-0000-000000000000' } }), { id });
    expect(bad.status).toBe(404);
  });

  it('rewrap replaces an rsa key with a data key for the caller only', async () => {
    const a = await registerUser('a@b.c');
    const { id, key } = await makeRecord(a.cookie, a.material.dataKey);
    const other = await wrapAesKey(a.material.dataKey, key);
    const r = await call(rewrap, req('POST', `/api/records/${id}/rewrap`, { cookie: a.cookie, body: { encKey: other } }), { id });
    expect(r.status).toBe(200);
    const v = await call(vault, req('GET', '/api/vault', { cookie: a.cookie }));
    expect(v.data.records[0].keys).toEqual([{ via: 'data', encKey: other }]);
  });

  it('a non-owner without any key path gets 404 on update', async () => {
    const a = await registerUser('a@b.c');
    const b = await registerUser('b@b.c');
    const { id, encData } = await makeRecord(a.cookie, a.material.dataKey);
    expect((await call(update, req('PUT', `/api/records/${id}`, { cookie: b.cookie, body: { encData } }), { id })).status).toBe(404);
  });
});
