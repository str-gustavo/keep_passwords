import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handle } from '@/sw/router';
import { loadSession, saveSession, stateOf } from '@/sw/session';
import * as vault from '@/sw/vault';
import { ExtApiError } from '@/sw/api';
import { SERVER_KEY } from '@/shared/constants';
import type { Req } from '@/shared/messages';
import { MOCK_EXTENSION_ID, addTab, getChromeMock, resetChromeMock } from './helpers/chrome-mock';
import { pageSender, popupSender, r, secrets, user } from './helpers/fixtures';

// Network-free: the vault's network/crypto entry points are mocked; the pure helpers (matches, search) stay real.
vi.mock('@/sw/vault', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/sw/vault')>()),
  signIn: vi.fn(async () => undefined),
  unlock: vi.fn(async () => undefined),
  loadVault: vi.fn(async () => undefined),
  saveNewRecord: vi.fn(async () => 'new-id'),
  updateRecordPassword: vi.fn(async () => undefined),
}));

const SERVER = 'http://localhost:3000';
const github = r({ id: '1', title: 'GitHub', url: 'https://github.com', login: 'ana', password: 'pw', totp: 'otpauth://totp/GitHub:ana?secret=JBSWY3DPEHPK3PXP' });
const bank = r({ id: '2', title: 'Banco', url: 'https://banco.com.br', login: 'bob', password: 'pw2' });
const unlocked = (vaultList = [github, bank]) => saveSession({ serverUrl: SERVER, token: 't', user, secrets, vault: vaultList, lastActivity: Date.now() });
const locked = () => saveSession({ serverUrl: SERVER, token: 't', user, secrets: null, vault: [] });
const INVALID = { ok: false, error: 'Origem inválida' };

beforeEach(() => {
  resetChromeMock();
  vi.clearAllMocks();
});

describe('fillRequest', () => {
  it('fillRequest refuses when the record does not match the sender tab url', async () => {
    // lastActivity: now — requests enforce auto-lock, and a session idle since 1970 would be locked first.
    await saveSession({ serverUrl: 'http://x', token: 't', user, secrets, vault: [r({ id: '1', url: 'https://github.com', login: 'ana', password: 'pw' })], lastActivity: Date.now() });
    const sender = { id: MOCK_EXTENSION_ID, tab: { id: 7, url: 'https://evil.com/login' } } as chrome.runtime.MessageSender;
    await expect(handle({ type: 'fillRequest', id: '1' }, sender)).resolves.toEqual({ ok: false, error: 'Registro não corresponde a este site' });
    const ok = await handle({ type: 'fillRequest', id: '1' }, { id: MOCK_EXTENSION_ID, tab: { id: 7, url: 'https://github.com/login' } } as never);
    expect(ok).toEqual({ ok: true, data: { login: 'ana', password: 'pw' } });
  });

  it('fillRequest refuses senders without a tab (not a content script of a page)', async () => {
    await unlocked();
    await expect(handle({ type: 'fillRequest', id: '1' }, { id: MOCK_EXTENSION_ID })).resolves.toEqual(INVALID);
    await expect(handle({ type: 'fillRequest', id: '1' }, popupSender)).resolves.toEqual(INVALID);
  });

  it('refuses messages that do not come from this extension', async () => {
    await unlocked();
    const foreign = { ...pageSender('https://github.com/login'), id: 'otherextensionidotherextensionid' };
    await expect(handle({ type: 'fillRequest', id: '1' }, foreign)).resolves.toEqual(INVALID);
    await expect(handle({ type: 'getState' }, {})).resolves.toEqual(INVALID);
  });

  it('refuses a frame from another site embedded in a matching page', async () => {
    await unlocked();
    const iframe = pageSender('https://github.com/login', 7, 'https://ads.evil.com/frame');
    await expect(handle({ type: 'fillRequest', id: '1' }, iframe)).resolves.toEqual({ ok: false, error: 'Registro não corresponde a este site' });
  });

  it('refuses a frame of the record site embedded in a tab on another site', async () => {
    await unlocked();
    const framed = pageSender('https://evil.com/', 7, 'https://github.com/login');
    await expect(handle({ type: 'fillRequest', id: '1' }, framed)).resolves.toEqual({ ok: false, error: 'Registro não corresponde a este site' });
  });

  it('refuses while locked and for unknown records', async () => {
    await locked();
    await expect(handle({ type: 'fillRequest', id: '1' }, pageSender('https://github.com/login'))).resolves.toEqual({ ok: false, error: 'Cofre bloqueado' });
    await unlocked();
    await expect(handle({ type: 'fillRequest', id: 'nope' }, pageSender('https://github.com/login'))).resolves.toEqual({ ok: false, error: 'Registro não encontrado' });
  });

  it('counts as activity (touch) once validated; a refused request does not', async () => {
    const before = Date.now() - 30_000; // lockMinutes is 1: still active
    await saveSession({ serverUrl: SERVER, token: 't', user, secrets, vault: [github], lastActivity: before });
    await handle({ type: 'fillRequest', id: '1' }, pageSender('https://evil.com/login'));
    expect((await loadSession()).lastActivity).toBe(before);
    await handle({ type: 'fillRequest', id: '1' }, pageSender('https://github.com/login'));
    expect((await loadSession()).lastActivity).toBeGreaterThan(before);
  });
});

