import { describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '@/server/db';
import { useFreshDb } from '../helpers/db';
import { call, req, registerUser } from '../helpers/client';
import { POST as createFolder } from '@/app/api/folders/route';
import { PUT as renameFolder, DELETE as deleteFolder } from '@/app/api/folders/[id]/route';
import { GET as listMembers, POST as addMember } from '@/app/api/folders/[id]/members/route';
import { PUT as updateMember, DELETE as removeMember } from '@/app/api/folders/[id]/members/[userId]/route';
import { POST as addFolderRecord } from '@/app/api/folders/[id]/records/route';
import { DELETE as removeFolderRecord } from '@/app/api/folders/[id]/records/[recordId]/route';
import { POST as createRecord } from '@/app/api/records/route';
import { PUT as updateRecord } from '@/app/api/records/[id]/route';
import { PUT as meta } from '@/app/api/records/[id]/meta/route';
import { GET as vault } from '@/app/api/vault/route';
import { encryptJson, encryptString, generateAesKey, wrapAesKey } from '@/lib/crypto/aes';
import { importPublicKey, rsaWrapAesKey } from '@/lib/crypto/rsa';
import { emptyRecordData } from '@/lib/record-types/record-data';

useFreshDb();

async function record(cookie: string, dataKey: CryptoKey) {
  const key = await generateAesKey();
  const encData = await encryptJson(key, { ...emptyRecordData('login'), title: 'R' });
  const r = await call(createRecord, req('POST', '/api/records', { cookie, body: { type: 'login', encData, encKey: await wrapAesKey(dataKey, key) } }));
  return { id: r.data.record.id as string, key, encData };
}

describe('personal folders', () => {
  it('creates nested folders, renames, moves records, deletes (records go to root)', async () => {
    const a = await registerUser('a@b.c');
    const encName = await encryptString(a.material.dataKey, 'Trabalho');
    const f = await call(createFolder, req('POST', '/api/folders', { cookie: a.cookie, body: { kind: 'personal', encName } }));
    expect(f.status).toBe(201);
    const fid = f.data.folder.id as string;
    const child = await call(createFolder, req('POST', '/api/folders', { cookie: a.cookie, body: { kind: 'personal', encName, parentId: fid } }));
    expect(child.status).toBe(201);
    const { id: rid } = await record(a.cookie, a.material.dataKey);
    expect((await call(meta, req('PUT', `/api/records/${rid}/meta`, { cookie: a.cookie, body: { folderId: child.data.folder.id } }), { id: rid })).status).toBe(200);
    expect((await call(renameFolder, req('PUT', `/api/folders/${fid}`, { cookie: a.cookie, body: { encName: await encryptString(a.material.dataKey, 'Casa') } }), { id: fid })).status).toBe(200);
    const b = await registerUser('b@b.c');
    expect((await call(deleteFolder, req('DELETE', `/api/folders/${fid}`, { cookie: b.cookie }), { id: fid })).status).toBe(404);
    expect((await call(deleteFolder, req('DELETE', `/api/folders/${child.data.folder.id}`, { cookie: a.cookie }), { id: child.data.folder.id })).status).toBe(200);
    const v = await call(vault, req('GET', '/api/vault', { cookie: a.cookie }));
    expect(v.data.folders).toHaveLength(1);
    expect(v.data.records[0].access.folderId).toBeNull();
  });
});

describe('shared folders', () => {
  it('owner creates, adds viewer B and editor C; roles drive permissions; member can leave', async () => {
    const a = await registerUser('a@b.c');
    const b = await registerUser('b@b.c');
    const c = await registerUser('c@b.c');
    const folderKey = await generateAesKey();
    const f = await call(createFolder, req('POST', '/api/folders', { cookie: a.cookie, body: { kind: 'shared', encName: await encryptString(folderKey, 'Equipe'), encKey: await wrapAesKey(a.material.dataKey, folderKey) } }));
    expect(f.status).toBe(201);
    const fid = f.data.folder.id as string;
    expect((await call(createFolder, req('POST', '/api/folders', { cookie: a.cookie, body: { kind: 'shared', encName: 'x' } }))).status).toBe(400);

    const bKey = await rsaWrapAesKey(await importPublicKey(b.material.publicKey), folderKey);
    const cKey = await rsaWrapAesKey(await importPublicKey(c.material.publicKey), folderKey);
    expect((await call(addMember, req('POST', `/api/folders/${fid}/members`, { cookie: a.cookie, body: { userId: b.userId, encKey: bKey, role: 'viewer' } }), { id: fid })).status).toBe(201);
    expect((await call(addMember, req('POST', `/api/folders/${fid}/members`, { cookie: b.cookie, body: { userId: c.userId, encKey: cKey, role: 'viewer' } }), { id: fid })).status).toBe(403);
    expect((await call(addMember, req('POST', `/api/folders/${fid}/members`, { cookie: a.cookie, body: { userId: c.userId, encKey: cKey, role: 'editor' } }), { id: fid })).status).toBe(201);

    const { id: rid, key, encData } = await record(a.cookie, a.material.dataKey);
    const linkKey = await wrapAesKey(folderKey, key);
    expect((await call(addFolderRecord, req('POST', `/api/folders/${fid}/records`, { cookie: b.cookie, body: { recordId: rid, encKey: linkKey } }), { id: fid })).status).toBe(403);
    expect((await call(addFolderRecord, req('POST', `/api/folders/${fid}/records`, { cookie: c.cookie, body: { recordId: rid, encKey: linkKey } }), { id: fid })).status).toBe(404); // C cannot see the record
    expect((await call(addFolderRecord, req('POST', `/api/folders/${fid}/records`, { cookie: a.cookie, body: { recordId: rid, encKey: linkKey } }), { id: fid })).status).toBe(201);

    const vb = await call(vault, req('GET', '/api/vault', { cookie: b.cookie }));
    expect(vb.data.folders[0]).toMatchObject({ id: fid, kind: 'shared', role: 'viewer', encKey: bKey, keyType: 'rsa' });
    expect(vb.data.records[0]).toMatchObject({ id: rid, access: { permission: 'view', canShare: false }, keys: [{ via: 'folder', encKey: linkKey, folderId: fid }], sharedFolderIds: [fid] });
    expect((await call(updateRecord, req('PUT', `/api/records/${rid}`, { cookie: b.cookie, body: { encData } }), { id: rid })).status).toBe(403);
    expect((await call(updateRecord, req('PUT', `/api/records/${rid}`, { cookie: c.cookie, body: { encData } }), { id: rid })).status).toBe(200);

    expect((await call(updateMember, req('PUT', `/api/folders/${fid}/members/${b.userId}`, { cookie: a.cookie, body: { role: 'admin' } }), { id: fid, userId: b.userId })).status).toBe(200);
    expect((await call(updateMember, req('PUT', `/api/folders/${fid}/members/${a.userId}`, { cookie: b.cookie, body: { role: 'viewer' } }), { id: fid, userId: a.userId })).status).toBe(400);
    const members = await call(listMembers, req('GET', `/api/folders/${fid}/members`, { cookie: b.cookie }), { id: fid });
    expect(members.data.members.map((m: { email: string; role: string }) => `${m.email}:${m.role}`).sort()).toEqual(['a@b.c:owner', 'b@b.c:admin', 'c@b.c:editor']);

    expect((await call(removeFolderRecord, req('DELETE', `/api/folders/${fid}/records/${rid}`, { cookie: c.cookie }), { id: fid, recordId: rid })).status).toBe(200);
    expect((await call(vault, req('GET', '/api/vault', { cookie: c.cookie }))).data.records).toHaveLength(0);
    expect((await call(removeMember, req('DELETE', `/api/folders/${fid}/members/${c.userId}`, { cookie: c.cookie }), { id: fid, userId: c.userId })).status).toBe(200);
    expect((await call(removeMember, req('DELETE', `/api/folders/${fid}/members/${a.userId}`, { cookie: b.cookie }), { id: fid, userId: a.userId })).status).toBe(400);
    expect((await call(deleteFolder, req('DELETE', `/api/folders/${fid}`, { cookie: b.cookie }), { id: fid })).status).toBe(403);
    expect((await call(deleteFolder, req('DELETE', `/api/folders/${fid}`, { cookie: a.cookie }), { id: fid })).status).toBe(200);
    expect((await call(vault, req('GET', '/api/vault', { cookie: a.cookie }))).data.records).toHaveLength(1); // record still owned by A
  });
});

describe('folder cycles', () => {
  it('rejects moving a folder under its own descendant', async () => {
    const a = await registerUser('a@b.c');
    const encName = await encryptString(a.material.dataKey, 'P');
    const mk = async (parentId?: string) => (await call(createFolder, req('POST', '/api/folders', { cookie: a.cookie, body: { kind: 'personal', encName, parentId } }))).data.folder.id as string;
    const p = await mk(); const c = await mk(p); const g = await mk(c);
    const r = await call(renameFolder, req('PUT', `/api/folders/${p}`, { cookie: a.cookie, body: { encName, parentId: g } }), { id: p });
    expect(r.status).toBe(400);
    expect((await call(renameFolder, req('PUT', `/api/folders/${g}`, { cookie: a.cookie, body: { encName, parentId: p } }), { id: g })).status).toBe(200);
  });
});

describe('folder edge cases', () => {
  async function setup() {
    const a = await registerUser('a@b.c');
    const b = await registerUser('b@b.c');
    const c = await registerUser('c@b.c');
    const folderKey = await generateAesKey();
    const f = await call(createFolder, req('POST', '/api/folders', { cookie: a.cookie, body: { kind: 'shared', encName: await encryptString(folderKey, 'Eq'), encKey: await wrapAesKey(a.material.dataKey, folderKey) } }));
    const fid = f.data.folder.id as string;
    const wrap = async (u: typeof b) => rsaWrapAesKey(await importPublicKey(u.material.publicKey), folderKey);
    const add = (u: typeof b, role: string, key?: string) => async () => call(addMember, req('POST', `/api/folders/${fid}/members`, { cookie: a.cookie, body: { userId: u.userId, encKey: key ?? await wrap(u), role } }), { id: fid });
    return { a, b, c, folderKey, fid, wrap, add };
  }

  it('personal delete re-parents children and sends records to root', async () => {
    const a = await registerUser('a@b.c');
    const encName = await encryptString(a.material.dataKey, 'P');
    const mk = async (parentId?: string) => (await call(createFolder, req('POST', '/api/folders', { cookie: a.cookie, body: { kind: 'personal', encName, parentId } }))).data.folder.id as string;
    const p = await mk(); const m = await mk(p); const ch = await mk(m);
    const { id: rid } = await record(a.cookie, a.material.dataKey);
    await call(meta, req('PUT', `/api/records/${rid}/meta`, { cookie: a.cookie, body: { folderId: m } }), { id: rid });
    expect((await call(deleteFolder, req('DELETE', `/api/folders/${m}`, { cookie: a.cookie }), { id: m })).status).toBe(200);
    const v = await call(vault, req('GET', '/api/vault', { cookie: a.cookie }));
    expect(v.data.folders.find((x: { id: string }) => x.id === ch).parentId).toBe(p);
    expect(v.data.records[0].access.folderId).toBeNull();
  });

  it('role gates, link rules and validation', async () => {
    const { a, b, c, folderKey, fid, wrap, add } = await setup();
    expect((await add(b, 'viewer')()).status).toBe(201);
    expect((await add(c, 'editor')()).status).toBe(201);
    const { id: rid, key } = await record(a.cookie, a.material.dataKey);
    const linkKey = await wrapAesKey(folderKey, key);
    expect((await call(addFolderRecord, req('POST', `/api/folders/${fid}/records`, { cookie: a.cookie, body: { recordId: rid, encKey: linkKey } }), { id: fid })).status).toBe(201);
    expect((await call(addFolderRecord, req('POST', `/api/folders/${fid}/records`, { cookie: a.cookie, body: { recordId: rid, encKey: linkKey } }), { id: fid })).status).toBe(409);
    expect((await add(b, 'viewer')()).status).toBe(409);
    expect((await call(removeFolderRecord, req('DELETE', `/api/folders/${fid}/records/${rid}`, { cookie: b.cookie }), { id: fid, recordId: rid })).status).toBe(403);
    expect((await call(addMember, req('POST', `/api/folders/${fid}/members`, { cookie: c.cookie, body: { userId: b.userId, encKey: await wrap(b), role: 'viewer' } }), { id: fid })).status).toBe(403);
    expect((await call(updateMember, req('PUT', `/api/folders/${fid}/members/${b.userId}`, { cookie: c.cookie, body: { role: 'editor' } }), { id: fid, userId: b.userId })).status).toBe(403);
    expect((await call(removeMember, req('DELETE', `/api/folders/${fid}/members/${b.userId}`, { cookie: c.cookie }), { id: fid, userId: b.userId })).status).toBe(403);
    expect((await call(renameFolder, req('PUT', `/api/folders/${fid}`, { cookie: c.cookie, body: { encName: await encryptString(folderKey, 'N') } }), { id: fid })).status).toBe(403);
    expect((await call(renameFolder, req('PUT', `/api/folders/${fid}`, { cookie: a.cookie, body: { encName: await encryptString(folderKey, 'N'), parentId: crypto.randomUUID() } }), { id: fid })).status).toBe(400);
    expect((await call(removeMember, req('DELETE', `/api/folders/${fid}/members/${a.userId}`, { cookie: a.cookie }), { id: fid, userId: a.userId })).status).toBe(400);
    const d = await registerUser('d@b.c');
    expect((await call(listMembers, req('GET', `/api/folders/${fid}/members`, { cookie: d.cookie }), { id: fid })).status).toBe(404);
    expect((await add(d, 'viewer', Buffer.alloc(32, 1).toString('base64'))()).status).toBe(400);
    const other = await registerUser('e@b.c');
    const pf = await call(createFolder, req('POST', '/api/folders', { cookie: other.cookie, body: { kind: 'personal', encName: await encryptString(other.material.dataKey, 'X') } }));
    expect((await call(createFolder, req('POST', '/api/folders', { cookie: a.cookie, body: { kind: 'personal', encName: await encryptString(a.material.dataKey, 'Y'), parentId: pf.data.folder.id } }))).status).toBe(404);
  });

  it('linking requires edit and canShare on the record', async () => {
    const { a, c, folderKey, fid, add } = await setup();
    expect((await add(c, 'editor')()).status).toBe(201);
    const { id: rid, key } = await record(a.cookie, a.material.dataKey);
    const linkKey = await wrapAesKey(folderKey, key);
    const db = await getDb();
    const grant = async (permission: 'view' | 'edit', canShare: boolean) => {
      await db.delete(schema.recordKeys).where(and(eq(schema.recordKeys.recordId, rid), eq(schema.recordKeys.userId, c.userId)));
      await db.insert(schema.recordKeys).values({ recordId: rid, userId: c.userId, encKey: linkKey, keyType: 'rsa', permission, canShare });
    };
    const link = () => call(addFolderRecord, req('POST', `/api/folders/${fid}/records`, { cookie: c.cookie, body: { recordId: rid, encKey: linkKey } }), { id: fid });
    await grant('view', true);
    expect((await link()).status).toBe(403);
    await grant('edit', false);
    expect((await link()).status).toBe(403);
    await grant('edit', true);
    expect((await link()).status).toBe(201);
  });
});
