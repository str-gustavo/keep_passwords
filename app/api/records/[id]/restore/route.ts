import { handle, json, uuidParam } from '@/server/http';
import { requireUser } from '@/server/auth/session';
import { restoreRecord } from '@/server/services/records';

export const POST = handle(async (req, ctx) => {
  const user = await requireUser(req);
  await restoreRecord(user.id, await uuidParam(ctx, 'id'));
  return json({ ok: true });
});
