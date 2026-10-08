import { z } from 'zod';
import { handle, json, parseBody } from '@/server/http';
import { createSessionCookie, requireUser } from '@/server/auth/session';
import { changePassword, toSessionUser } from '@/server/services/auth';
const b64 = z.string().regex(/^[A-Za-z0-9+/]+=*$/).min(1).max(20_000);
const key = z.string().regex(/^[A-Za-z0-9+/]+=*$/).min(40).max(200);
export const PUT = handle(async (req) => {
  const user = await requireUser(req);
  const body = await parseBody(req, z.object({ currentAuthKey: key, newAuthKey: key, kdfSalt: b64, kdfIterations: z.number().int().min(100_000).max(5_000_000), encDataKey: b64, recoveryAuthKey: key, recoverySalt: b64, encDataKeyRecovery: b64 }));
  const updated = await changePassword(user, body);
  return json({ user: toSessionUser(updated) }, { headers: { 'set-cookie': await createSessionCookie(updated.id, updated.authVersion) } });
});
