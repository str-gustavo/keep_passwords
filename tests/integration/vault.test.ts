import { describe, expect, it } from 'vitest';
import { useFreshDb } from '../helpers/db';
import { call, req, registerUser } from '../helpers/client';
import { GET as vault } from '@/app/api/vault/route';
import { GET as publicKey } from '@/app/api/users/public-key/route';
import { getDb, schema } from '@/server/db';
import { eq } from 'drizzle-orm';
import { resolveAccess } from '@/server/services/access';

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

  async function setup() {
    const [a, b, c, d, e] = [await registerUser('a@b.c'), await registerUser('b@b.c'), await registerUser('c@b.c'), await registerUser('d@b.c'), await registerUser('e@b.c')];
    const db = await getDb();
    const [rec] = await db.insert(schema.records).values({ ownerId: a.userId, type: 'login', encData: 'x' }).returning();
    const [f] = await db.insert(schema.folders).values({ kind: 'shared', ownerId: a.userId, encName: 'n' }).returning();
    const member = (u: { userId: string }, role: 'owner' | 'admin' | 'editor' | 'viewer') =>
      db.insert(schema.folderMembers).values({ folderId: f!.id, userId: u.userId, encKey: 'fk', keyType: 'rsa', role });
    await member(a, 'owner'); await member(b, 'viewer'); await member(d, 'editor'); await member(e, 'admin');
    await db.insert(schema.folderRecords).values({ folderId: f!.id, recordId: rec!.id, encKey: 'rk' });
    await db.insert(schema.recordKeys).values({ recordId: rec!.id, userId: a.userId, encKey: 'k', keyType: 'data', permission: 'owner' });
    await db.insert(schema.recordKeys).values({ recordId: rec!.id, userId: c.userId, encKey: 'k', keyType: 'rsa', permission: 'view' });
    await db.insert(schema.recordKeys).values({ recordId: rec!.id, userId: d.userId, encKey: 'k', keyType: 'rsa', permission: 'view' });
    return { a, b, c, d, e, db, rec: rec!, f: f! };
  }
  const load = async (u: { cookie: string }) => (await call(vault, req('GET', '/api/vault', { cookie: u.cookie }))).data.records as { id: string; deletedAt: string | null; access: { permission: string; canShare: boolean }; keys: unknown[] }[];

  it('hides trashed records from non-owners and denies access via resolveAccess', async () => {
    const { a, b, c, db, rec } = await setup();
    await db.update(schema.records).set({ deletedAt: new Date() }).where(eq(schema.records.id, rec.id));
    expect((await load(b)).map((x) => x.id)).not.toContain(rec.id);
    expect((await load(c)).map((x) => x.id)).not.toContain(rec.id);
    const mine = (await load(a)).find((x) => x.id === rec.id);
    expect(mine?.deletedAt).not.toBeNull();
    expect((await resolveAccess(db, b.userId, rec.id)).permission).toBeNull();
    expect((await resolveAccess(db, c.userId, rec.id)).permission).toBeNull();
    expect((await resolveAccess(db, a.userId, rec.id)).permission).toBe('owner');
  });

  it('combines direct permission and folder roles into the effective permission', async () => {
    const { a, d, e, db, rec } = await setup();
    const pick = async (u: { cookie: string }) => (await load(u)).find((x) => x.id === rec.id)!;
    const rd = await pick(d);
    expect(rd.access).toMatchObject({ permission: 'edit', canShare: false });
    expect(rd.keys).toHaveLength(2);
    expect((await pick(e)).access).toMatchObject({ permission: 'edit', canShare: true });
    const ra = await pick(a);
    expect(ra.access).toMatchObject({ permission: 'owner', canShare: true });
    expect(ra.keys).toHaveLength(2);
    expect((await resolveAccess(db, d.userId, rec.id)).permission).toBe('edit');
  });

  it("does not purge another user's old trash when loading", async () => {
    const { a, b, db } = await setup();
    const [old] = await db.insert(schema.records).values({ ownerId: b.userId, type: 'login', encData: 'o', deletedAt: new Date(Date.now() - 31 * 86_400_000) }).returning();
    await load(a);
    expect(await db.query.records.findFirst({ where: eq(schema.records.id, old!.id) })).toBeDefined();
  });
});
