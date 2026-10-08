import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/server/db';
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

describe('records: permissions, edge cases and seeded access paths', () => {
  const rec = async () => {
    const a = await registerUser('a@b.c');
    const b = await registerUser('b@b.c');
    const made = await makeRecord(a.cookie, a.material.dataKey);
    return { a, b, ...made };
  };
  const share = async (recordId: string, userId: string, permission: 'view' | 'edit', encKey: string) => {
    const db = await getDb();
    await db.insert(schema.recordKeys).values({ recordId, userId, encKey, keyType: 'data', permission });
  };
  const blob = async (a: { material: { dataKey: CryptoKey } }) => wrapAesKey(a.material.dataKey, await generateAesKey());

  it('a view sharee gets 403 on update, trash, restore and purge', async () => {
    const { a, b, id, encData } = await rec();
    await share(id, b.userId, 'view', await blob(a));
    expect((await call(update, req('PUT', `/api/records/${id}`, { cookie: b.cookie, body: { encData } }), { id })).status).toBe(403);
    expect((await call(trash, req('DELETE', `/api/records/${id}`, { cookie: b.cookie }), { id })).status).toBe(403);
    expect((await call(restore, req('POST', `/api/records/${id}/restore`, { cookie: b.cookie }), { id })).status).toBe(403);
    expect((await call(purge, req('DELETE', `/api/records/${id}/purge`, { cookie: b.cookie }), { id })).status).toBe(403);
  });

  it('an edit sharee can update but not trash or purge', async () => {
    const { a, b, id, key } = await rec();
    await share(id, b.userId, 'edit', await blob(a));
    const newData = await encryptJson(key, { ...emptyRecordData('login'), title: 'Z' });
    expect((await call(update, req('PUT', `/api/records/${id}`, { cookie: b.cookie, body: { encData: newData } }), { id })).status).toBe(200);
    expect((await call(trash, req('DELETE', `/api/records/${id}`, { cookie: b.cookie }), { id })).status).toBe(403);
    expect((await call(purge, req('DELETE', `/api/records/${id}/purge`, { cookie: b.cookie }), { id })).status).toBe(403);
  });

  it('owner update on a trashed record returns 409 in_trash', async () => {
    const { a, id, encData } = await rec();
    await call(trash, req('DELETE', `/api/records/${id}`, { cookie: a.cookie }), { id });
    const r = await call(update, req('PUT', `/api/records/${id}`, { cookie: a.cookie, body: { encData } }), { id });
    expect(r.status).toBe(409);
    expect(r.data.error.code).toBe('in_trash');
  });

  it('folder-only access: update works, meta and rewrap return 409 no_direct_access', async () => {
    const { a, b, id, encData } = await rec();
    const db = await getDb();
    const [folder] = await db.insert(schema.folders).values({ kind: 'shared', ownerId: a.userId, encName: 'x' }).returning();
    await db.insert(schema.folderMembers).values({ folderId: folder!.id, userId: b.userId, encKey: await blob(a), keyType: 'data', role: 'editor' });
    await db.insert(schema.folderRecords).values({ folderId: folder!.id, recordId: id, encKey: await blob(a) });
    expect((await call(update, req('PUT', `/api/records/${id}`, { cookie: b.cookie, body: { encData } }), { id })).status).toBe(200);
    const m = await call(meta, req('PUT', `/api/records/${id}/meta`, { cookie: b.cookie, body: { favorite: true } }), { id });
    expect(m.status).toBe(409);
    expect(m.data.error.code).toBe('no_direct_access');
    const w = await call(rewrap, req('POST', `/api/records/${id}/rewrap`, { cookie: b.cookie, body: { encKey: await blob(a) } }), { id });
    expect(w.status).toBe(409);
    expect(w.data.error.code).toBe('no_direct_access');
  });

  it('create with own personal folder shows folderId in the vault; foreign folder is 404', async () => {
    const a = await registerUser('a@b.c');
    const b = await registerUser('b@b.c');
    const db = await getDb();
    const [mine] = await db.insert(schema.folders).values({ kind: 'personal', ownerId: a.userId, encName: 'x' }).returning();
    const [theirs] = await db.insert(schema.folders).values({ kind: 'personal', ownerId: b.userId, encName: 'x' }).returning();
    const key = await generateAesKey();
    const body = { type: 'login', encData: await encryptJson(key, emptyRecordData('login')), encKey: await wrapAesKey(a.material.dataKey, key) };
    const ok = await call(create, req('POST', '/api/records', { cookie: a.cookie, body: { ...body, folderId: mine!.id } }));
    expect(ok.status).toBe(201);
    const v = await call(vault, req('GET', '/api/vault', { cookie: a.cookie }));
    expect(v.data.records[0].access.folderId).toBe(mine!.id);
    const bad = await call(create, req('POST', '/api/records', { cookie: a.cookie, body: { ...body, folderId: theirs!.id } }));
    expect(bad.status).toBe(404);
  });

  it('a non-UUID id returns 404', async () => {
    const a = await registerUser('a@b.c');
    const r = await call(update, req('PUT', '/api/records/not-a-uuid', { cookie: a.cookie, body: { encData: 'AQID' } }), { id: 'not-a-uuid' });
    expect(r.status).toBe(404);
  });

  it('rewrap converts an rsa key row into a data key row', async () => {
    const { a, id, key } = await rec();
    const db = await getDb();
    await db.update(schema.recordKeys).set({ keyType: 'rsa', encKey: Buffer.concat([Buffer.from([1]), Buffer.alloc(255, 7)]).toString('base64') }).where(eq(schema.recordKeys.recordId, id));
    const other = await wrapAesKey(a.material.dataKey, key);
    expect((await call(rewrap, req('POST', `/api/records/${id}/rewrap`, { cookie: a.cookie, body: { encKey: other } }), { id })).status).toBe(200);
    const v = await call(vault, req('GET', '/api/vault', { cookie: a.cookie }));
    expect(v.data.records[0].keys).toEqual([{ via: 'data', encKey: other }]);
  });

  it('meta with an empty body is 400', async () => {
    const { a, id } = await rec();
    const r = await call(meta, req('PUT', `/api/records/${id}/meta`, { cookie: a.cookie, body: {} }), { id });
    expect(r.status).toBe(400);
  });

  it('create with plaintext-looking encKey but valid encData is 400 not_a_blob', async () => {
    const a = await registerUser('a@b.c');
    const key = await generateAesKey();
    const encData = await encryptJson(key, emptyRecordData('login'));
    const r = await call(create, req('POST', '/api/records', { cookie: a.cookie, body: { type: 'login', encData, encKey: Buffer.from('plain text key material, not a blob').toString('base64') } }));
    expect(r.status).toBe(400);
    expect(r.data.error.code).toBe('not_a_blob');
  });

  it('purge removes the record_keys rows', async () => {
    const { a, b, id } = await rec();
    await share(id, b.userId, 'view', await blob(a));
    await call(purge, req('DELETE', `/api/records/${id}/purge`, { cookie: a.cookie }), { id });
    const db = await getDb();
    expect(await db.select().from(schema.recordKeys).where(eq(schema.recordKeys.recordId, id))).toHaveLength(0);
  });
});
