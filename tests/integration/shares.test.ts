import { describe, expect, it } from 'vitest';
import { useFreshDb } from '../helpers/db';
import { call, req, registerUser } from '../helpers/client';
import { POST as create } from '@/app/api/records/route';
import { PUT as update, DELETE as trash } from '@/app/api/records/[id]/route';
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
  const c = await registerUser('c@b.c');
  const cKey = await rsaWrapAesKey(await importPublicKey(c.material.publicKey), key);
  return { a, b, c, id, rsaKey, cKey, key };
}

type U = Awaited<ReturnType<typeof registerUser>>;
const share = (id: string, by: U, to: U, encKey: string, permission: 'view' | 'edit', canShare: boolean) =>
  call(addShare, req('POST', `/api/records/${id}/shares`, { cookie: by.cookie, body: { userId: to.userId, encKey, permission, canShare } }), { id });
const upd = (id: string, by: U, target: string, permission: 'view' | 'edit', canShare: boolean) =>
  call(updateShare, req('PUT', `/api/records/${id}/shares/${target}`, { cookie: by.cookie, body: { permission, canShare } }), { id, userId: target });
const rem = (id: string, by: U, target: string) =>
  call(removeShare, req('DELETE', `/api/records/${id}/shares/${target}`, { cookie: by.cookie }), { id, userId: target });

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
    const { id, c } = await setup();
    expect((await call(listShares, req('GET', `/api/records/${id}/shares`, { cookie: c.cookie }), { id })).status).toBe(404);
  });
});

describe('shares hardening', () => {
  it('view+canShare delegate cannot escalate', async () => {
    const { a, b, c, id, rsaKey, cKey } = await setup();
    expect((await share(id, a, b, rsaKey, 'view', true)).status).toBe(201);
    expect((await upd(id, b, b.userId, 'edit', true)).status).toBe(403);
    expect((await share(id, b, c, cKey, 'edit', false)).status).toBe(403);
    expect((await share(id, b, c, cKey, 'view', false)).status).toBe(201);
  });
  it('view+canShare delegate cannot remove an edit share but can remove self', async () => {
    const { a, b, c, id, rsaKey, cKey } = await setup();
    await share(id, a, b, rsaKey, 'view', true);
    await share(id, a, c, cKey, 'edit', false);
    expect((await rem(id, b, c.userId)).status).toBe(403);
    expect((await upd(id, b, c.userId, 'view', false)).status).toBe(403);
    expect((await rem(id, b, b.userId)).status).toBe(200);
  });
  it('updateShare: 404 unknown target, 400 owner target', async () => {
    const { a, id } = await setup();
    const u = await registerUser('z@b.c');
    expect((await upd(id, a, u.userId, 'view', false)).status).toBe(404);
    expect((await upd(id, a, a.userId, 'view', false)).status).toBe(400);
  });
  it('delegate cannot re-share a trashed record', async () => {
    const { a, b, c, id, rsaKey, cKey } = await setup();
    await share(id, a, b, rsaKey, 'edit', true);
    expect((await call(trash, req('DELETE', `/api/records/${id}`, { cookie: a.cookie }), { id })).status).toBe(200);
    expect((await share(id, b, c, cKey, 'view', false)).status).toBe(404);
  });
  it('rejects malformed encKey', async () => {
    const { a, b, id } = await setup();
    const bad = await share(id, a, b, '!!!not-base64!!!', 'view', false);
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.data)).toContain('not_a_blob');
    const short = await share(id, a, b, Buffer.alloc(32, 1).toString('base64'), 'view', false);
    expect(short.status).toBe(400);
  });
  it('removeShare: stranger 404, non-canShare sharee 403', async () => {
    const { a, b, c, id, rsaKey, cKey } = await setup();
    await share(id, a, b, rsaKey, 'view', false);
    await share(id, a, c, cKey, 'view', false);
    const s = await registerUser('s@b.c');
    expect((await rem(id, s, b.userId)).status).toBe(404);
    expect((await rem(id, b, c.userId)).status).toBe(403);
  });
});
