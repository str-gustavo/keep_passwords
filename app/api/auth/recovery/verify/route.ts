import { z } from 'zod';
import { handle, json, parseBody } from '@/server/http';
import { verifyRecovery } from '@/server/services/recovery';

const schema = z.object({ email: z.string().min(3).max(254), recoveryAuthKey: z.string().min(1).max(200) });

export const POST = handle(async (req) => {
  const { email, recoveryAuthKey } = await parseBody(req, schema);
  return json(await verifyRecovery(email, recoveryAuthKey));
});
