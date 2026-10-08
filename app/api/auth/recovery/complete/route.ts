import { z } from 'zod';
import { handle, json, parseBody } from '@/server/http';
import { createSessionCookie } from '@/server/auth/session';
import { toSessionUser } from '@/server/services/auth';
import { completeRecovery } from '@/server/services/recovery';

const b64 = z.string().regex(/^[A-Za-z0-9+/]+=*$/).min(1).max(20_000);
const key = z.string().regex(/^[A-Za-z0-9+/]+=*$/).min(40).max(200);
const schema = z.object({
  token: z.string().min(10).max(200), newAuthKey: key, kdfSalt: b64, kdfIterations: z.number().int().min(100_000).max(5_000_000),
  encDataKey: b64, recoveryAuthKey: key, recoverySalt: b64, encDataKeyRecovery: b64,
});

export const POST = handle(async (req) => {
  const { token, ...input } = await parseBody(req, schema);
  const user = await completeRecovery(token, input);
  return json({ user: toSessionUser(user) }, { headers: { 'set-cookie': await createSessionCookie(user.id, user.authVersion) } });
});
