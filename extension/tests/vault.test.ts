import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAccountMaterial } from '@app/crypto/account';
import { decryptJson, importAesKey, unwrapAesKey } from '@app/crypto/aes';
import { fromBase64 } from '@app/crypto/encoding';
import { rsaWrapAesKey } from '@app/crypto/rsa';
import { recordDataSchema, type RecordData } from '@app/record-types/record-data';
import { t } from '@app/i18n/pt-br';
import { loadVault, matches, saveNewRecord, search, signIn, unlock, updateRecordPassword } from '@/sw/vault';
import { loadSession, lockSession, saveSession, stateOf } from '@/sw/session';
import { EMAIL_KEY } from '@/shared/constants';
import { getChromeMock, resetChromeMock } from './helpers/chrome-mock';
import { r, realKeys, recordDto, stubFetch, user } from './helpers/fixtures';

const SERVER = 'http://localhost:3000';

beforeEach(() => resetChromeMock());
afterEach(() => vi.unstubAllGlobals());

describe('matches', () => {
  it('matches by registrable domain, sorted by title, no secrets in items', () => {
    const v = [r({ id: '1', title: 'GitHub', url: 'https://github.com', totp: 'otpauth://totp/x?secret=ABC' }), r({ id: '2', title: 'Amazon', url: 'amazon.com.br' }), r({ id: '3', title: 'No URL' })];
    const m = matches(v, 'https://login.github.com/session');
    expect(m).toEqual([{ id: '1', title: 'GitHub', login: 'l', url: 'https://github.com', hasTotp: true }]);
    expect(JSON.stringify(m)).not.toContain('"password"');
  });

  it('sorts several matches by title and never leaks data/recordKeyRaw', () => {
    const v = [r({ id: 'b', title: 'zeta', url: 'https://site.com.br', recordKeyRaw: 'KEY', password: 'pw' }), r({ id: 'a', title: 'Alfa', url: 'app.site.com.br' })];
    const m = matches(v, 'https://www.site.com.br/login');
    expect(m.map((x) => x.id)).toEqual(['a', 'b']);
    expect(JSON.stringify(m)).not.toMatch(/KEY|pw|recordKeyRaw|"data"/);
  });
});

describe('search', () => {
  const v = [r({ id: '1', title: 'GitHub', login: 'ana@x.com', url: 'https://github.com' }), r({ id: '2', title: 'Banco', login: 'BOB', url: 'https://banco.com.br' }), r({ id: '3', title: 'Wi-Fi casa', login: '', url: '' })];
  it('is case-insensitive over title, login and url, without secrets', () => {
    expect(search(v, 'GITHUB').map((x) => x.id)).toEqual(['1']);
    expect(search(v, 'bob').map((x) => x.id)).toEqual(['2']);
    expect(search(v, 'banco.com').map((x) => x.id)).toEqual(['2']);
    expect(JSON.stringify(search(v, ''))).not.toContain('"password"');
  });
  it('returns everything sorted by title for an empty query, at most 50', () => {
    expect(search(v, '  ').map((x) => x.id)).toEqual(['2', '1', '3']);
    const many = Array.from({ length: 80 }, (_, i) => r({ id: String(i), title: `Conta ${String(i).padStart(2, '0')}` }));
    expect(search(many, 'conta')).toHaveLength(50);
  });
});

