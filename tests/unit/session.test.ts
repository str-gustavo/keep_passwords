import { describe, expect, it } from 'vitest';
import { createSessionCookie, clearSessionCookie, readSession } from '@/server/auth/session';

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
  });
});
