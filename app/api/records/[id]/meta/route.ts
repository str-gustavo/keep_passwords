import { z } from 'zod';
import { handle, json, parseBody, uuidParam } from '@/server/http';
import { requireUser } from '@/server/auth/session';
import { setRecordMeta } from '@/server/services/records';

export const PUT = handle(async (req, ctx) => {
  const user = await requireUser(req);
  const id = await uuidParam(ctx, 'id');
  const body = await parseBody(req, z.object({ favorite: z.boolean().optional(), folderId: z.uuid().nullable().optional() })
    .refine((b) => b.favorite !== undefined || b.folderId !== undefined, 'Informe favorite ou folderId'));
  await setRecordMeta(user.id, id, body);
  return json({ ok: true });
});