describe('request-time auto-lock', () => {
  it('an idle vault is locked before the request is served, even without the alarm', async () => {
    await saveSession({ serverUrl: SERVER, token: 't', user, secrets, vault: [github], lastActivity: Date.now() - 2 * 60_000 }); // 2 × lockMinutes
    await expect(handle({ type: 'fillRequest', id: '1' }, pageSender('https://github.com/login'))).resolves.toEqual({ ok: false, error: 'Cofre bloqueado' });
    await expect(handle({ type: 'getState' }, pageSender('https://github.com/login'))).resolves.toMatchObject({ ok: true, data: { status: 'locked', recordCount: 0 } });
    const s = await loadSession();
    expect(s.secrets).toBeNull();
    expect(s.vault).toEqual([]);
  });

  it('a popup request on an expired session locks instead of extending it', async () => {
    await saveSession({ serverUrl: SERVER, token: 't', user, secrets, vault: [github], lastActivity: Date.now() - 2 * 60_000 });
    await expect(handle({ type: 'search', query: '' }, popupSender)).resolves.toEqual({ ok: false, error: 'Cofre bloqueado' });
    expect(stateOf(await loadSession()).status).toBe('locked');
  });
});

describe('matchesForUrl', () => {
  it('matchesForUrl never includes passwords and uses the sender tab url, not the payload', async () => {
    await unlocked();
    const evil = await handle({ type: 'matchesForUrl', url: 'https://github.com' }, pageSender('https://evil.com/login'));
    expect(evil).toEqual({ ok: true, data: [] });
    const own = await handle({ type: 'matchesForUrl', url: 'https://evil.com' }, pageSender('https://github.com/login'));
    expect(own).toEqual({ ok: true, data: [{ id: '1', title: 'GitHub', login: 'ana', url: 'https://github.com', hasTotp: true }] });
    expect(JSON.stringify(own)).not.toMatch(/"password"|pw|otpauth|recordKeyRaw/);
  });

  it('from a page does not extend the session', async () => {
    const before = Date.now() - 30_000;
    await saveSession({ serverUrl: SERVER, token: 't', user, secrets, vault: [github], lastActivity: before });
    await handle({ type: 'matchesForUrl', url: 'https://github.com' }, pageSender('https://github.com/login'));
    expect((await loadSession()).lastActivity).toBe(before);
  });

  it('uses the payload url only for the popup (an extension page)', async () => {
    await unlocked();
    const res = await handle({ type: 'matchesForUrl', url: 'https://banco.com.br/login' }, popupSender);
    expect(res).toEqual({ ok: true, data: [{ id: '2', title: 'Banco', login: 'bob', url: 'https://banco.com.br', hasTotp: false }] });
  });

  it('refuses a sender that is neither a page nor an extension page', async () => {
    await unlocked();
    await expect(handle({ type: 'matchesForUrl', url: 'https://github.com' }, { id: MOCK_EXTENSION_ID })).resolves.toEqual(INVALID);
  });

  it('filters by the frame too: a cross-site iframe sees nothing', async () => {
    await unlocked();
    const iframe = pageSender('https://github.com/login', 7, 'https://ads.evil.com/frame');
    await expect(handle({ type: 'matchesForUrl', url: 'https://github.com' }, iframe)).resolves.toEqual({ ok: true, data: [] });
  });
});

