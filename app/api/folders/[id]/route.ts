import { z } from 'zod';
import { handle, json, parseBody, uuidParam } from '@/server/http';
import { requireUser } from '@/server/auth/session';
import { deleteFolder, renameFolder } from '@/server/services/folders';

export const PUT = handle(async (req, ctx) => {
  const user = await requireUser(req);
  const id = await uuidParam(ctx, 'id');
  const body = await parseBody(req, z.object({ encName: z.string().min(1).max(10_000), parentId: z.uuid().nullable().optional() }));
  await renameFolder(user.id, id, body);
  return json({ ok: true });
});

export const DELETE = handle(async (req, ctx) => {
  const user = await requireUser(req);
  await deleteFolder(user.id, await uuidParam(ctx, 'id'));
  return json({ ok: true });
});
