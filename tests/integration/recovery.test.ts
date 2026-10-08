import { describe, expect, it } from 'vitest';
import { useFreshDb } from '../helpers/db';
import { call, req, registerUser, cookieOf } from '../helpers/client';
import { POST as start } from '@/app/api/auth/recovery/start/route';
import { POST as verify } from '@/app/api/auth/recovery/verify/route';
import { POST as complete } from '@/app/api/auth/recovery/complete/route';
import { POST as login } from '@/app/api/auth/login/route';
import { GET as me } from '@/app/api/auth/me/route';
import { computeAuthKey, computeRecoveryAuthKey, createRecoveryMaterial, recoverDataKey, rewrapForNewPassword } from '@/lib/crypto/account';
import { exportAesKey } from '@/lib/crypto/aes';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/server/db';

useFreshDb();

describe('recovery', () => {
  it('recovers the account with the phrase and sets a new password', async () => {
    const s = await registerUser('a@b.c');
    const st = await call(start, req('POST', '/api/auth/recovery/start', { body: { email: 'a@b.c' } }));
    expect(st.data.recoverySalt).toBe(s.material.recovery.recoverySalt);
    const unknown = await call(start, req('POST', '/api/auth/recovery/start', { body: { email: 'no@b.c' } }));
    expect(unknown.status).toBe(200);
    expect(Buffer.from(unknown.data.recoverySalt, 'base64').length).toBe(16);

    const rak = await computeRecoveryAuthKey(s.material.recoveryPhrase, st.data.recoverySalt);
    const bad = await call(verify, req('POST', '/api/auth/recovery/verify', { body: { email: 'a@b.c', recoveryAuthKey: s.material.authKey } }));
    expect(bad.status).toBe(401);
    const v = await call(verify, req('POST', '/api/auth/recovery/verify', { body: { email: 'a@b.c', recoveryAuthKey: rak } }));
    expect(v.status).toBe(200);
    const dataKey = await recoverDataKey(s.material.recoveryPhrase, st.data.recoverySalt, v.data.encDataKeyRecovery);
    expect(await exportAesKey(dataKey)).toEqual(await exportAesKey(s.material.dataKey));

    const n = await rewrapForNewPassword('a@b.c', 'nova senha 789', dataKey);
    const rec = await createRecoveryMaterial(dataKey);
    const body = { token: v.data.token, newAuthKey: n.authKey, kdfSalt: n.kdfSalt, kdfIterations: n.kdfIterations, encDataKey: n.encDataKey, recoveryAuthKey: rec.recoveryAuthKey, recoverySalt: rec.recoverySalt, encDataKeyRecovery: rec.encDataKeyRecovery };
    const c = await call(complete, req('POST', '/api/auth/recovery/complete', { body }));
    expect(c.status).toBe(200);
    expect((await call(me, req('GET', '/api/auth/me', { cookie: cookieOf(c.setCookie) }))).status).toBe(200);
    expect((await call(me, req('GET', '/api/auth/me', { cookie: s.cookie }))).status).toBe(401);
    const authKey = await computeAuthKey('a@b.c', 'nova senha 789', n.kdfSalt, n.kdfIterations);
    expect((await call(login, req('POST', '/api/auth/login', { body: { email: 'a@b.c', authKey } }))).status).toBe(200);
    const reuse = await call(complete, req('POST', '/api/auth/recovery/complete', { body }));
    expect(reuse.status).toBe(401);
  });
  async function verified(email: string, s: Awaited<ReturnType<typeof registerUser>>) {
    const rak = s.material.recovery.recoveryAuthKey;
    return call(verify, req('POST', '/api/auth/recovery/verify', { body: { email, recoveryAuthKey: rak } }));
  }
  async function completeBody(token: string, s: Awaited<ReturnType<typeof registerUser>>) {
    const n = await rewrapForNewPassword(s.email, 'outra senha 456', s.material.dataKey);
    const rec = await createRecoveryMaterial(s.material.dataKey);
    return { token, newAuthKey: n.authKey, kdfSalt: n.kdfSalt, kdfIterations: n.kdfIterations, encDataKey: n.encDataKey, recoveryAuthKey: rec.recoveryAuthKey, recoverySalt: rec.recoverySalt, encDataKeyRecovery: rec.encDataKeyRecovery };
  }

  it('rejects verify for an unknown email', async () => {
    const s = await registerUser('a@b.c');
    const r = await call(verify, req('POST', '/api/auth/recovery/verify', { body: { email: 'no@b.c', recoveryAuthKey: s.material.recovery.recoveryAuthKey } }));
    expect(r.status).toBe(401);
    expect(r.data.error.code).toBe('invalid_recovery');
  });

  it('rejects an expired token', async () => {
    const s = await registerUser('a@b.c');
    const v = await verified('a@b.c', s);
    expect(v.status).toBe(200);
    const db = await getDb();
    await db.update(schema.recoveryTokens).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.recoveryTokens.token, v.data.token));
    const c = await call(complete, req('POST', '/api/auth/recovery/complete', { body: await completeBody(v.data.token, s) }));
    expect(c.status).toBe(401);
    expect(c.data.error.code).toBe('invalid_token');
  });

  it('verify also deletes expired tokens of other accounts, keeping valid ones', async () => {
    const a = await registerUser('a@b.c');
    const b = await registerUser('b@b.c');
    const c = await registerUser('c@b.c');
    const db = await getDb();
    await db.insert(schema.recoveryTokens).values([
      { token: 'expired-b', userId: b.userId, expiresAt: new Date(Date.now() - 1000) },
      { token: 'valid-c', userId: c.userId, expiresAt: new Date(Date.now() + 60_000) },
    ]);
    const v = await verified('a@b.c', a);
    expect(v.status).toBe(200);
    const tokens = (await db.select({ token: schema.recoveryTokens.token }).from(schema.recoveryTokens)).map((r) => r.token).sort();
    expect(tokens).toEqual([v.data.token, 'valid-c'].sort());
  });

  it('a second verify replaces the first token', async () => {
    const s = await registerUser('a@b.c');
    const v1 = await verified('a@b.c', s);
    const v2 = await verified('a@b.c', s);
    expect(v2.data.token).not.toBe(v1.data.token);
    const c1 = await call(complete, req('POST', '/api/auth/recovery/complete', { body: await completeBody(v1.data.token, s) }));
    expect(c1.status).toBe(401);
    const c2 = await call(complete, req('POST', '/api/auth/recovery/complete', { body: await completeBody(v2.data.token, s) }));
    expect(c2.status).toBe(200);
  });
});
