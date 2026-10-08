import { z } from 'zod';
import { handle, json, parseBody, rateLimit } from '@/server/http';
import { createSessionCookie, createSessionToken } from '@/server/auth/session';
import { login, toSessionUser } from '@/server/services/auth';
export const POST = handle(async (req) => {
  rateLimit(req, { key: 'login', limit: 20, windowMs: 60_000 });
  const { email, authKey } = await parseBody(req, z.object({ email: z.string().min(3).max(254), authKey: z.string().regex(/^[A-Za-z0-9+/]+=*$/).min(40).max(200) }));
  const user = await login(email, authKey);
  const wantsToken = req.headers.get('x-client') === 'extension';
  return json({ user: toSessionUser(user), ...(wantsToken ? { token: await createSessionToken(user.id, user.authVersion) } : {}) }, { headers: { 'set-cookie': await createSessionCookie(user.id, user.authVersion) } });
});
