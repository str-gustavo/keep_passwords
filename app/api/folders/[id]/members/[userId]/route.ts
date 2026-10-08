import { z } from 'zod';
import { handle, json, parseBody, uuidParam } from '@/server/http';
import { requireUser } from '@/server/auth/session';
import { removeMember, updateMember } from '@/server/services/folders';

export const PUT = handle(async (req, ctx) => {
  const user = await requireUser(req);
  const id = await uuidParam(ctx, 'id');
  const target = await uuidParam(ctx, 'userId');
  const body = await parseBody(req, z.object({ role: z.enum(['admin', 'editor', 'viewer']) }));
  await updateMember(user.id, id, target, body);
  return json({ ok: true });
});

export const DELETE = handle(async (req, ctx) => {
  const user = await requireUser(req);
  const id = await uuidParam(ctx, 'id');
  await removeMember(user.id, id, await uuidParam(ctx, 'userId'));
  return json({ ok: true });
});
