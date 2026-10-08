import { handle, json, uuidParam } from '@/server/http';
import { requireUser } from '@/server/auth/session';
import { purgeRecord } from '@/server/services/records';

export const DELETE = handle(async (req, ctx) => {
  const user = await requireUser(req);
  await purgeRecord(user.id, await uuidParam(ctx, 'id'));
  return json({ ok: true });
});
