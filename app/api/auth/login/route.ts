import { z } from 'zod';
import { handle, json, parseBody } from '@/server/http';
import { createSessionCookie } from '@/server/auth/session';
import { login, toSessionUser } from '@/server/services/auth';
export const POST = handle(async (req) => {
  const { email, authKey } = await parseBody(req, z.object({ email: z.string().min(3).max(254), authKey: z.string().min(1).max(200) }));
  const user = await login(email, authKey);
  return json({ user: toSessionUser(user) }, { headers: { 'set-cookie': await createSessionCookie(user.id, user.authVersion) } });
});
