import { z } from 'zod';
import { handle, json, parseBody, uuidParam } from '@/server/http';
import { requireUser } from '@/server/auth/session';
import { rewrapRecordKey } from '@/server/services/records';

export const POST = handle(async (req, ctx) => {
  const user = await requireUser(req);
  const id = await uuidParam(ctx, 'id');
  const { encKey } = await parseBody(req, z.object({ encKey: z.string().min(1).max(1000) }));
  await rewrapRecordKey(user.id, id, encKey);
  return json({ ok: true });
});
