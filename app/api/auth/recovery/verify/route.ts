import { z } from 'zod';
import { handle, json, parseBody, rateLimit } from '@/server/http';
import { verifyRecovery } from '@/server/services/recovery';

const schema = z.object({ email: z.string().min(3).max(254), recoveryAuthKey: z.string().min(1).max(200) });

export const POST = handle(async (req) => {
  rateLimit(req, { key: 'recovery-verify', limit: 10, windowMs: 60_000 });
  const { email, recoveryAuthKey } = await parseBody(req, schema);
  return json(await verifyRecovery(email, recoveryAuthKey));
});
