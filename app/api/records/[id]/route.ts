import { z } from 'zod';
import { handle, json, parseBody, uuidParam } from '@/server/http';
import { requireUser } from '@/server/auth/session';
import { trashRecord, updateRecord } from '@/server/services/records';

export const PUT = handle(async (req, ctx) => {
  const user = await requireUser(req);
  const id = await uuidParam(ctx, 'id');
  const { encData } = await parseBody(req, z.object({ encData: z.string().min(1).max(2_000_000) }));
  const r = await updateRecord(user.id, id, encData);
  return json({ record: { id: r.id, updatedAt: r.updatedAt.toISOString() } });
});

export const DELETE = handle(async (req, ctx) => {
  const user = await requireUser(req);
  await trashRecord(user.id, await uuidParam(ctx, 'id'));
  return json({ ok: true });
});