describe('getState', () => {
  it('getState while locked exposes no secrets', async () => {
    await saveSession({ serverUrl: SERVER, token: 'secret-token', user, secrets: null, vault: [] });
    const res = await handle({ type: 'getState' }, pageSender('https://github.com'));
    expect(res).toEqual({ ok: true, data: { status: 'locked', serverUrl: SERVER, email: 'a@b.c', lockMinutes: 1, recordCount: 0 } });
    expect(JSON.stringify(res)).not.toMatch(/secret-token|encDataKey|kdfSalt/);
  });

  it('while unlocked carries only a count; from a page it does not count as activity, from the popup it does', async () => {
    const before = Date.now() - 30_000;
    await saveSession({ serverUrl: SERVER, token: 't', user, secrets, vault: [github, bank], lastActivity: before });
    const res = await handle({ type: 'getState' }, pageSender('https://github.com'));
    expect(res).toEqual({ ok: true, data: { status: 'unlocked', serverUrl: SERVER, email: 'a@b.c', lockMinutes: 1, recordCount: 2 } });
    expect((await loadSession()).lastActivity).toBe(before);
    await handle({ type: 'getState' }, popupSender);
    expect((await loadSession()).lastActivity).toBeGreaterThan(before);
  });
});

describe('revealPassword', () => {
  it('gives popup.html one record password', async () => {
    await unlocked();
    await expect(handle({ type: 'revealPassword', id: '2' }, popupSender)).resolves.toEqual({ ok: true, data: { password: 'pw2' } });
  });
  it('is refused for a content script, even on the matching site', async () => {
    await unlocked();
    await expect(handle({ type: 'revealPassword', id: '1' }, pageSender('https://github.com/login'))).resolves.toEqual(INVALID);
  });
  it('is refused for a foreign sender id and for other extension pages', async () => {
    await unlocked();
    await expect(handle({ type: 'revealPassword', id: '1' }, { ...popupSender, id: 'otherextensionidotherextensionid' })).resolves.toEqual(INVALID);
    const options = { ...popupSender, url: `${popupSender.url!.replace('/popup.html', '/options.html')}` };
    await expect(handle({ type: 'revealPassword', id: '1' }, options)).resolves.toEqual(INVALID);
  });
  it('is refused while locked', async () => {
    await locked();
    await expect(handle({ type: 'revealPassword', id: '1' }, popupSender)).resolves.toEqual({ ok: false, error: 'Cofre bloqueado' });
  });
});

describe('popup-only messages', () => {
  const popupOnly: Req[] = [
    { type: 'setServer', url: 'https://cofre.example.com' }, { type: 'signIn', email: 'a@b.c', password: 'x' }, { type: 'unlock', password: 'x' },
    { type: 'signOut' }, { type: 'refresh' }, { type: 'search', query: '' }, { type: 'fillFromPopup', id: '1', tabId: 7 },
    { type: 'revealPassword', id: '1' },
  ];
  it.each(popupOnly)('$type is refused from a content script', async (req) => {
    await unlocked();
    await expect(handle(req, pageSender('https://github.com/login'))).resolves.toEqual(INVALID);
    expect(vault.signIn).not.toHaveBeenCalled();
    expect(vault.unlock).not.toHaveBeenCalled();
    expect(stateOf(await loadSession()).status).toBe('unlocked');
  });
});

describe('search', () => {
  it('returns items without secrets, case-insensitive', async () => {
    await unlocked();
    const res = await handle({ type: 'search', query: 'BANCO' }, popupSender);
    expect(res).toEqual({ ok: true, data: [{ id: '2', title: 'Banco', login: 'bob', url: 'https://banco.com.br', hasTotp: false }] });
  });
  it('refuses while locked', async () => {
    await locked();
    await expect(handle({ type: 'search', query: '' }, popupSender)).resolves.toEqual({ ok: false, error: 'Cofre bloqueado' });
  });
});

describe('totpFor', () => {
  it('gives the popup the current code', async () => {
    await unlocked();
    const res = await handle({ type: 'totpFor', id: '1' }, popupSender);
    expect(res).toMatchObject({ ok: true, data: { code: expect.stringMatching(/^\d{6}$/), period: 30 } });
  });
  it('gives a page the code only for its own records', async () => {
    await unlocked();
    await expect(handle({ type: 'totpFor', id: '1' }, pageSender('https://evil.com'))).resolves.toEqual({ ok: false, error: 'Registro não corresponde a este site' });
    await expect(handle({ type: 'totpFor', id: '1' }, pageSender('https://github.com/login'))).resolves.toMatchObject({ ok: true });
  });
  it('fails cleanly for a record without TOTP', async () => {
    await unlocked();
    await expect(handle({ type: 'totpFor', id: '2' }, popupSender)).resolves.toEqual({ ok: false, error: 'Registro sem código 2FA' });
  });
});

