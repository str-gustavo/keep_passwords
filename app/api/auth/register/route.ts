import { z } from 'zod';
import { handle, json, parseBody } from '@/server/http';
import { createSessionCookie } from '@/server/auth/session';
import { register, toSessionUser } from '@/server/services/auth';

const b64 = z.string().min(1).max(20_000);
export const registerSchema = z.object({
  email: z.string().trim().max(254).regex(/^[^\s@]+@[^\s@]+$/), name: z.string().trim().min(1).max(120), authKey: b64, kdfSalt: b64, kdfIterations: z.number().int().min(100_000).max(5_000_000),
  encDataKey: b64, publicKey: b64, encPrivateKey: b64, recoveryAuthKey: b64, recoverySalt: b64, encDataKeyRecovery: b64,
});

export const POST = handle(async (req) => {
  const input = await parseBody(req, registerSchema);
  const user = await register(input);
  return json({ user: toSessionUser(user) }, { status: 201, headers: { 'set-cookie': await createSessionCookie(user.id, user.authVersion) } });
});
