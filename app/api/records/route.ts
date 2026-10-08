import { z } from 'zod';
import { handle, json, parseBody } from '@/server/http';
import { requireUser } from '@/server/auth/session';
import { createRecord } from '@/server/services/records';
import { isRecordTypeId } from '@/lib/record-types/catalog';

export const POST = handle(async (req) => {
  const user = await requireUser(req);
  const body = await parseBody(req, z.object({ type: z.string().refine(isRecordTypeId, 'tipo inválido'), encData: z.string().min(1).max(2_000_000), encKey: z.string().min(1).max(1000), folderId: z.uuid().nullable().optional() }));
  const record = await createRecord(user.id, body);
  return json({ record: { id: record.id, createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString() } }, { status: 201 });
});
