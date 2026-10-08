import { describe, expect, it } from 'vitest';
import { useFreshDb } from '../helpers/db';
import { call, req, registerUser } from '../helpers/client';
import { GET as vault } from '@/app/api/vault/route';
import { GET as publicKey } from '@/app/api/users/public-key/route';
import { getDb, schema } from '@/server/db';
import { eq } from 'drizzle-orm';

useFreshDb();

describe('vault', () => {
  it('returns the public key of a registered user and 404 otherwise', async () => {
    const a = await registerUser('a@b.c');
    const b = await registerUser('b@b.c');
    const r = await call(publicKey, req('GET', '/api/users/public-key?email=B@b.c', { cookie: a.cookie }));
    expect(r.status).toBe(200);
    expect(r.data).toEqual({ userId: b.userId, email: 'b@b.c', name: 'Teste', publicKey: b.material.publicKey });
    expect((await call(publicKey, req('GET', '/api/users/public-key?email=zz@b.c', { cookie: a.cookie }))).status).toBe(404);
    expect((await call(publicKey, req('GET', '/api/users/public-key?email=b@b.c'))).status).toBe(401);
  });

  it('returns an empty vault for a new user', async () => {
    const a = await registerUser('a@b.c');
    const r = await call(vault, req('GET', '/api/vault', { cookie: a.cookie }));
    expect(r.status).toBe(200);
    expect(r.data).toEqual({ records: [], folders: [] });
  });

  it('lists owned records with data key path and purges trash older than 30 days', async () => {
    const a = await registerUser('a@b.c');
    const db = await getDb();
    const [fresh] = await db.insert(schema.records).values({ ownerId: a.userId, type: 'login', encData: 'enc1' }).returning();
    const [old] = await db.insert(schema.records).values({ ownerId: a.userId, type: 'login', encData: 'enc2', deletedAt: new Date(Date.now() - 31 * 86_400_000) }).returning();
    const [recent] = await db.insert(schema.records).values({ ownerId: a.userId, type: 'login', encData: 'enc3', deletedAt: new Date(Date.now() - 86_400_000) }).returning();
    for (const r of [fresh, old, recent]) await db.insert(schema.recordKeys).values({ recordId: r!.id, userId: a.userId, encKey: 'k', keyType: 'data', permission: 'owner', favorite: r === fresh });
    const r = await call(vault, req('GET', '/api/vault', { cookie: a.cookie }));
    const ids = r.data.records.map((x: { id: string }) => x.id).sort();
    expect(ids).toEqual([fresh!.id, recent!.id].sort());
    const f = r.data.records.find((x: { id: string }) => x.id === fresh!.id);
    expect(f).toMatchObject({ type: 'login', encData: 'enc1', ownerId: a.userId, ownerEmail: 'a@b.c', deletedAt: null, access: { permission: 'owner', canShare: true, favorite: true, folderId: null }, keys: [{ via: 'data', encKey: 'k' }], sharedFolderIds: [] });
    expect(await db.query.records.findFirst({ where: eq(schema.records.id, old!.id) })).toBeUndefined();
  });
});
