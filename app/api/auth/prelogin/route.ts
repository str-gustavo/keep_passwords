import { z } from 'zod';
import { handle, json, parseBody } from '@/server/http';
import { prelogin } from '@/server/services/auth';
export const POST = handle(async (req) => json(await prelogin((await parseBody(req, z.object({ email: z.string().min(3).max(254) }))).email)));