describe('fillFromPopup', () => {
  it('validates the tab url and sends only the record id to that tab top frame (no secret)', async () => {
    await unlocked();
    const tab = addTab({ url: 'https://github.com/login' });
    const res = await handle({ type: 'fillFromPopup', id: '1', tabId: tab.id! }, popupSender);
    expect(res).toEqual({ ok: true, data: null });
    expect(getChromeMock().tabs.sendMessage).toHaveBeenCalledWith(tab.id, { type: 'fillInto', id: '1' }, { frameId: 0 });
    expect(JSON.stringify(getChromeMock().tabs.sendMessage.mock.calls)).not.toMatch(/pw|ana/);
  });
  it('refuses a tab on another site', async () => {
    await unlocked();
    const tab = addTab({ url: 'https://evil.com/' });
    await expect(handle({ type: 'fillFromPopup', id: '1', tabId: tab.id! }, popupSender)).resolves.toEqual({ ok: false, error: 'Registro não corresponde a este site' });
    expect(getChromeMock().tabs.sendMessage).not.toHaveBeenCalled();
  });
  it('reports a page without the content script', async () => {
    await unlocked();
    const tab = addTab({ url: 'https://github.com/login' });
    getChromeMock().tabs.sendMessage.mockRejectedValueOnce(new Error('Could not establish connection. Receiving end does not exist.'));
    await expect(handle({ type: 'fillFromPopup', id: '1', tabId: tab.id! }, popupSender)).resolves.toEqual({ ok: false, error: 'Não foi possível preencher nesta página' });
  });
});

describe('openPopup / openApp / generatePassword / lock', () => {
  it('openPopup reports whether Chrome opened it', async () => {
    await locked();
    await expect(handle({ type: 'openPopup' }, pageSender('https://github.com'))).resolves.toEqual({ ok: true, data: { opened: true } });
    getChromeMock().action.openPopup.mockRejectedValueOnce(new Error('no user gesture'));
    await expect(handle({ type: 'openPopup' }, pageSender('https://github.com'))).resolves.toEqual({ ok: true, data: { opened: false } });
  });
  it('openApp opens the configured server vault', async () => {
    await locked();
    await expect(handle({ type: 'openApp' }, pageSender('https://github.com'))).resolves.toEqual({ ok: true, data: null });
    expect(getChromeMock().tabs.create).toHaveBeenCalledWith({ url: `${SERVER}/cofre` });
  });
  it('generatePassword uses the app generator', async () => {
    const res = await handle({ type: 'generatePassword', opts: { length: 24, upper: true, lower: true, digits: true, symbols: false, excludeAmbiguous: true } }, pageSender('https://x.com'));
    expect(res.ok && typeof res.data === 'string' && /^[A-Za-z0-9]{24}$/.test(res.data)).toBe(true);
  });
  it('lock wipes keys and vault', async () => {
    await unlocked();
    await expect(handle({ type: 'lock' }, popupSender)).resolves.toMatchObject({ ok: true, data: { status: 'locked', recordCount: 0 } });
    expect((await loadSession()).vault).toEqual([]);
  });
});

