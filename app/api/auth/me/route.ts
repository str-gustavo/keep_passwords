import { handle, json } from '@/server/http';
import { requireUser } from '@/server/auth/session';
import { toSessionUser } from '@/server/services/auth';
export const GET = handle(async (req) => json({ user: toSessionUser(await requireUser(req)) }));
