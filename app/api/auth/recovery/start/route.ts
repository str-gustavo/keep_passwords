import { z } from 'zod';
import { handle, json, parseBody } from '@/server/http';
import { startRecovery } from '@/server/services/recovery';

const schema = z.object({ email: z.string().min(3).max(254) });

export const POST = handle(async (req) => {
  const { email } = await parseBody(req, schema);
  return json(await startRecovery(email));
});
