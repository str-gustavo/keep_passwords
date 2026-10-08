import { and, eq } from 'drizzle-orm';
import { ApiError } from '@/server/http';
import { getDb, schema } from '@/server/db';
import type { FolderRole, MemberDto } from '@/lib/api/types';
import { assertPermission, resolveAccess } from './access';
import { assertBlob, assertOwnPersonalFolder } from './records';

const RANK: Record<FolderRole, number> = { viewer: 1, editor: 2, admin: 3, owner: 4 };

async function folderRole(userId: string, folderId: string) {
  const db = await getDb();
  const folder = await db.query.folders.findFirst({ where: eq(schema.folders.id, folderId) });
  if (!folder) throw new ApiError(404, 'folder_not_found', 'Pasta não encontrada');
  if (folder.kind === 'personal') {
    if (folder.ownerId !== userId) throw new ApiError(404, 'folder_not_found', 'Pasta não encontrada');
    return { db, folder, role: 'owner' as FolderRole };
  }
  const m = await db.query.folderMembers.findFirst({ where: and(eq(schema.folderMembers.folderId, folderId), eq(schema.folderMembers.userId, userId)) });
  if (!m) throw new ApiError(404, 'folder_not_found', 'Pasta não encontrada');
  return { db, folder, role: m.role as FolderRole };
}
function requireRole(role: FolderRole, needed: FolderRole) {
  if (RANK[role] < RANK[needed]) throw new ApiError(403, 'forbidden', 'Você não tem permissão nesta pasta');
}

export async function createFolder(userId: string, i: { kind: 'personal' | 'shared'; encName: string; parentId?: string | null; encKey?: string | null }) {
  assertBlob(i.encName, 'encName');
  const db = await getDb();
  if (i.kind === 'personal') {
    if (i.parentId) await assertOwnPersonalFolder(userId, i.parentId);
    const [f] = await db.insert(schema.folders).values({ kind: 'personal', ownerId: userId, parentId: i.parentId ?? null, encName: i.encName }).returning();
    return f!;
  }
  if (!i.encKey) throw new ApiError(400, 'validation', 'Pasta compartilhada exige encKey');
  assertBlob(i.encKey, 'encKey');
  return db.transaction(async (tx) => {
    const [f] = await tx.insert(schema.folders).values({ kind: 'shared', ownerId: userId, encName: i.encName }).returning();
    await tx.insert(schema.folderMembers).values({ folderId: f!.id, userId, encKey: i.encKey!, keyType: 'data', role: 'owner' });
    return f!;
  });
}

export async function renameFolder(userId: string, id: string, i: { encName: string; parentId?: string | null }) {
  assertBlob(i.encName, 'encName');
  const { db, folder, role } = await folderRole(userId, id);
  requireRole(role, folder.kind === 'shared' ? 'admin' : 'owner');
  if (folder.kind === 'personal' && i.parentId) {
    await assertOwnPersonalFolder(userId, i.parentId);
    let cur: string | null = i.parentId;
    for (let depth = 0; cur && depth < 1000; depth++) {
      if (cur === id) throw new ApiError(400, 'validation', 'Pasta não pode ser filha dela mesma');
      const row: { parentId: string | null } | undefined = await db.query.folders.findFirst({ where: eq(schema.folders.id, cur), columns: { parentId: true } });
      cur = row?.parentId ?? null;
    }
  }
  await db.update(schema.folders).set({ encName: i.encName, ...(folder.kind === 'personal' && i.parentId !== undefined ? { parentId: i.parentId } : {}), updatedAt: new Date() }).where(eq(schema.folders.id, id));
}

export async function deleteFolder(userId: string, id: string) {
  const { db, folder, role } = await folderRole(userId, id);
  requireRole(role, 'owner');
  await db.transaction(async (tx) => {
    if (folder.kind === 'personal') {
      await tx.update(schema.recordKeys).set({ folderId: null }).where(and(eq(schema.recordKeys.folderId, id), eq(schema.recordKeys.userId, userId)));
      await tx.update(schema.folders).set({ parentId: folder.parentId }).where(eq(schema.folders.parentId, id));
    }
    await tx.delete(schema.folders).where(eq(schema.folders.id, id));
  });
}

