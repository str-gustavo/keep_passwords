import { handle, json, uuidParam } from '@/server/http';
import { requireUser } from '@/server/auth/session';
import { removeFolderRecord } from '@/server/services/folders';

export const DELETE = handle(async (req, ctx) => {
  const user = await requireUser(req);
  const id = await uuidParam(ctx, 'id');
  await removeFolderRecord(user.id, id, await uuidParam(ctx, 'recordId'));
  return json({ ok: true });
});