describe('loadVault', () => {
  it('decrypts (data, rsa and folder-less paths), reduces to fillable types and keeps data + record key in session only', async () => {
    const k = await realKeys();
    const dtos = await Promise.all([
      recordDto(k.dataKey, { id: '1', fields: { login: 'ana', password: 'pw1', url: 'https://github.com', totp: 'otpauth://totp/x?secret=ABC' }, data: { notes: 'nota' } }),
      recordDto(k.dataKey, { id: '2', fields: { login: 'del', password: 'x' }, deletedAt: '2026-01-03T00:00:00.000Z' }),
      recordDto(k.dataKey, { id: '3', type: 'secureNote', data: { notes: 'segredo' } }),
      recordDto(k.dataKey, { id: '4', type: 'bankAccount', fields: { login: 'conta', password: 'pw4', url: 'banco.com.br' } }),
      recordDto(k.dataKey, { id: '5', fields: { login: 'shared', password: 'pw5' }, permission: 'view', wrap: async (key) => [{ via: 'rsa', encKey: await rsaWrapAesKey(k.publicKey, key) }] }),
      recordDto(k.dataKey, { id: '6', fields: { password: 'lost' }, wrap: async () => [{ via: 'data', encKey: 'AAAA' }] }),
      recordDto(k.dataKey, { id: '7', type: 'wifi', fields: { ssid: 'casa', password: 'wifi' } }),
    ]);
    stubFetch({ 'GET /api/vault': () => ({ body: { records: dtos, folders: [] } }) });
    await saveSession({ serverUrl: SERVER, token: 'tok', user, secrets: k.secrets });

    await loadVault(true);
    const s = await loadSession();
    expect(s.vault.map((x) => x.id)).toEqual(['1', '4', '5', '7']);
    const [one, , five] = s.vault;
    expect(one).toMatchObject({ type: 'login', title: '1', login: 'ana', password: 'pw1', url: 'https://github.com', totp: 'otpauth://totp/x?secret=ABC', permission: 'owner', updatedAt: '2026-01-02T00:00:00.000Z' });
    expect(one!.data.notes).toBe('nota');
    expect(five).toMatchObject({ login: 'shared', password: 'pw5', url: '', permission: 'view' });
    // The stored record key really is the key of that record.
    const key = await importAesKey(fromBase64(one!.recordKeyRaw));
    expect((await decryptJson<RecordData>(key, dtos[0]!.encData)).fields.password).toBe('pw1');
    expect(s.lastRefresh).toBeGreaterThan(0);
  });

  it('downloads at most once per REFRESH_MIN_MS unless forced', async () => {
    const k = await realKeys();
    const { fetchMock } = stubFetch({ 'GET /api/vault': () => ({ body: { records: [], folders: [] } }) });
    await saveSession({ serverUrl: SERVER, token: 'tok', user, secrets: k.secrets });
    await loadVault();
    await loadVault();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await loadVault(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('drops the snapshot when the vault was locked while it downloaded', async () => {
    const k = await realKeys();
    const dto = await recordDto(k.dataKey, { id: '1', fields: { password: 'pw' } });
    stubFetch({ 'GET /api/vault': async () => { await lockSession(); return { body: { records: [dto], folders: [] } }; } });
    await saveSession({ serverUrl: SERVER, token: 'tok', user, secrets: k.secrets });
    await loadVault(true);
    const s = await loadSession();
    expect(s.secrets).toBeNull();
    expect(s.vault).toEqual([]);
  });

  it('refuses while locked', async () => {
    await saveSession({ serverUrl: SERVER, token: 'tok', user });
    await expect(loadVault(true)).rejects.toThrow('Cofre bloqueado');
  });
});

describe('saveNewRecord / updateRecordPassword', () => {
  it('creates a login record encrypted with a fresh key wrapped by the data key, then refreshes', async () => {
    const k = await realKeys();
    const { calls } = stubFetch({
      'POST /api/records': () => ({ status: 201, body: { record: { id: 'new-id', createdAt: 'c', updatedAt: 'u' } } }),
      'GET /api/vault': () => ({ body: { records: [], folders: [] } }),
    });
    await saveSession({ serverUrl: SERVER, token: 'tok', user, secrets: k.secrets });

    await expect(saveNewRecord({ url: 'https://github.com/login?next=/x', login: 'ana', password: 'pw', title: '  GitHub  ' })).resolves.toBe('new-id');
    const post = calls.find((c) => c.method === 'POST')!;
    const body = post.body as { type: string; encData: string; encKey: string };
    expect(Object.keys(body).sort()).toEqual(['encData', 'encKey', 'type']);
    expect(body.type).toBe('login');
    const data = await decryptJson<RecordData>(await unwrapAesKey(k.dataKey, body.encKey), body.encData);
    expect(recordDataSchema.safeParse(data).success).toBe(true);
    expect(data).toMatchObject({ type: 'login', title: 'GitHub', fields: { login: 'ana', password: 'pw', url: 'https://github.com' } });
    expect(data.passwordChangedAt.password).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(JSON.stringify(post.body)).not.toContain('pw"');
    expect(calls.at(-1)).toMatchObject({ method: 'GET', url: `${SERVER}/api/vault` });
  });

  it('uses the host as title when none is given', async () => {
    const k = await realKeys();
    const { calls } = stubFetch({ 'POST /api/records': () => ({ status: 201, body: { record: { id: 'n' } } }), 'GET /api/vault': () => ({ body: { records: [], folders: [] } }) });
    await saveSession({ serverUrl: SERVER, token: 'tok', user, secrets: k.secrets });
    await saveNewRecord({ url: 'https://accounts.site.com.br/entrar', login: 'a', password: 'b', title: ' ' });
    const body = calls[0]!.body as { encData: string; encKey: string };
    expect((await decryptJson<RecordData>(await unwrapAesKey(k.dataKey, body.encKey), body.encData)).title).toBe('accounts.site.com.br');
  });

  it('updates the password with the record key, keeping the other fields, after a fresh download', async () => {
    const k = await realKeys();
    const dto = await recordDto(k.dataKey, { id: '1', fields: { login: 'ana', password: 'old', url: 'https://github.com' }, data: { notes: 'nota', passwordChangedAt: { password: '2020-01-01T00:00:00.000Z' } } });
    const { calls } = stubFetch({ 'GET /api/vault': () => ({ body: { records: [dto], folders: [] } }), 'PUT /api/records/1': () => ({ body: { record: { id: '1', updatedAt: 'u' } } }) });
    await saveSession({ serverUrl: SERVER, token: 'tok', user, secrets: k.secrets });
    await loadVault(true);
    const recordKey = await importAesKey(fromBase64((await loadSession()).vault[0]!.recordKeyRaw));

    await updateRecordPassword('1', 'new');
    const putIndex = calls.findIndex((c) => c.method === 'PUT');
    expect(calls[putIndex - 1]).toMatchObject({ method: 'GET' }); // refreshed right before writing
    const body = calls[putIndex]!.body as { encData: string };
    expect(Object.keys(body)).toEqual(['encData']);
    const data = await decryptJson<RecordData>(recordKey, body.encData);
    expect(data.fields).toEqual({ login: 'ana', password: 'new', url: 'https://github.com' });
    expect(data.notes).toBe('nota');
    expect(data.passwordChangedAt.password).not.toBe('2020-01-01T00:00:00.000Z');
  });

  it('refuses read-only and unknown records without writing', async () => {
    const k = await realKeys();
    const dto = await recordDto(k.dataKey, { id: '1', fields: { password: 'old' }, permission: 'view' });
    const { calls } = stubFetch({ 'GET /api/vault': () => ({ body: { records: [dto], folders: [] } }) });
    await saveSession({ serverUrl: SERVER, token: 'tok', user, secrets: k.secrets });
    await expect(updateRecordPassword('1', 'new')).rejects.toThrow(/leitura/);
    await expect(updateRecordPassword('nope', 'new')).rejects.toThrow('Registro não encontrado');
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
  });
});

describe('signIn / unlock (real KDF)', () => {
  const email = 'ana@nexus.com';
  const password = 'senha mestra forte 123';
  let m: Awaited<ReturnType<typeof createAccountMaterial>>;
  let sessionUser: typeof user;
  beforeAll(async () => {
    m = await createAccountMaterial(email, password);
    sessionUser = { id: 'u1', email, name: 'Ana', lockMinutes: 5, kdfSalt: m.kdfSalt, kdfIterations: m.kdfIterations, encDataKey: m.encDataKey, publicKey: m.publicKey, encPrivateKey: m.encPrivateKey };
  }, 30_000);

  const server = async (over: { preIterations?: number; userIterations?: number; meIterations?: number } = {}) => {
    const dto = await recordDto(m.dataKey, { id: '1', fields: { login: email, password: 'site-pw', url: 'https://github.com' } });
    return stubFetch({
      'GET /api/auth/me': (c) =>
        c.headers.authorization === 'Bearer jwt-token'
          ? { body: { user: { ...sessionUser, lockMinutes: 7, kdfIterations: over.meIterations ?? m.kdfIterations } } }
          : { status: 401, body: { error: { code: 'unauthorized', message: 'Sessão expirada. Entre novamente.' } } },
      'POST /api/auth/prelogin': () => ({ body: { kdfSalt: m.kdfSalt, kdfIterations: over.preIterations ?? m.kdfIterations } }),
      'POST /api/auth/login': (c) =>
        (c.body as { authKey: string }).authKey === m.authKey
          ? { body: { user: { ...sessionUser, kdfIterations: over.userIterations ?? m.kdfIterations }, token: 'jwt-token' } }
          : { status: 401, body: { error: { code: 'invalid_credentials', message: 'E-mail ou senha incorretos' } } },
      'GET /api/vault': () => ({ body: { records: [dto], folders: [] } }),
    });
  };

  it('signs in with x-client: extension, stores token + keys in session, loads the vault and never sends the password', async () => {
    const { calls } = await server();
    await signIn(SERVER, email, password);
    const s = await loadSession();
    expect(stateOf(s).status).toBe('unlocked');
    expect(s.token).toBe('jwt-token');
    expect(s.vault.map((x) => x.password)).toEqual(['site-pw']);
    expect(calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual(['POST /api/auth/prelogin', 'POST /api/auth/login', 'GET /api/vault']);
    expect(calls[1]!.headers['x-client']).toBe('extension');
    expect(calls[2]!.headers.authorization).toBe('Bearer jwt-token');
    expect(JSON.stringify(calls)).not.toContain(password);
    expect(Date.now() - s.lastActivity).toBeLessThan(5_000);
    // storage.local keeps only non-secret conveniences.
    const local = Object.fromEntries(getChromeMock().storage.local.data);
    expect(local[EMAIL_KEY]).toBe(email);
    expect(JSON.stringify(local)).not.toMatch(/jwt-token|site-pw|dataKeyRaw/);
  }, 30_000);

  it('rejects unsafe KDF parameters from prelogin before deriving anything', async () => {
    const { calls } = await server({ preIterations: 1000 });
    await expect(signIn(SERVER, email, password)).rejects.toThrow(t.unsafeServerParams);
    expect(calls).toHaveLength(1);
    expect((await loadSession()).token).toBeNull();
  });

  it('rejects unsafe KDF parameters in the returned user and stores nothing', async () => {
    await server({ userIterations: 10_000_000 });
    await expect(signIn(SERVER, email, password)).rejects.toThrow(t.unsafeServerParams);
    const s = await loadSession();
    expect(s.token).toBeNull();
    expect(s.secrets).toBeNull();
  }, 30_000);

  it('surfaces the server message on a wrong password', async () => {
    await server();
    await expect(signIn(SERVER, email, 'errada')).rejects.toThrow('E-mail ou senha incorretos');
  }, 30_000);

  it('unlock re-reads the account and re-derives the keys; a wrong password keeps it locked', async () => {
    await server();
    await saveSession({ serverUrl: SERVER, token: 'jwt-token', user: sessionUser });
    await expect(unlock('errada')).rejects.toThrow('Senha mestra incorreta');
    expect(stateOf(await loadSession()).status).toBe('locked');
    await unlock(password);
    const s = await loadSession();
    expect(stateOf(s)).toMatchObject({ status: 'unlocked', lockMinutes: 7 });
    expect(s.vault).toHaveLength(1);
  }, 30_000);

  it('unlock refuses an account with unsafe KDF parameters', async () => {
    await server({ meIterations: 1 });
    await saveSession({ serverUrl: SERVER, token: 'jwt-token', user: sessionUser });
    await expect(unlock(password)).rejects.toThrow(t.unsafeServerParams);
    expect((await loadSession()).secrets).toBeNull();
  });

  it('unlock with an expired token signs out', async () => {
    await server();
    await saveSession({ serverUrl: SERVER, token: 'expired', user: sessionUser });
    await expect(unlock(password)).rejects.toThrow('Sessão expirada. Entre novamente.');
    expect(stateOf(await loadSession()).status).toBe('signed-out');
  });
});