export async function listMembers(userId: string, id: string): Promise<MemberDto[]> {
  const { db, folder } = await folderRole(userId, id);
  if (folder.kind !== 'shared') throw new ApiError(400, 'validation', 'Pasta pessoal não tem membros');
  const rows = await db.select({ m: schema.folderMembers, u: schema.users }).from(schema.folderMembers).innerJoin(schema.users, eq(schema.users.id, schema.folderMembers.userId)).where(eq(schema.folderMembers.folderId, id));
  return rows.map(({ m, u }) => ({ userId: u.id, email: u.email, name: u.name, role: m.role as FolderRole }));
}

export async function addMember(userId: string, id: string, i: { userId: string; encKey: string; role: 'admin' | 'editor' | 'viewer' }) {
  const { db, folder, role } = await folderRole(userId, id);
  if (folder.kind !== 'shared') throw new ApiError(400, 'validation', 'Pasta pessoal não tem membros');
  requireRole(role, 'admin');
  if (!(await db.query.users.findFirst({ where: eq(schema.users.id, i.userId) }))) throw new ApiError(404, 'user_not_found', 'Nenhuma conta com este e-mail');
  if (await db.query.folderMembers.findFirst({ where: and(eq(schema.folderMembers.folderId, id), eq(schema.folderMembers.userId, i.userId)) })) throw new ApiError(409, 'already_member', 'Usuário já é membro');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(i.encKey) || Buffer.from(i.encKey, 'base64').length !== 256) throw new ApiError(400, 'not_a_blob', 'encKey deve ser cifrada com RSA-OAEP 2048');
  await db.insert(schema.folderMembers).values({ folderId: id, userId: i.userId, encKey: i.encKey, keyType: 'rsa', role: i.role });
}

export async function updateMember(userId: string, id: string, targetId: string, i: { role: 'admin' | 'editor' | 'viewer' }) {
  const { db, folder, role } = await folderRole(userId, id);
  requireRole(role, 'admin');
  if (targetId === folder.ownerId) throw new ApiError(400, 'invalid_target', 'Não é possível alterar o dono');
  const res = await db.update(schema.folderMembers).set({ role: i.role }).where(and(eq(schema.folderMembers.folderId, id), eq(schema.folderMembers.userId, targetId))).returning();
  if (res.length === 0) throw new ApiError(404, 'not_found', 'Membro não encontrado');
}

export async function removeMember(userId: string, id: string, targetId: string) {
  const { db, folder, role } = await folderRole(userId, id);
  if (targetId === folder.ownerId) throw new ApiError(400, 'invalid_target', 'O dono não pode ser removido');
  if (targetId !== userId) requireRole(role, 'admin');
  const res = await db.delete(schema.folderMembers).where(and(eq(schema.folderMembers.folderId, id), eq(schema.folderMembers.userId, targetId))).returning();
  if (res.length === 0) throw new ApiError(404, 'not_found', 'Membro não encontrado');
}

export async function addFolderRecord(userId: string, id: string, i: { recordId: string; encKey: string }) {
  assertBlob(i.encKey, 'encKey');
  const { db, folder, role } = await folderRole(userId, id);
  if (folder.kind !== 'shared') throw new ApiError(400, 'validation', 'Use /records/:id/meta para pastas pessoais');
  requireRole(role, 'editor');
  const a = await resolveAccess(db, userId, i.recordId);
  assertPermission(a, 'edit');
  if (await db.query.folderRecords.findFirst({ where: and(eq(schema.folderRecords.folderId, id), eq(schema.folderRecords.recordId, i.recordId)) })) throw new ApiError(409, 'already_in_folder', 'Registro já está na pasta');
  await db.insert(schema.folderRecords).values({ folderId: id, recordId: i.recordId, encKey: i.encKey });
}

export async function removeFolderRecord(userId: string, id: string, recordId: string) {
  const { db, role } = await folderRole(userId, id);
  requireRole(role, 'editor');
  const res = await db.delete(schema.folderRecords).where(and(eq(schema.folderRecords.folderId, id), eq(schema.folderRecords.recordId, recordId))).returning();
  if (res.length === 0) throw new ApiError(404, 'not_found', 'Registro não está na pasta');
}