describe('server and account', () => {
  it('setServer validates, stores the origin and clears the session when it changes', async () => {
    await unlocked();
    await expect(handle({ type: 'setServer', url: 'http://cofre.example.com' }, popupSender)).resolves.toMatchObject({ ok: false });
    await expect(handle({ type: 'setServer', url: 'javascript:alert(1)' }, popupSender)).resolves.toMatchObject({ ok: false });
    expect(stateOf(await loadSession()).status).toBe('unlocked');
    await expect(handle({ type: 'setServer', url: ' https://Cofre.Example.com/entrar ' }, popupSender)).resolves.toMatchObject({ ok: true, data: { status: 'signed-out', serverUrl: 'https://cofre.example.com' } });
    const s = await loadSession();
    expect(s).toMatchObject({ token: null, user: null, secrets: null, vault: [] });
    expect((await chrome.storage.local.get(SERVER_KEY))[SERVER_KEY]).toBe('https://cofre.example.com');
  });

  it('setServer with the same origin keeps the session', async () => {
    await unlocked();
    await expect(handle({ type: 'setServer', url: `${SERVER}/` }, popupSender)).resolves.toMatchObject({ ok: true, data: { status: 'unlocked' } });
  });

  it('signIn calls the vault with the configured server and surfaces server errors (429)', async () => {
    await saveSession({ serverUrl: SERVER });
    await expect(handle({ type: 'signIn', email: 'a@b.c', password: 'x' }, popupSender)).resolves.toMatchObject({ ok: true });
    expect(vault.signIn).toHaveBeenCalledWith(SERVER, 'a@b.c', 'x');
    vi.mocked(vault.signIn).mockRejectedValueOnce(new ExtApiError(429, 'rate_limited', 'Muitas tentativas. Aguarde um minuto.'));
    await expect(handle({ type: 'signIn', email: 'a@b.c', password: 'x' }, popupSender)).resolves.toEqual({ ok: false, error: 'Muitas tentativas. Aguarde um minuto.' });
  });

  it('never echoes unexpected internal errors', async () => {
    await saveSession({ serverUrl: SERVER });
    vi.mocked(vault.signIn).mockRejectedValueOnce(new Error('internal detail with secret'));
    const res = await handle({ type: 'signIn', email: 'a@b.c', password: 'x' }, popupSender);
    expect(res).toEqual({ ok: false, error: 'Não foi possível concluir. Tente novamente.' });
  });

  it('signIn without a server asks for one', async () => {
    await expect(handle({ type: 'signIn', email: 'a@b.c', password: 'x' }, popupSender)).resolves.toMatchObject({ ok: false });
    expect(vault.signIn).not.toHaveBeenCalled();
  });

  it('signOut forgets the account but keeps the server', async () => {
    await unlocked();
    await expect(handle({ type: 'signOut' }, popupSender)).resolves.toMatchObject({ ok: true, data: { status: 'signed-out', serverUrl: SERVER } });
    expect(await loadSession()).toMatchObject({ token: null, user: null, secrets: null, vault: [] });
  });

  it('refresh downloads with the 30 s minimum unless force is set', async () => {
    await unlocked();
    await handle({ type: 'refresh' }, popupSender);
    expect(vault.loadVault).toHaveBeenLastCalledWith(false);
    await handle({ type: 'refresh', force: true }, popupSender);
    expect(vault.loadVault).toHaveBeenLastCalledWith(true);
    await expect(handle({ type: 'refresh', force: 'yes' } as unknown as Req, popupSender)).resolves.toEqual({ ok: false, error: 'Mensagem inválida' });
  });
});

describe('saveNew / updatePassword', () => {
  it('a page can only create a record for its own site', async () => {
    await unlocked();
    const req: Req = { type: 'saveNew', url: 'https://github.com/login', login: 'a', password: 'b', title: 'GitHub' };
    await expect(handle(req, pageSender('https://evil.com'))).resolves.toEqual({ ok: false, error: 'Registro não corresponde a este site' });
    await expect(handle(req, pageSender('https://github.com/session'))).resolves.toEqual({ ok: true, data: { id: 'new-id' } });
    expect(vault.saveNewRecord).toHaveBeenCalledWith({ url: 'https://github.com/login', login: 'a', password: 'b', title: 'GitHub' });
  });
  it('a page can only update its own records', async () => {
    await unlocked();
    await expect(handle({ type: 'updatePassword', id: '1', password: 'n' }, pageSender('https://evil.com'))).resolves.toEqual({ ok: false, error: 'Registro não corresponde a este site' });
    await expect(handle({ type: 'updatePassword', id: '1', password: 'n' }, pageSender('https://github.com'))).resolves.toEqual({ ok: true, data: null });
    expect(vault.updateRecordPassword).toHaveBeenCalledWith('1', 'n');
  });
  it('rejects malformed payloads', async () => {
    await unlocked();
    const bad = { type: 'saveNew', url: 'https://github.com', login: 1, password: null, title: 'x' } as unknown as Req;
    await expect(handle(bad, popupSender)).resolves.toEqual({ ok: false, error: 'Mensagem inválida' });
    expect(vault.saveNewRecord).not.toHaveBeenCalled();
  });
});

describe('robustness', () => {
  it('answers unknown or malformed messages with an error', async () => {
    await expect(handle({ type: 'nope' } as unknown as Req, popupSender)).resolves.toEqual({ ok: false, error: 'Mensagem inválida' });
    await expect(handle(null as unknown as Req, popupSender)).resolves.toEqual({ ok: false, error: 'Mensagem inválida' });
  });
});
