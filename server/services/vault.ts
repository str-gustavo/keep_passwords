import { and, eq, inArray, isNotNull, lt } from 'drizzle-orm';
import { getDb, schema } from '@/server/db';
import type { FolderRole, KeySource, Permission, VaultFolderDto, VaultRecordDto, VaultResponse } from '@/lib/api/types';
import { maxPermission, roleToPermission } from './access';

export async function purgeExpiredTrash(ownerId: string): Promise<void> {
  const db = await getDb();
  await db.delete(schema.records).where(and(eq(schema.records.ownerId, ownerId), isNotNull(schema.records.deletedAt), lt(schema.records.deletedAt, new Date(Date.now() - 30 * 86_400_000))));
}

export async function loadVault(userId: string): Promise<VaultResponse> {
  await purgeExpiredTrash(userId);
  const db = await getDb();

  const memberships = await db.select().from(schema.folderMembers).where(eq(schema.folderMembers.userId, userId));
  const sharedIds = memberships.map((m) => m.folderId);
  const personal = await db.select().from(schema.folders).where(and(eq(schema.folders.ownerId, userId), eq(schema.folders.kind, 'personal')));
  const shared = sharedIds.length ? await db.select().from(schema.folders).where(inArray(schema.folders.id, sharedIds)) : [];
  const roleOf = new Map(memberships.map((m) => [m.folderId, m] as const));
  const folders: VaultFolderDto[] = [
    ...personal.map((f) => ({ id: f.id, kind: 'personal' as const, encName: f.encName, parentId: f.parentId, ownerId: f.ownerId, role: 'owner' as FolderRole, encKey: null, keyType: null })),
    ...shared.map((f) => { const m = roleOf.get(f.id)!; return { id: f.id, kind: 'shared' as const, encName: f.encName, parentId: null, ownerId: f.ownerId, role: m.role, encKey: m.encKey, keyType: m.keyType }; }),
  ];

  const directRows = await db.select().from(schema.recordKeys).where(eq(schema.recordKeys.userId, userId));
  const folderLinks = sharedIds.length ? await db.select().from(schema.folderRecords).where(inArray(schema.folderRecords.folderId, sharedIds)) : [];
  const recordIds = [...new Set([...directRows.map((r) => r.recordId), ...folderLinks.map((l) => l.recordId)])];
  if (recordIds.length === 0) return { records: [], folders };
  const rows = await db.select({ r: schema.records, ownerEmail: schema.users.email }).from(schema.records).innerJoin(schema.users, eq(schema.users.id, schema.records.ownerId)).where(inArray(schema.records.id, recordIds));

  const directBy = new Map(directRows.map((r) => [r.recordId, r] as const));
  const linksBy = new Map<string, typeof folderLinks>();
  for (const l of folderLinks) linksBy.set(l.recordId, [...(linksBy.get(l.recordId) ?? []), l]);

  const records: VaultRecordDto[] = [];
  for (const { r, ownerEmail } of rows) {
    const direct = directBy.get(r.id);
    const links = linksBy.get(r.id) ?? [];
    // trashed records are visible only to the owner
    if (r.deletedAt && r.ownerId !== userId) continue;
    let permission: Permission | null = r.ownerId === userId ? 'owner' : (direct?.permission ?? null);
    let canShare = r.ownerId === userId || Boolean(direct?.canShare);
    const keys: KeySource[] = [];
    if (direct) keys.push({ via: direct.keyType, encKey: direct.encKey });
    for (const l of links) {
      const m = roleOf.get(l.folderId)!;
      permission = maxPermission(permission, roleToPermission(m.role));
      if (m.role === 'admin' || m.role === 'owner') canShare = true;
      keys.push({ via: 'folder', encKey: l.encKey, folderId: l.folderId });
    }
    if (!permission) continue;
    records.push({
      id: r.id, type: r.type, encData: r.encData, ownerId: r.ownerId, ownerEmail,
      createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(), deletedAt: r.deletedAt?.toISOString() ?? null,
      access: { permission, canShare, favorite: direct?.favorite ?? false, folderId: direct?.folderId ?? null },
      keys, sharedFolderIds: links.map((l) => l.folderId),
    });
  }
  return { records, folders };
}
