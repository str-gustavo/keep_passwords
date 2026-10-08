import { z } from 'zod';
import { handle, json, parseBody, uuidParam } from '@/server/http';
import { requireUser } from '@/server/auth/session';
import { removeShare, updateShare } from '@/server/services/shares';

export const PUT = handle(async (req, ctx) => {
  const user = await requireUser(req);
  const id = await uuidParam(ctx, 'id');
  const targetId = await uuidParam(ctx, 'userId');
  const body = await parseBody(req, z.object({ permission: z.enum(['view', 'edit']), canShare: z.boolean() }));
  await updateShare(user.id, id, targetId, body);
  return json({ ok: true });
});

export const DELETE = handle(async (req, ctx) => {
  const user = await requireUser(req);
  const id = await uuidParam(ctx, 'id');
  const targetId = await uuidParam(ctx, 'userId');
  await removeShare(user.id, id, targetId);
  return json({ ok: true });
});
