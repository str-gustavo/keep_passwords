import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiError, handle, json, parseBody } from '@/server/http';
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
