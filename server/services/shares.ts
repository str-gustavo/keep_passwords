import { and, eq, ne } from 'drizzle-orm';
import { ApiError } from '@/server/http';
import { getDb, schema } from '@/server/db';
import type { Permission, ShareDto } from '@/lib/api/types';
import { resolveAccess } from './access';

async function requireShareRight(userId: string, recordId: string) {
  const db = await getDb();
  const a = await resolveAccess(db, userId, recordId);
  if (!a.permission) throw new ApiError(404, 'not_found', 'Registro não encontrado');
  if (!a.canShare) throw new ApiError(403, 'forbidden', 'Você não pode compartilhar este registro');
  return { db, a };
}

export async function listShares(userId: string, recordId: string): Promise<ShareDto[]> {
  const { db, a } = await requireShareRight(userId, recordId);
  const rows = await db.select({ k: schema.recordKeys, u: schema.users }).from(schema.recordKeys).innerJoin(schema.users, eq(schema.users.id, schema.recordKeys.userId))
    .where(and(eq(schema.recordKeys.recordId, recordId), ne(schema.recordKeys.userId, a.record.ownerId)));
  return rows.map(({ k, u }) => ({ userId: u.id, email: u.email, name: u.name, permission: k.permission as Permission, canShare: k.canShare }));
}

export async function addShare(userId: string, recordId: string, i: { userId: string; encKey: string; permission: 'view' | 'edit'; canShare: boolean }) {
  const { db, a } = await requireShareRight(userId, recordId);
  if (i.userId === a.record.ownerId) throw new ApiError(400, 'invalid_target', 'O dono já tem acesso');
  const target = await db.query.users.findFirst({ where: eq(schema.users.id, i.userId) });
  if (!target) throw new ApiError(404, 'user_not_found', 'Nenhuma conta com este e-mail');
  const existing = await db.query.recordKeys.findFirst({ where: and(eq(schema.recordKeys.recordId, recordId), eq(schema.recordKeys.userId, i.userId)) });
  if (existing) throw new ApiError(409, 'already_shared', 'Já compartilhado com este usuário');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(i.encKey) || Buffer.from(i.encKey, 'base64').length !== 256) throw new ApiError(400, 'not_a_blob', 'encKey deve ser cifrada com RSA-OAEP 2048');
  await db.insert(schema.recordKeys).values({ recordId, userId: i.userId, encKey: i.encKey, keyType: 'rsa', permission: i.permission, canShare: i.canShare });
}

export async function updateShare(userId: string, recordId: string, targetId: string, i: { permission: 'view' | 'edit'; canShare: boolean }) {
  const { db, a } = await requireShareRight(userId, recordId);
  if (targetId === a.record.ownerId) throw new ApiError(400, 'invalid_target', 'Não é possível alterar o dono');
  const res = await db.update(schema.recordKeys).set({ permission: i.permission, canShare: i.canShare }).where(and(eq(schema.recordKeys.recordId, recordId), eq(schema.recordKeys.userId, targetId))).returning();
  if (res.length === 0) throw new ApiError(404, 'not_found', 'Compartilhamento não encontrado');
}

export async function removeShare(userId: string, recordId: string, targetId: string) {
  const db = await getDb();
  const a = await resolveAccess(db, userId, recordId);
  if (!a.permission) throw new ApiError(404, 'not_found', 'Registro não encontrado');
  if (targetId === a.record.ownerId) throw new ApiError(400, 'invalid_target', 'Não é possível remover o dono');
  if (targetId !== userId && !a.canShare) throw new ApiError(403, 'forbidden', 'Você não pode alterar compartilhamentos');
  const res = await db.delete(schema.recordKeys).where(and(eq(schema.recordKeys.recordId, recordId), eq(schema.recordKeys.userId, targetId))).returning();
  if (res.length === 0) throw new ApiError(404, 'not_found', 'Compartilhamento não encontrado');
}
