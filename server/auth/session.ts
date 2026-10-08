import { SignJWT, jwtVerify } from 'jose';
import { eq } from 'drizzle-orm';
import { ApiError } from '@/server/http';
import { getDb, schema } from '@/server/db';

export const COOKIE = 'keep_session';
const MAX_AGE = 7 * 24 * 3600;
export const sessionSecret = (): string => {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET precisa ter pelo menos 32 caracteres');
  return s;
};
const secret = () => new TextEncoder().encode(sessionSecret());
const attrs = () => `Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;

export async function createSessionToken(userId: string, authVersion: number): Promise<string> {
  return new SignJWT({ av: authVersion }).setProtectedHeader({ alg: 'HS256' }).setSubject(userId).setIssuedAt().setExpirationTime(`${MAX_AGE}s`).sign(secret());
}
export async function createSessionCookie(userId: string, authVersion: number): Promise<string> {
  return `${COOKIE}=${await createSessionToken(userId, authVersion)}; ${attrs()}`;
}
export const clearSessionCookie = () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;

export async function readSession(req: Request): Promise<{ userId: string; authVersion: number } | null> {
  const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1]?.trim();
  const cookie = req.headers.get('cookie') ?? '';
  const token = bearer ?? cookie.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!token) return null;
  const key = secret();
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
    if (!payload.sub || typeof payload.av !== 'number') return null;
    return { userId: payload.sub, authVersion: payload.av };
  } catch { return null; }
}

export async function requireUser(req: Request): Promise<schema.User> {
  const s = await readSession(req);
  if (!s) throw new ApiError(401, 'unauthorized', 'Sessão expirada. Entre novamente.');
  const db = await getDb();
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, s.userId) });
  if (!user || user.authVersion !== s.authVersion) throw new ApiError(401, 'unauthorized', 'Sessão expirada. Entre novamente.');
  return user;
}
