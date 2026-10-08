import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiClientError } from '@/lib/api/client';

describe('api client', () => {
  afterEach(() => vi.restoreAllMocks());
  it('sends json and parses responses', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: 1 }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const r = await api.post<{ ok: number }>('/api/x', { a: 1 });
    expect(r).toEqual({ ok: 1 });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/x');
    expect(init?.method).toBe('POST');
    expect(init?.credentials).toBe('same-origin');
    expect(init?.body).toBe('{"a":1}');
  });
  it('throws ApiClientError with code and message from the error shape', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: { code: 'forbidden', message: 'Sem permissão' } }), { status: 403 }));
    await expect(api.get('/api/x')).rejects.toMatchObject({ status: 403, code: 'forbidden', message: 'Sem permissão' });
  });
  it('calls the unauthorized handler on 401 outside auth routes', async () => {
    const handler = vi.fn();
    api.setUnauthorizedHandler(handler);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: { code: 'unauthorized', message: 'x' } }), { status: 401 }));
    await expect(api.get('/api/vault')).rejects.toBeInstanceOf(ApiClientError);
    expect(handler).toHaveBeenCalledTimes(1);
    await expect(api.post('/api/auth/login', {})).rejects.toBeInstanceOf(ApiClientError);
    expect(handler).toHaveBeenCalledTimes(1);
  });
  it('download returns bytes and upload sends octet-stream', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(new Uint8Array([1, 2]), { status: 200 })); // fresh Response per call: a body is readable once
    expect(await api.download('/api/a')).toEqual(new Uint8Array([1, 2]));
    await api.upload('/api/a', new Uint8Array([3]));
    expect((fetchMock.mock.calls[1]![1]!.headers as Record<string, string>)['content-type']).toBe('application/octet-stream');
  });
});
