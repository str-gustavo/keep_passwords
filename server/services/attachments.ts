import { and, eq } from 'drizzle-orm';
import { ApiError } from '@/server/http';
import { getDb, schema } from '@/server/db';
import { assertPermission, resolveAccess } from './access';

export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024 + 64;

export async function uploadAttachment(userId: string, recordId: string, bytes: Uint8Array) {
  if (bytes.length > MAX_ATTACHMENT_BYTES) throw new ApiError(413, 'attachment_too_large', 'Anexo acima de 4 MB');
  if (bytes.length < 29 || bytes[0] !== 0x01) throw new ApiError(400, 'not_a_blob', 'Anexo não é um blob cifrado');
  const db = await getDb();
  const a = await resolveAccess(db, userId, recordId);
  assertPermission(a, 'edit');
  const [row] = await db.insert(schema.attachments).values({ recordId, size: bytes.length, encBlob: bytes }).returning();
  return { id: row!.id, size: row!.size };
}

export async function downloadAttachment(userId: string, recordId: string, aid: string): Promise<Uint8Array> {
  const db = await getDb();
  const a = await resolveAccess(db, userId, recordId);
  assertPermission(a, 'view');
  const row = await db.query.attachments.findFirst({ where: and(eq(schema.attachments.id, aid), eq(schema.attachments.recordId, recordId)) });
  if (!row) throw new ApiError(404, 'not_found', 'Anexo não encontrado');
  return row.encBlob;
}

export async function deleteAttachment(userId: string, recordId: string, aid: string) {
  const db = await getDb();
  const a = await resolveAccess(db, userId, recordId);
  assertPermission(a, 'edit');
  const res = await db.delete(schema.attachments).where(and(eq(schema.attachments.id, aid), eq(schema.attachments.recordId, recordId))).returning();
  if (res.length === 0) throw new ApiError(404, 'not_found', 'Anexo não encontrado');
}
