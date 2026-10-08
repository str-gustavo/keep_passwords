import { handle, json } from '@/server/http';
import { clearSessionCookie } from '@/server/auth/session';
export const POST = handle(async () => json({ ok: true }, { headers: { 'set-cookie': clearSessionCookie() } }));
