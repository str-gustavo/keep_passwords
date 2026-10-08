import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExtApi, ExtApiError } from '@/sw/api';
import { loadVault } from '@/sw/vault';
import { loadSession, saveSession, stateOf } from '@/sw/session';
import { resetChromeMock } from './helpers/chrome-mock';
import { r, realKeys, stubFetch, user } from './helpers/fixtures';

const SERVER = 'http://localhost:3000';

beforeEach(() => resetChromeMock());
afterEach(() => vi.unstubAllGlobals());

describe('ExtApi', () => {
  it('sends the bearer token, x-client: extension and JSON, without cookies', async () => {
    const { calls } = stubFetch({ 'GET /api/vault': () => ({ body: { records: [], folders: [] } }), 'PUT /api/records/1': () => ({ body: { ok: true } }) });
    const api = new ExtApi(SERVER, 'tok');
    await expect(api.get('/api/vault')).resolves.toEqual({ records: [], folders: [] });
    await api.put('/api/records/1', { encData: 'x' });
    expect(calls[0]).toMatchObject({ url: `${SERVER}/api/vault`, method: 'GET', credentials: 'omit', headers: { authorization: 'Bearer tok', 'x-client': 'extension', 'content-type': 'application/json' } });
    expect(calls[0]!.body).toBeUndefined();
    expect(calls[1]).toMatchObject({ method: 'PUT', body: { encData: 'x' }, headers: { authorization: 'Bearer tok' } });
  });

  it('omits the authorization header without a token', async () => {
    const { calls } = stubFetch({ 'POST /api/auth/prelogin': () => ({ body: { kdfSalt: 's', kdfIterations: 600000 } }) });
    await new ExtApi(SERVER, null).post('/api/auth/prelogin', { email: 'a@b.c' });
    expect(calls[0]!.headers).toEqual({ 'content-type': 'application/json', 'x-client': 'extension' });
    expect(calls[0]!.body).toEqual({ email: 'a@b.c' });
  });

  it('maps the server error shape to ExtApiError (429 message surfaced as is)', async () => {
    stubFetch({ 'POST /api/auth/login': () => ({ status: 429, body: { error: { code: 'rate_limited', message: 'Muitas tentativas. Aguarde um minuto.' } } }) });
    const err = await new ExtApi(SERVER, null).post('/api/auth/login', {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExtApiError);
    expect(err).toMatchObject({ status: 429, code: 'rate_limited', message: 'Muitas tentativas. Aguarde um minuto.' });
  });

  it('keeps a generic message for non-JSON errors and maps network failures to status 0', async () => {
    stubFetch({ 'GET /api/vault': () => ({ status: 502, text: '<html>Bad gateway</html>' }) });
    await expect(new ExtApi(SERVER, 't').get('/api/vault')).rejects.toMatchObject({ status: 502, code: 'http_error' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(new ExtApi(SERVER, 't').get('/api/vault')).rejects.toMatchObject({ status: 0, code: 'network', message: 'Não foi possível conectar ao servidor configurado.' });
  });

  it('rejects a non-JSON success body as an invalid response', async () => {
    stubFetch({ 'GET /api/vault': () => ({ text: '<html>login</html>' }) });
    await expect(new ExtApi(SERVER, 't').get('/api/vault')).rejects.toMatchObject({ code: 'bad_response' });
  });
});

describe('401 on an authenticated call', () => {
  it('clears the token and every secret: the extension becomes signed-out (server kept)', async () => {
    const k = await realKeys();
    stubFetch({ 'GET /api/vault': () => ({ status: 401, body: { error: { code: 'unauthorized', message: 'Sessão expirada' } } }) });
    await saveSession({ serverUrl: SERVER, token: 'expired', user, secrets: k.secrets, vault: [r({ password: 'pw' })] });

    await expect(loadVault(true)).rejects.toMatchObject({ status: 401 });
    const s = await loadSession();
    expect(stateOf(s).status).toBe('signed-out');
    expect(s).toMatchObject({ serverUrl: SERVER, token: null, secrets: null, vault: [], pending: null });
  });
});
