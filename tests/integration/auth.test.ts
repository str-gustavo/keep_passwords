import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { useFreshDb } from '../helpers/db';
import { call, req, registerUser, cookieOf } from '../helpers/client';
import { POST as prelogin } from '@/app/api/auth/prelogin/route';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as logout } from '@/app/api/auth/logout/route';
import { GET as me } from '@/app/api/auth/me/route';
import { PUT as settings } from '@/app/api/account/settings/route';
import { PUT as changePassword } from '@/app/api/account/password/route';
import { computeAuthKey, rewrapForNewPassword, createRecoveryMaterial } from '@/lib/crypto/account';
import { getDb, schema } from '@/server/db';

useFreshDb();

describe('auth', () => {
  it('registers, returns session user without secrets, and lowercases email', async () => {
    const s = await registerUser('Ana@Example.com');
    expect(s.email).toBe('Ana@Example.com');
    const m = await call(me, req('GET', '/api/auth/me', { cookie: s.cookie }));
    expect(m.status).toBe(200);
    expect(m.data.user.email).toBe('ana@example.com');
    expect(m.data.user).not.toHaveProperty('authHash');
    expect(m.data.user.encDataKey).toBe(s.material.encDataKey);
  });

  it('rejects duplicate email with 409 and bad payload with 400', async () => {
    await registerUser('a@b.c');
    await expect(registerUser('A@B.C')).rejects.toThrow('409');
    const r = await call(login, req('POST', '/api/auth/login', { body: { email: 'x' } }));
    expect(r.status).toBe(400);
  });

  it('prelogin returns real salt for known users and a stable fake for unknown', async () => {
    const s = await registerUser('a@b.c');
    const known = await call(prelogin, req('POST', '/api/auth/prelogin', { body: { email: 'a@b.c' } }));
    expect(known.data).toEqual({ kdfSalt: s.material.kdfSalt, kdfIterations: 600_000 });
    const u1 = await call(prelogin, req('POST', '/api/auth/prelogin', { body: { email: 'nobody@b.c' } }));
    const u2 = await call(prelogin, req('POST', '/api/auth/prelogin', { body: { email: 'nobody@b.c' } }));
    expect(u1.status).toBe(200);
    expect(u1.data).toEqual(u2.data);
    expect(Buffer.from(u1.data.kdfSalt, 'base64').length).toBe(16);
  });

  it('logs in with the derived auth key and rejects a wrong one with 401', async () => {
    const s = await registerUser('a@b.c');
    const authKey = await computeAuthKey('a@b.c', s.password, s.material.kdfSalt, 600_000);
    const ok = await call(login, req('POST', '/api/auth/login', { body: { email: 'a@b.c', authKey } }));
    expect(ok.status).toBe(200);
    expect(ok.setCookie).toContain('keep_session=');
    const bad = await call(login, req('POST', '/api/auth/login', { body: { email: 'a@b.c', authKey: s.material.recovery.recoveryAuthKey } }));
    expect(bad.status).toBe(401);
    expect(bad.data.error.message).toBe('E-mail ou senha incorretos');
    const unknown = await call(login, req('POST', '/api/auth/login', { body: { email: 'zz@b.c', authKey } }));
    expect(unknown.status).toBe(401);
  });

  it('locks the account after 5 failures with 423 and unlocks after the window', async () => {
    const s = await registerUser('a@b.c');
    const wrong = { email: 'a@b.c', authKey: s.material.recovery.recoveryAuthKey };
    for (let i = 0; i < 5; i++) expect((await call(login, req('POST', '/api/auth/login', { body: wrong }))).status).toBe(401);
    const locked = await call(login, req('POST', '/api/auth/login', { body: wrong }));
    expect(locked.status).toBe(423);
    const authKey = await computeAuthKey('a@b.c', s.password, s.material.kdfSalt, 600_000);
    expect((await call(login, req('POST', '/api/auth/login', { body: { email: 'a@b.c', authKey } }))).status).toBe(423);
    const db = await getDb();
    await db.update(schema.users).set({ lockedUntil: new Date(Date.now() - 1000) }).where(eq(schema.users.email, 'a@b.c'));
    expect((await call(login, req('POST', '/api/auth/login', { body: { email: 'a@b.c', authKey } }))).status).toBe(200);
  });

  it('logout clears the cookie and me requires a session', async () => {
    const s = await registerUser('a@b.c');
    const out = await call(logout, req('POST', '/api/auth/logout', { cookie: s.cookie }));
    expect(out.setCookie).toContain('Max-Age=0');
    expect((await call(me, req('GET', '/api/auth/me'))).status).toBe(401);
  });

  it('updates settings', async () => {
    const s = await registerUser('a@b.c');
    const r = await call(settings, req('PUT', '/api/account/settings', { cookie: s.cookie, body: { name: 'Novo', lockMinutes: 5 } }));
    expect(r.status).toBe(200);
    expect(r.data.user).toMatchObject({ name: 'Novo', lockMinutes: 5 });
    expect((await call(settings, req('PUT', '/api/account/settings', { cookie: s.cookie, body: { lockMinutes: 0 } }))).status).toBe(400);
  });

  it('changes the master password, invalidates old sessions and keeps the data key', async () => {
    const s = await registerUser('a@b.c');
    const current = await computeAuthKey('a@b.c', s.password, s.material.kdfSalt, 600_000);
    const n = await rewrapForNewPassword('a@b.c', 'outra senha 456', s.material.dataKey);
    const rec = await createRecoveryMaterial(s.material.dataKey);
    const r = await call(changePassword, req('PUT', '/api/account/password', { cookie: s.cookie, body: { currentAuthKey: current, newAuthKey: n.authKey, kdfSalt: n.kdfSalt, kdfIterations: n.kdfIterations, encDataKey: n.encDataKey, recoveryAuthKey: rec.recoveryAuthKey, recoverySalt: rec.recoverySalt, encDataKeyRecovery: rec.encDataKeyRecovery } }));
    expect(r.status).toBe(200);
    expect((await call(me, req('GET', '/api/auth/me', { cookie: s.cookie }))).status).toBe(401);
    const fresh = cookieOf(r.setCookie);
    expect((await call(me, req('GET', '/api/auth/me', { cookie: fresh }))).status).toBe(200);
    const wrong = await call(changePassword, req('PUT', '/api/account/password', { cookie: fresh, body: { currentAuthKey: current, newAuthKey: n.authKey, kdfSalt: n.kdfSalt, kdfIterations: n.kdfIterations, encDataKey: n.encDataKey, recoveryAuthKey: rec.recoveryAuthKey, recoverySalt: rec.recoverySalt, encDataKeyRecovery: rec.encDataKeyRecovery } }));
    expect(wrong.status).toBe(401);
  });
});
