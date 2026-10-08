import { z } from 'zod';
import { handle, json, parseBody } from '@/server/http';
import { createSessionCookie, createSessionToken } from '@/server/auth/session';
import { register, toSessionUser } from '@/server/services/auth';

const b64 = z.string().regex(/^[A-Za-z0-9+/]+=*$/).min(1).max(20_000);
const key = z.string().regex(/^[A-Za-z0-9+/]+=*$/).min(40).max(200);
const registerSchema = z.object({
  email: z.string().trim().max(254).regex(/^[^\s@]+@[^\s@]+$/), name: z.string().trim().min(1).max(120), authKey: key, kdfSalt: b64, kdfIterations: z.number().int().min(100_000).max(5_000_000),
  encDataKey: b64, publicKey: b64, encPrivateKey: b64, recoveryAuthKey: key, recoverySalt: b64, encDataKeyRecovery: b64,
});

export const POST = handle(async (req) => {
  const input = await parseBody(req, registerSchema);
  const user = await register(input);
  const wantsToken = req.headers.get('x-client') === 'extension';
  return json({ user: toSessionUser(user), ...(wantsToken ? { token: await createSessionToken(user.id, user.authVersion) } : {}) }, { status: 201, headers: { 'set-cookie': await createSessionCookie(user.id, user.authVersion) } });
});
