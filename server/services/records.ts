import { and, eq } from 'drizzle-orm';
import { ApiError } from '@/server/http';
import { getDb, schema } from '@/server/db';
import { assertPermission, resolveAccess } from './access';

export function assertBlob(value: string, field: string): void {
  let bytes: Buffer;
  try { bytes = Buffer.from(value, 'base64'); } catch { throw new ApiError(400, 'not_a_blob', `${field} não é um blob cifrado`); }
  if (bytes.length < 1 + 12 + 16 || bytes[0] !== 0x01) throw new ApiError(400, 'not_a_blob', `${field} não é um blob cifrado`);
}

export async function createRecord(userId: string, i: { type: string; encData: string; encKey: string; folderId?: string | null }) {
  assertBlob(i.encData, 'encData'); assertBlob(i.encKey, 'encKey');
  const db = await getDb();
  if (i.folderId) await assertOwnPersonalFolder(userId, i.folderId);
  return db.transaction(async (tx) => {
    const [record] = await tx.insert(schema.records).values({ ownerId: userId, type: i.type, encData: i.encData }).returning();
    await tx.insert(schema.recordKeys).values({ recordId: record!.id, userId, encKey: i.encKey, keyType: 'data', permission: 'owner', canShare: true, folderId: i.folderId ?? null });
    return record!;
  });
}

export async function assertOwnPersonalFolder(userId: string, folderId: string) {
  const db = await getDb();
  const f = await db.query.folders.findFirst({ where: and(eq(schema.folders.id, folderId), eq(schema.folders.ownerId, userId), eq(schema.folders.kind, 'personal')) });
  if (!f) throw new ApiError(404, 'folder_not_found', 'Pasta não encontrada');
  return f;
}

export async function updateRecord(userId: string, id: string, encData: string) {
  assertBlob(encData, 'encData');
  const db = await getDb();
  const a = await resolveAccess(db, userId, id);
  assertPermission(a, 'edit');
  if (a.record.deletedAt) throw new ApiError(409, 'in_trash', 'Registro está na lixeira');
  const [r] = await db.update(schema.records).set({ encData, updatedAt: new Date() }).where(eq(schema.records.id, id)).returning();
  return r!;
}

async function ownerOnly(userId: string, id: string) {
  const db = await getDb();
  const a = await resolveAccess(db, userId, id);
  if (a.record.ownerId !== userId) throw new ApiError(a.permission ? 403 : 404, a.permission ? 'forbidden' : 'not_found', a.permission ? 'Somente o dono pode fazer isso' : 'Registro não encontrado');
  return { db, a };
}

export async function trashRecord(userId: string, id: string) {
  const { db } = await ownerOnly(userId, id);
  await db.update(schema.records).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(schema.records.id, id));
}
export async function restoreRecord(userId: string, id: string) {
  const { db } = await ownerOnly(userId, id);
  await db.update(schema.records).set({ deletedAt: null, updatedAt: new Date() }).where(eq(schema.records.id, id));
}
export async function purgeRecord(userId: string, id: string) {
  const { db } = await ownerOnly(userId, id);
  await db.delete(schema.records).where(eq(schema.records.id, id));
}

export async function setRecordMeta(userId: string, id: string, m: { favorite?: boolean; folderId?: string | null }) {
  const db = await getDb();
  const a = await resolveAccess(db, userId, id);
  assertPermission(a, 'view');
  if (m.folderId) await assertOwnPersonalFolder(userId, m.folderId);
  const patch = { ...(m.favorite !== undefined ? { favorite: m.favorite } : {}), ...(m.folderId !== undefined ? { folderId: m.folderId } : {}) };
  if (a.direct) {
    await db.update(schema.recordKeys).set(patch).where(and(eq(schema.recordKeys.recordId, id), eq(schema.recordKeys.userId, userId)));
  } else {
    throw new ApiError(409, 'no_direct_access', 'Registro acessível apenas por pasta compartilhada');
  }
}

export async function rewrapRecordKey(userId: string, id: string, encKey: string) {
  assertBlob(encKey, 'encKey');
  const db = await getDb();
  const a = await resolveAccess(db, userId, id);
  assertPermission(a, 'view');
  if (!a.direct) throw new ApiError(409, 'no_direct_access', 'Registro acessível apenas por pasta compartilhada');
  await db.update(schema.recordKeys).set({ encKey, keyType: 'data' }).where(and(eq(schema.recordKeys.recordId, id), eq(schema.recordKeys.userId, userId)));
}
