import { and, eq, inArray } from 'drizzle-orm';
import { ApiError } from '@/server/http';
import { schema, type Db } from '@/server/db';
import type { FolderRole, Permission } from '@/lib/api/types';

export type RecordKeyRow = typeof schema.recordKeys.$inferSelect;
export interface RecordAccess { record: schema.RecordRow; permission: Permission | null; canShare: boolean; direct: RecordKeyRow | null; folderRoles: { folderId: string; role: FolderRole }[] }

export const RANK: Record<Permission, number> = { view: 1, edit: 2, owner: 3 };
export const roleToPermission = (role: FolderRole): Permission => (role === 'viewer' ? 'view' : 'edit');
export const maxPermission = (a: Permission | null, b: Permission | null): Permission | null =>
  !a ? b : !b ? a : RANK[a] >= RANK[b] ? a : b;

export function computeAccess(i: {
  ownerId: string;
  deletedAt: Date | null;
  userId: string;
  direct: Pick<RecordKeyRow, 'permission' | 'canShare'> | null;
  folderRoles: { role: FolderRole }[];
}): { permission: Permission | null; canShare: boolean } {
  const isOwner = i.ownerId === i.userId;
  // trashed records are visible only to the owner
  if (i.deletedAt && !isOwner) return { permission: null, canShare: false };
  let permission: Permission | null = isOwner ? 'owner' : (i.direct?.permission ?? null);
  for (const fr of i.folderRoles) permission = maxPermission(permission, roleToPermission(fr.role));
  const canShare = isOwner || Boolean(i.direct?.canShare) || i.folderRoles.some((r) => r.role === 'admin' || r.role === 'owner');
  return { permission, canShare };
}

export async function resolveAccess(db: Db, userId: string, recordId: string): Promise<RecordAccess> {
  const record = await db.query.records.findFirst({ where: eq(schema.records.id, recordId) });
  if (!record) throw new ApiError(404, 'not_found', 'Registro não encontrado');
  const direct = (await db.query.recordKeys.findFirst({ where: and(eq(schema.recordKeys.recordId, recordId), eq(schema.recordKeys.userId, userId)) })) ?? null;
  const links = await db.select({ folderId: schema.folderRecords.folderId }).from(schema.folderRecords).where(eq(schema.folderRecords.recordId, recordId));
  const folderRoles: RecordAccess['folderRoles'] = links.length === 0 ? [] : (await db.select({ folderId: schema.folderMembers.folderId, role: schema.folderMembers.role })
    .from(schema.folderMembers)
    .where(and(eq(schema.folderMembers.userId, userId), inArray(schema.folderMembers.folderId, links.map((l) => l.folderId)))));
  const { permission, canShare } = computeAccess({ ownerId: record.ownerId, deletedAt: record.deletedAt, userId, direct, folderRoles });
  return { record, permission, canShare, direct, folderRoles };
}

export function assertPermission(a: RecordAccess, needed: Permission): void {
  if (!a.permission) throw new ApiError(404, 'not_found', 'Registro não encontrado');
  if (RANK[a.permission] < RANK[needed]) throw new ApiError(403, 'forbidden', 'Você não tem permissão para esta ação');
}
