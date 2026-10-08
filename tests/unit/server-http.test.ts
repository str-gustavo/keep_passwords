import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiError, clientIp, handle, json, parseBody, rateLimit, resetRateLimitsForTests } from '@/server/http';
import { hashSecret, verifySecret } from '@/server/auth/password';

describe('http helpers', () => {
  it('json sets content-type', async () => {
    const r = json({ ok: true }, { status: 201 });
    expect(r.status).toBe(201);
    expect(r.headers.get('content-type')).toContain('application/json');
  });
  it('handle maps ApiError and ZodError to the error shape', async () => {
    const h = handle(async () => { throw new ApiError(403, 'forbidden', 'Sem permissão'); });
    const r = await h(new Request('http://x'), { params: Promise.resolve({}) });
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: { code: 'forbidden', message: 'Sem permissão' } });
    const h2 = handle(async (req) => { await parseBody(req, z.object({ a: z.number() })); return json({}); });
    const r2 = await h2(new Request('http://x', { method: 'POST', body: '{"a":"no"}', headers: { 'content-type': 'application/json' } }), { params: Promise.resolve({}) });
    expect(r2.status).toBe(400);
    expect((await r2.json()).error.code).toBe('validation');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const h3 = handle(async () => { throw new Error('boom'); });
    const r3 = await h3(new Request('http://x'), { params: Promise.resolve({}) });
    expect(r3.status).toBe(500);
    expect(await r3.text()).not.toContain('boom');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('secret hashing', () => {
  it('verifies the right secret and rejects a wrong one', async () => {
    const h = await hashSecret('c2VjcmV0');
    expect(h.startsWith('scrypt$')).toBe(true);
    expect(await verifySecret('c2VjcmV0', h)).toBe(true);
    expect(await verifySecret('c2VjcmV1', h)).toBe(false);
    expect(await hashSecret('c2VjcmV0')).not.toBe(h);
  });
});

describe('rateLimit', () => {
  const r = (headers: Record<string, string> = {}) => new Request('http://x', { headers });
  const opts = { key: 'k', limit: 2, windowMs: 1_000 };
  const blocked = (req: Request, o = opts) => { try { rateLimit(req, o); return false; } catch (e) { expect(e).toMatchObject({ status: 429, code: 'rate_limited' }); return true; } };

  it('reads the client IP from x-forwarded-for, then x-real-ip, else local', () => {
    expect(clientIp(r({ 'x-forwarded-for': ' 1.1.1.1 , 2.2.2.2', 'x-real-ip': '3.3.3.3' }))).toBe('1.1.1.1');
    expect(clientIp(r({ 'x-real-ip': '3.3.3.3' }))).toBe('3.3.3.3');
    expect(clientIp(r())).toBe('local');
  });

  it('keeps one bucket per key and IP, refilled over the window', () => {
    resetRateLimitsForTests();
    const now = vi.spyOn(Date, 'now').mockReturnValue(10_000);
    try {
      const a = r({ 'x-real-ip': 'a' });
      expect([blocked(a), blocked(a), blocked(a)]).toEqual([false, false, true]);
      expect(blocked(r({ 'x-real-ip': 'b' }))).toBe(false);
      expect(blocked(a, { ...opts, key: 'other' })).toBe(false);
      now.mockReturnValue(10_499);
      expect(blocked(a)).toBe(true);
      now.mockReturnValue(11_000);
      expect(blocked(a)).toBe(false);
    } finally { now.mockRestore(); resetRateLimitsForTests(); }
  });

  it('prunes idle buckets lazily without changing the outcome', () => {
    resetRateLimitsForTests();
    const now = vi.spyOn(Date, 'now').mockReturnValue(0);
    try {
      for (let i = 0; i < 100; i++) rateLimit(r({ 'x-real-ip': `10.0.0.${i}` }), opts);
      now.mockReturnValue(120_000);
      const a = r({ 'x-real-ip': '10.0.0.1' });
      expect([blocked(a), blocked(a), blocked(a)]).toEqual([false, false, true]);
    } finally { now.mockRestore(); resetRateLimitsForTests(); }
  });
});
