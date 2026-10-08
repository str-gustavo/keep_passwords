import { z } from 'zod';
import { handle, json, parseBody, uuidParam } from '@/server/http';
import { requireUser } from '@/server/auth/session';
import { addFolderRecord } from '@/server/services/folders';

export const POST = handle(async (req, ctx) => {
  const user = await requireUser(req);
  const id = await uuidParam(ctx, 'id');
  const body = await parseBody(req, z.object({ recordId: z.uuid(), encKey: z.string().min(1).max(1000) }));
  await addFolderRecord(user.id, id, body);
  return json({ ok: true }, { status: 201 });
});
