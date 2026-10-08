import { describe, expect, it } from 'vitest';
import { useFreshDb } from '../helpers/db';
import { call, req, registerUser } from '../helpers/client';
import { POST as create } from '@/app/api/records/route';
import { PUT as update } from '@/app/api/records/[id]/route';
import { GET as listShares, POST as addShare } from '@/app/api/records/[id]/shares/route';
import { PUT as updateShare, DELETE as removeShare } from '@/app/api/records/[id]/shares/[userId]/route';
import { GET as vault } from '@/app/api/vault/route';
import { encryptJson, generateAesKey, wrapAesKey, decryptJson } from '@/lib/crypto/aes';
import { importPublicKey, rsaUnwrapAesKey, rsaWrapAesKey } from '@/lib/crypto/rsa';
import { emptyRecordData } from '@/lib/record-types/record-data';

useFreshDb();

describe('shares', () => {
  it('owner shares with B (view), B decrypts via rsa, cannot edit, cannot re-share; upgrade to edit works', async () => {
    const a = await registerUser('a@b.c');
    const b = await registerUser('b@b.c');
    const c = await registerUser('c@b.c');
    const key = await generateAesKey();
    const encData = await encryptJson(key, { ...emptyRecordData('login'), title: 'Compartilhado' });
    const created = await call(create, req('POST', '/api/records', { cookie: a.cookie, body: { type: 'login', encData, encKey: await wrapAesKey(a.material.dataKey, key) } }));
    const id = created.data.record.id as string;

    const rsaKey = await rsaWrapAesKey(await importPublicKey(b.material.publicKey), key);
    const s = await call(addShare, req('POST', `/api/records/${id}/shares`, { cookie: a.cookie, body: { userId: b.userId, encKey: rsaKey, permission: 'view', canShare: false } }), { id });
    expect(s.status).toBe(201);
    expect((await call(addShare, req('POST', `/api/records/${id}/shares`, { cookie: a.cookie, body: { userId: b.userId, encKey: rsaKey, permission: 'view', canShare: false } }), { id })).status).toBe(409);

    const vb = await call(vault, req('GET', '/api/vault', { cookie: b.cookie }));
    const rec = vb.data.records[0];
    expect(rec).toMatchObject({ id, ownerEmail: 'a@b.c', access: { permission: 'view', canShare: false }, keys: [{ via: 'rsa', encKey: rsaKey }] });
    const unwrapped = await rsaUnwrapAesKey(b.material.privateKey, rec.keys[0].encKey);
    expect((await decryptJson<{ title: string }>(unwrapped, rec.encData)).title).toBe('Compartilhado');

    expect((await call(update, req('PUT', `/api/records/${id}`, { cookie: b.cookie, body: { encData } }), { id })).status).toBe(403);
    const cKey = await rsaWrapAesKey(await importPublicKey(c.material.publicKey), key);
    expect((await call(addShare, req('POST', `/api/records/${id}/shares`, { cookie: b.cookie, body: { userId: c.userId, encKey: cKey, permission: 'view', canShare: false } }), { id })).status).toBe(403);

    expect((await call(updateShare, req('PUT', `/api/records/${id}/shares/${b.userId}`, { cookie: a.cookie, body: { permission: 'edit', canShare: true } }), { id, userId: b.userId })).status).toBe(200);
    expect((await call(update, req('PUT', `/api/records/${id}`, { cookie: b.cookie, body: { encData } }), { id })).status).toBe(200);
    expect((await call(addShare, req('POST', `/api/records/${id}/shares`, { cookie: b.cookie, body: { userId: c.userId, encKey: cKey, permission: 'view', canShare: false } }), { id })).status).toBe(201);

    const list = await call(listShares, req('GET', `/api/records/${id}/shares`, { cookie: a.cookie }), { id });
    expect(list.data.shares.map((x: { email: string }) => x.email).sort()).toEqual(['b@b.c', 'c@b.c']);

    expect((await call(removeShare, req('DELETE', `/api/records/${id}/shares/${a.userId}`, { cookie: a.cookie }), { id, userId: a.userId })).status).toBe(400);
    expect((await call(removeShare, req('DELETE', `/api/records/${id}/shares/${c.userId}`, { cookie: c.cookie }), { id, userId: c.userId })).status).toBe(200);
    expect((await call(removeShare, req('DELETE', `/api/records/${id}/shares/${b.userId}`, { cookie: a.cookie }), { id, userId: b.userId })).status).toBe(200);
    expect((await call(vault, req('GET', '/api/vault', { cookie: b.cookie }))).data.records).toHaveLength(0);
  });
});

async function setup() {
  const a = await registerUser('a@b.c');
  const b = await registerUser('b@b.c');
  const key = await generateAesKey();
  const encData = await encryptJson(key, { ...emptyRecordData('login'), title: 'X' });
  const created = await call(create, req('POST', '/api/records', { cookie: a.cookie, body: { type: 'login', encData, encKey: await wrapAesKey(a.material.dataKey, key) } }));
  const id = created.data.record.id as string;
  const rsaKey = await rsaWrapAesKey(await importPublicKey(b.material.publicKey), key);
  return { a, b, id, rsaKey };
}

describe('shares extras', () => {
  it('direct-view sharee without canShare gets 403 on GET /shares', async () => {
    const { a, b, id, rsaKey } = await setup();
    await call(addShare, req('POST', `/api/records/${id}/shares`, { cookie: a.cookie, body: { userId: b.userId, encKey: rsaKey, permission: 'view', canShare: false } }), { id });
    expect((await call(listShares, req('GET', `/api/records/${id}/shares`, { cookie: b.cookie }), { id })).status).toBe(403);
  });
  it('sharing with a non-existent user returns 404 user_not_found', async () => {
    const { a, id, rsaKey } = await setup();
    const r = await call(addShare, req('POST', `/api/records/${id}/shares`, { cookie: a.cookie, body: { userId: '11111111-1111-4111-8111-111111111111', encKey: rsaKey, permission: 'view', canShare: false } }), { id });
    expect(r.status).toBe(404);
    expect(JSON.stringify(r.data)).toContain('user_not_found');
  });
  it('stranger gets 404 on GET /shares', async () => {
    const { id } = await setup();
    const c = await registerUser('c@b.c');
    expect((await call(listShares, req('GET', `/api/records/${id}/shares`, { cookie: c.cookie }), { id })).status).toBe(404);
  });
});
