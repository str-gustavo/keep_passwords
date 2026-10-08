import { handle, json } from '@/server/http';
import { requireUser } from '@/server/auth/session';
import { loadVault } from '@/server/services/vault';
export const GET = handle(async (req) => json(await loadVault((await requireUser(req)).id)));
