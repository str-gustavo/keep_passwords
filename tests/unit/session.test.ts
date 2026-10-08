import { describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';
import { createSessionCookie, clearSessionCookie, readSession, requireUser } from '@/server/auth/session';
import { ApiError } from '@/server/http';
import { getDb, schema } from '@/server/db';
import { useFreshDb } from '../helpers/db';

const ID = '11111111-1111-1111-1111-111111111111';
const sign = (secret: string, exp: string) =>
  new SignJWT({ av: 1 }).setProtectedHeader({ alg: 'HS256' }).setSubject(ID).setIssuedAt().setExpirationTime(exp).sign(new TextEncoder().encode(secret));
const reqWith = (token: string) => new Request('http://x', { headers: { cookie: `keep_session=${token}` } });

describe('session', () => {
  it('round-trips through a cookie', async () => {
    const setCookie = await createSessionCookie('11111111-1111-1111-1111-111111111111', 3);
    expect(setCookie).toMatch(/^keep_session=.+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=604800/);
    const cookie = setCookie.split(';')[0]!;
    const s = await readSession(new Request('http://x', { headers: { cookie: `foo=bar; ${cookie}` } }));
    expect(s).toEqual({ userId: '11111111-1111-1111-1111-111111111111', authVersion: 3 });
    expect(await readSession(new Request('http://x'))).toBeNull();
    expect(await readSession(new Request('http://x', { headers: { cookie: 'keep_session=garbage' } }))).toBeNull();
    expect(clearSessionCookie()).toMatch(/^keep_session=; Path=\/; HttpOnly; SameSite=Lax; Max-Age=0/);
    expect(clearSessionCookie()).not.toContain('Secure');
  });
  it('marks both the session and the clearing cookie Secure in production', async () => {
    const env = process.env as Record<string, string | undefined>;
    const prev = env.NODE_ENV;
    env.NODE_ENV = 'production';
    try {
      expect(await createSessionCookie('11111111-1111-1111-1111-111111111111', 1)).toMatch(/; Secure$/);
      expect(clearSessionCookie()).toBe('keep_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure');
    } finally { env.NODE_ENV = prev; }
  });
});

describe('session rejection', () => {
  it('rejects an expired token', async () => {
    const t = await sign(process.env.SESSION_SECRET!, '-10s');
    expect(await readSession(reqWith(t))).toBeNull();
  });
  it('rejects a token signed with a different secret', async () => {
    const t = await sign('x'.repeat(40), '1h');
    expect(await readSession(reqWith(t))).toBeNull();
  });
  it('accepts a valid token from the same helper (sanity)', async () => {
    const t = await sign(process.env.SESSION_SECRET!, '1h');
    expect(await readSession(reqWith(t))).toEqual({ userId: ID, authVersion: 1 });
  });
});

describe('requireUser', () => {
  useFreshDb();
  const insert = async () => {
    const db = await getDb();
    const [u] = await db.insert(schema.users).values({
      email: 'a@b.c', name: 'A', authHash: 'h', kdfSalt: 's', kdfIterations: 1, encDataKey: 'k',
      publicKey: 'p', encPrivateKey: 'e', recoveryAuthHash: 'r', recoverySalt: 'rs', encDataKeyRecovery: 'rk',
    }).returning();
    return u!;
  };
  it('returns the user for a valid cookie', async () => {
    const u = await insert();
    const c = (await createSessionCookie(u.id, u.authVersion)).split(';')[0]!;
    const got = await requireUser(new Request('http://x', { headers: { cookie: c } }));
    expect(got.id).toBe(u.id);
  });
  it('throws 401 when authVersion differs', async () => {
    const u = await insert();
    const c = (await createSessionCookie(u.id, u.authVersion + 1)).split(';')[0]!;
    await expect(requireUser(new Request('http://x', { headers: { cookie: c } }))).rejects.toMatchObject({ status: 401 });
    await expect(requireUser(new Request('http://x', { headers: { cookie: c } }))).rejects.toBeInstanceOf(ApiError);
  });
  it('throws 401 without a cookie', async () => {
    await expect(requireUser(new Request('http://x'))).rejects.toMatchObject({ status: 401 });
  });
});
