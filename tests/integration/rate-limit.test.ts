import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFreshDb } from '../helpers/db';
import { call, req, registerUser } from '../helpers/client';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as verify } from '@/app/api/auth/recovery/verify/route';
import { GET as publicKey } from '@/app/api/users/public-key/route';

useFreshDb();
afterEach(() => { vi.restoreAllMocks(); });

const T0 = Date.UTC(2026, 9, 8, 12);
/** Freezes the limiter's clock (no refill while the requests run); returns a setter to move it. */
const freezeClock = () => { const spy = vi.spyOn(Date, 'now').mockReturnValue(T0); return (ms: number) => spy.mockReturnValue(T0 + ms); };
const from = (ip: string) => ({ 'x-forwarded-for': `${ip}, 10.9.9.9` });

describe('rate limiting', () => {
  it('the 21st login from one IP within a minute gets 429; another IP is unaffected; tokens refill over time', async () => {
    const u = await registerUser('a@b.c');
    const setClock = freezeClock();
    const attempt = (ip: string) => call(login, req('POST', '/api/auth/login', { body: { email: u.email, authKey: u.material.authKey }, headers: from(ip) }));
    for (let i = 0; i < 20; i++) expect((await attempt('203.0.113.1')).status).toBe(200);
    const limited = await attempt('203.0.113.1');
    expect(limited.status).toBe(429);
    expect(limited.data).toEqual({ error: { code: 'rate_limited', message: 'Muitas tentativas. Aguarde um minuto.' } });
    expect((await attempt('203.0.113.2')).status).toBe(200);
    // 20 per minute refill one token every 3 s.
    setClock(2_999);
    expect((await attempt('203.0.113.1')).status).toBe(429);
    setClock(6_000);
    expect((await attempt('203.0.113.1')).status).toBe(200);
  });

  it('recovery verification allows 10 attempts per minute per IP', async () => {
    await registerUser('a@b.c');
    freezeClock();
    const attempt = (ip: string) => call(verify, req('POST', '/api/auth/recovery/verify', { body: { email: 'a@b.c', recoveryAuthKey: 'wrong' }, headers: { 'x-real-ip': ip } }));
    for (let i = 0; i < 10; i++) expect((await attempt('198.51.100.7')).status).toBe(401);
    expect((await attempt('198.51.100.7')).status).toBe(429);
    expect((await attempt('198.51.100.8')).status).toBe(401);
  });

  it('public-key lookups allow 60 per minute', async () => {
    const u = await registerUser('a@b.c');
    freezeClock();
    const lookup = () => call(publicKey, req('GET', '/api/users/public-key?email=a@b.c', { cookie: u.cookie }));
    for (let i = 0; i < 60; i++) expect((await lookup()).status).toBe(200);
    expect((await lookup()).status).toBe(429);
  });
});
