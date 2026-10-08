import { z } from 'zod';
import { handle, json, parseBody } from '@/server/http';
import { requireUser } from '@/server/auth/session';
import { toSessionUser, updateSettings } from '@/server/services/auth';
export const PUT = handle(async (req) => {
  const user = await requireUser(req);
  const body = await parseBody(req, z.object({ name: z.string().trim().min(1).max(120).optional(), lockMinutes: z.number().int().min(1).max(60).optional() }));
  return json({ user: toSessionUser(await updateSettings(user, body)) });
});
