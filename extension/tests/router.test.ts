import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handle } from '@/sw/router';
import { loadSession, saveSession, signOutSession, stateOf } from '@/sw/session';
import * as vault from '@/sw/vault';
import { ExtApiError } from '@/sw/api';
import { SERVER_KEY } from '@/shared/constants';
import type { Req } from '@/shared/messages';
import { ExtError } from '@/shared/errors';
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
    expect(ok).toEqual({ ok: true, data: { login: 'ana', password: 'pw', hasTotp: false } });
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
    { type: 'revealPassword', id: '1' }, { type: 'clipboardArm', token: 'q2VtLm5leHVzLnRva2VuMQ==' },
    { type: 'fillGeneratedFromPopup', tabId: 7, password: 'G3r@d4!' },
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

describe('fillGeneratedFromPopup', () => {
  const GENERATED = 'G3r@d4-n0-p0pup!xyz';
  it('sends the generated password to the top frame of a web tab and reports how many fields were filled', async () => {
    const tab = addTab({ url: 'https://site.com.br/cadastro' });
    getChromeMock().tabs.sendMessage.mockResolvedValue({ ok: true, filled: 2 });
    await expect(handle({ type: 'fillGeneratedFromPopup', tabId: tab.id!, password: GENERATED }, popupSender)).resolves.toEqual({ ok: true, data: { filled: 2 } });
    expect(getChromeMock().tabs.sendMessage).toHaveBeenCalledWith(tab.id, { type: 'fillGenerated', password: GENERATED }, { frameId: 0 });
    // Not a stored secret, and never stored either.
    const writes = JSON.stringify([getChromeMock().storage.session.set.mock.calls, getChromeMock().storage.local.set.mock.calls]);
    expect(writes).not.toContain(GENERATED);
  });
  it('is refused for other extension pages (popup.html only)', async () => {
    const tab = addTab({ url: 'https://site.com.br/' });
    const options = { ...popupSender, url: `${popupSender.url!.replace('/popup.html', '/offscreen.html')}` };
    await expect(handle({ type: 'fillGeneratedFromPopup', tabId: tab.id!, password: GENERATED }, options)).resolves.toEqual(INVALID);
    expect(getChromeMock().tabs.sendMessage).not.toHaveBeenCalled();
  });
  it('refuses a tab that is not an http(s) page, and an unknown tab', async () => {
    for (const url of ['chrome://extensions', 'file:///etc/passwd', 'chrome-extension://abc/popup.html', undefined]) {
      const tab = addTab(url === undefined ? {} : { url });
      await expect(handle({ type: 'fillGeneratedFromPopup', tabId: tab.id!, password: GENERATED }, popupSender)).resolves.toEqual({ ok: false, error: 'Não é possível preencher nesta página' });
    }
    await expect(handle({ type: 'fillGeneratedFromPopup', tabId: 999, password: GENERATED }, popupSender)).resolves.toEqual({ ok: false, error: 'Aba não encontrada' });
    expect(getChromeMock().tabs.sendMessage).not.toHaveBeenCalled();
  });
  it('reports a page without the content script, a page without password fields and an odd answer', async () => {
    const tab = addTab({ url: 'https://site.com.br/' });
    const req: Req = { type: 'fillGeneratedFromPopup', tabId: tab.id!, password: GENERATED };
    getChromeMock().tabs.sendMessage.mockRejectedValueOnce(new Error('Could not establish connection. Receiving end does not exist.'));
    await expect(handle(req, popupSender)).resolves.toEqual({ ok: false, error: 'Não foi possível preencher nesta página' });
    getChromeMock().tabs.sendMessage.mockResolvedValueOnce({ ok: false, filled: 0 });
    await expect(handle(req, popupSender)).resolves.toEqual({ ok: false, error: 'Nenhum campo de senha encontrado nesta página' });
    getChromeMock().tabs.sendMessage.mockResolvedValueOnce(undefined);
    await expect(handle(req, popupSender)).resolves.toEqual({ ok: false, error: 'Não foi possível preencher nesta página' });
  });
  it('validates the payload', async () => {
    for (const bad of [{ tabId: 1, password: '' }, { tabId: 1, password: 'x'.repeat(4097) }, { tabId: 1.5, password: 'x' }, { tabId: '1', password: 'x' }, { tabId: 1 }]) {
      await expect(handle({ type: 'fillGeneratedFromPopup', ...bad } as unknown as Req, popupSender)).resolves.toEqual({ ok: false, error: 'Mensagem inválida' });
    }
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
    const pw = res.ok ? (res.data as { password: string }).password : '';
    expect(/^[A-Za-z0-9]{24}$/.test(pw)).toBe(true);
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

const NOT_THIS_SITE = { ok: false, error: 'Registro não corresponde a este site' };
const NOTHING_PENDING = { ok: false, error: 'Nenhuma senha capturada nesta página' };
const LOCKED = { ok: false, error: 'Cofre bloqueado' };
const READ_ONLY = { ok: false, error: 'Você só tem permissão de leitura neste registro.' };
/** The content script of tab `tabId` reports a submitted login form on `url`. */
const submit = (url: string, login: string, password: string, tabId = 7, frameUrl = url) =>
  handle({ type: 'savePending', url, login, password }, pageSender(url, tabId, frameUrl));
const getPending = (url: string, tabId = 7, frameUrl = url) => handle({ type: 'getPending' }, pageSender(url, tabId, frameUrl));
const storedPending = async () => (await loadSession()).pending;

describe('savePending', () => {
  it('stores the capture for the sender tab (origin only), answers nothing secret and does not count as activity', async () => {
    // A page can fire synthetic submits: they must never keep the vault unlocked.
    const before = Date.now() - 30_000;
    await saveSession({ serverUrl: SERVER, token: 't', user, secrets, vault: [github], lastActivity: before });
    await expect(submit('https://github.com/login?return_to=/x', 'bob', 'captured-pw')).resolves.toEqual({ ok: true, data: null });
    expect(await storedPending()).toMatchObject({ url: 'https://github.com', host: 'github.com', login: 'bob', password: 'captured-pw', kind: 'new', existingId: null, tabId: 7 });
    expect((await loadSession()).lastActivity).toBe(before);
  });

  it('caps the lengths of what a page sends', async () => {
    await unlocked();
    const url = 'https://github.com/login';
    const INVALID_MSG = { ok: false, error: 'Mensagem inválida' };
    await expect(submit(url, 'a'.repeat(1025), 'b')).resolves.toEqual(INVALID_MSG);
    await expect(submit(url, 'a', 'b'.repeat(4097))).resolves.toEqual(INVALID_MSG);
    const longUrl = `${url}?q=${'x'.repeat(2048)}`;
    await expect(handle({ type: 'savePending', url: longUrl, login: 'a', password: 'b' }, pageSender(url))).resolves.toEqual(INVALID_MSG);
    expect(await storedPending()).toBeNull();
    await expect(submit(url, 'a'.repeat(1024), 'b'.repeat(4096))).resolves.toEqual({ ok: true, data: null });
    expect(await storedPending()).not.toBeNull();
    await expect(handle({ type: 'saveNew', title: 't'.repeat(501) }, pageSender(url))).resolves.toEqual(INVALID_MSG);
    await expect(handle({ type: 'saveNew', title: 't', url: longUrl, password: 'p' }, popupSender)).resolves.toEqual(INVALID_MSG);
    await expect(handle({ type: 'updatePassword', id: '1', password: 'p'.repeat(4097) }, popupSender)).resolves.toEqual(INVALID_MSG);
    expect(vault.saveNewRecord).not.toHaveBeenCalled();
    expect(vault.updateRecordPassword).not.toHaveBeenCalled();
  });

  it('never stores a capture into a session that was signed out (or switched account) meanwhile', async () => {
    await unlocked();
    // The never-list read happens between the status check and the write: sign out right there.
    getChromeMock().storage.local.get.mockImplementationOnce(async () => {
      await signOutSession();
      return {};
    });
    await submit('https://github.com/login', 'bob', 'captured-pw');
    expect(await storedPending()).toBeNull();

    await unlocked();
    getChromeMock().storage.local.get.mockImplementationOnce(async () => {
      await saveSession({ token: 't2', user: { ...user, id: 'other-user' } });
      return {};
    });
    await submit('https://github.com/login', 'bob', 'captured-pw');
    expect(await storedPending()).toBeNull();
  });

  it('refuses a payload url that is not the sender page (or frame), without storing or touching', async () => {
    const before = Date.now() - 30_000;
    await saveSession({ serverUrl: SERVER, token: 't', user, secrets, vault: [github], lastActivity: before });
    await expect(handle({ type: 'savePending', url: 'https://evil.com/login', login: 'a', password: 'b' }, pageSender('https://github.com/login'))).resolves.toEqual(NOT_THIS_SITE);
    await expect(submit('https://github.com/login', 'a', 'b', 7, 'https://ads.evil.com/frame')).resolves.toEqual(NOT_THIS_SITE);
    await expect(handle({ type: 'savePending', url: 'not a url', login: 'a', password: 'b' }, pageSender('https://github.com/login'))).resolves.toEqual(NOT_THIS_SITE);
    expect(await storedPending()).toBeNull();
    expect((await loadSession()).lastActivity).toBe(before);
  });

  it('is refused from the popup or a sender without a tab', async () => {
    await unlocked();
    await expect(handle({ type: 'savePending', url: 'https://github.com', login: 'a', password: 'b' }, popupSender)).resolves.toEqual(INVALID);
    await expect(handle({ type: 'savePending', url: 'https://github.com', login: 'a', password: 'b' }, { id: MOCK_EXTENSION_ID })).resolves.toEqual(INVALID);
    expect(await storedPending()).toBeNull();
  });

  it('a later submit on the same tab and site supersedes the earlier capture (a mistyped password is not offered)', async () => {
    await unlocked();
    await submit('https://github.com/login', 'ana', 'typo-pw');
    expect(await storedPending()).toMatchObject({ password: 'typo-pw', kind: 'update' });
    await submit('https://github.com/login', 'ana', 'pw'); // the stored one: nothing to offer
    expect(await storedPending()).toBeNull();
    await submit('https://github.com/login', 'ana', 'typo-pw');
    await submit('https://other.com/login', 'ana', 'pw', 8); // another tab's capture replaces it (one slot)
    expect(await storedPending()).toMatchObject({ host: 'other.com', tabId: 8 });
    await submit('https://github.com/login', 'ana', 'pw', 7); // nothing to offer, and not this tab's capture: kept
    expect(await storedPending()).toMatchObject({ host: 'other.com', tabId: 8 });
  });

  it('keeps nothing for credentials already stored, for the Nexus server itself or when signed out', async () => {
    await unlocked();
    await submit('https://github.com/login', 'ana', 'pw');
    await submit(`${SERVER}/entrar`, 'a@b.c', 'master-password');
    expect(await storedPending()).toBeNull();
    await saveSession({ serverUrl: SERVER, token: null, user: null, secrets: null });
    await submit('https://other.com/login', 'a', 'b');
    expect(await storedPending()).toBeNull();
  });
});

describe('getPending', () => {
  it('gives the capturing tab a summary without the password, and does not count as activity', async () => {
    await unlocked();
    await submit('https://github.com/login', 'bob', 'captured-pw');
    const before = Date.now() - 30_000;
    await saveSession({ lastActivity: before });
    const res = await getPending('https://github.com/dashboard');
    expect(res).toEqual({ ok: true, data: { kind: 'new', login: 'bob', host: 'github.com', title: 'github.com', existingId: null, existingTitle: null, locked: false } });
    expect(JSON.stringify(res)).not.toContain('captured-pw');
    expect((await loadSession()).lastActivity).toBe(before);
  });

  it('answers null to another tab, another site, a cross-site frame, and once expired', async () => {
    await unlocked();
    await submit('https://github.com/login', 'bob', 'captured-pw');
    await expect(getPending('https://github.com/', 8)).resolves.toEqual({ ok: true, data: null });
    await expect(getPending('https://evil.com/', 7)).resolves.toEqual({ ok: true, data: null });
    await expect(getPending('https://github.com/', 7, 'https://ads.evil.com/frame')).resolves.toEqual({ ok: true, data: null });
    const p = (await storedPending())!;
    await saveSession({ pending: { ...p, createdAt: Date.now() - 5 * 60_000 - 1 } });
    await expect(getPending('https://github.com/')).resolves.toEqual({ ok: true, data: null });
  });

  it('is refused from the popup', async () => {
    await unlocked();
    await expect(handle({ type: 'getPending' }, popupSender)).resolves.toEqual(INVALID);
  });

  it('respects the never-list, even for a capture already stored', async () => {
    await unlocked();
    await submit('https://github.com/login', 'bob', 'captured-pw');
    await chrome.storage.local.set({ neverHosts: ['github.com'] });
    await expect(getPending('https://github.com/')).resolves.toEqual({ ok: true, data: null });
  });

  it('offers an update with the record title when the login exists with another password', async () => {
    await unlocked();
    await submit('https://github.com/login', 'ana', 'new-pw');
    await expect(getPending('https://github.com/')).resolves.toEqual({ ok: true, data: { kind: 'update', login: 'ana', host: 'github.com', title: 'github.com', existingId: '1', existingTitle: 'GitHub', locked: false } });
  });

  it('while locked: keeps the capture and reports locked; after unlocking it is checked against the vault', async () => {
    await locked();
    await expect(submit('https://github.com/login', 'ana', 'new-pw')).resolves.toEqual({ ok: true, data: null });
    await expect(getPending('https://github.com/')).resolves.toEqual({ ok: true, data: { kind: 'new', login: 'ana', host: 'github.com', title: 'github.com', existingId: null, existingTitle: null, locked: true } });
    await saveSession({ secrets, vault: [github, bank], lastActivity: Date.now() }); // what unlock does
    await expect(getPending('https://github.com/')).resolves.toMatchObject({ ok: true, data: { kind: 'update', existingId: '1', locked: false } });
  });

  it('drops a capture the vault already holds (saved from the popup meanwhile)', async () => {
    await unlocked();
    await submit('https://github.com/login', 'bob', 'captured-pw');
    await saveSession({ vault: [github, r({ id: '5', url: 'https://github.com', login: 'bob', password: 'captured-pw' })] });
    await expect(getPending('https://github.com/')).resolves.toEqual({ ok: true, data: null });
    expect(await storedPending()).toBeNull();
  });
});

describe('saveNew', () => {
  it('from a page saves the tab capture and ignores the credentials in the payload', async () => {
    await unlocked();
    await submit('https://github.com/login', 'bob', 'captured-pw');
    const before = Date.now() - 30_000;
    await saveSession({ lastActivity: before });
    const req: Req = { type: 'saveNew', title: 'Meu GitHub', url: 'https://evil.com', login: 'x', password: 'payload-pw' };
    await expect(handle(req, pageSender('https://github.com/session'))).resolves.toEqual({ ok: true, data: { id: 'new-id' } });
    expect(vault.saveNewRecord).toHaveBeenCalledWith({ url: 'https://github.com', login: 'bob', password: 'captured-pw', title: 'Meu GitHub' });
    expect(await storedPending()).toBeNull();
    expect((await loadSession()).lastActivity).toBeGreaterThan(before);
  });

  it('from a page needs that tab’s capture for that site', async () => {
    await unlocked();
    await submit('https://github.com/login', 'bob', 'captured-pw');
    await expect(handle({ type: 'saveNew', title: 'x' }, pageSender('https://github.com/', 8))).resolves.toEqual(NOTHING_PENDING);
    await expect(handle({ type: 'saveNew', title: 'x' }, pageSender('https://evil.com/', 7))).resolves.toEqual(NOTHING_PENDING);
    await expect(handle({ type: 'saveNew', title: 'x' }, pageSender('https://github.com/', 7, 'https://ads.evil.com/frame'))).resolves.toEqual(NOTHING_PENDING);
    expect(vault.saveNewRecord).not.toHaveBeenCalled();
    expect(await storedPending()).not.toBeNull();
  });

  it('claims the capture before saving: a double click creates one record', async () => {
    await unlocked();
    await submit('https://github.com/login', 'bob', 'captured-pw');
    const req: Req = { type: 'saveNew', title: 'x' };
    const results = await Promise.all([handle(req, pageSender('https://github.com/')), handle(req, pageSender('https://github.com/'))]);
    expect(results).toEqual(expect.arrayContaining([{ ok: true, data: { id: 'new-id' } }, NOTHING_PENDING]));
    await expect(handle(req, pageSender('https://github.com/'))).resolves.toEqual(NOTHING_PENDING);
    expect(vault.saveNewRecord).toHaveBeenCalledTimes(1);
  });

  it('drops a stale "new" capture whose login exists by now instead of duplicating it', async () => {
    await unlocked();
    await submit('https://github.com/login', 'bob', 'captured-pw');
    await saveSession({ vault: [github, r({ id: '5', url: 'https://github.com', login: 'bob', password: 'other' })] });
    await expect(handle({ type: 'saveNew', title: 'x' }, pageSender('https://github.com/'))).resolves.toEqual(NOTHING_PENDING);
    expect(vault.saveNewRecord).not.toHaveBeenCalled();
    expect(await storedPending()).toBeNull();
  });

  it('gives the capture back when saving fails, so the user can retry', async () => {
    await unlocked();
    await submit('https://github.com/login', 'bob', 'captured-pw');
    vi.mocked(vault.saveNewRecord).mockRejectedValueOnce(new ExtError('Servidor indisponível'));
    await expect(handle({ type: 'saveNew', title: 'x' }, pageSender('https://github.com/'))).resolves.toEqual({ ok: false, error: 'Servidor indisponível' });
    expect(await storedPending()).toMatchObject({ login: 'bob', password: 'captured-pw', tabId: 7 });
    await expect(handle({ type: 'saveNew', title: 'x' }, pageSender('https://github.com/'))).resolves.toEqual({ ok: true, data: { id: 'new-id' } });
  });

  it('from the popup uses its payload', async () => {
    await unlocked();
    const req: Req = { type: 'saveNew', url: 'https://banco.com.br/login', login: 'z', password: 'pz', title: 'Banco 2' };
    await expect(handle(req, popupSender)).resolves.toEqual({ ok: true, data: { id: 'new-id' } });
    expect(vault.saveNewRecord).toHaveBeenCalledWith({ url: 'https://banco.com.br/login', login: 'z', password: 'pz', title: 'Banco 2' });
    await expect(handle({ type: 'saveNew', title: 'sem senha' }, popupSender)).resolves.toEqual({ ok: false, error: 'Mensagem inválida' });
  });

  it('is refused while locked, the capture kept', async () => {
    await locked();
    await submit('https://github.com/login', 'bob', 'captured-pw');
    await expect(handle({ type: 'saveNew', title: 'x' }, pageSender('https://github.com/'))).resolves.toEqual(LOCKED);
    expect(vault.saveNewRecord).not.toHaveBeenCalled();
    expect(await storedPending()).not.toBeNull();
  });

  it('rejects malformed payloads', async () => {
    await unlocked();
    const bad = { type: 'saveNew', url: 'https://github.com', login: 1, password: null, title: 'x' } as unknown as Req;
    await expect(handle(bad, popupSender)).resolves.toEqual({ ok: false, error: 'Mensagem inválida' });
    await expect(handle({ type: 'saveNew' } as unknown as Req, pageSender('https://github.com'))).resolves.toEqual({ ok: false, error: 'Mensagem inválida' });
    expect(vault.saveNewRecord).not.toHaveBeenCalled();
  });
});

describe('updatePassword', () => {
  it('from a page writes the captured password (not the payload’s) and clears the capture', async () => {
    await unlocked();
    await submit('https://github.com/login', 'ana', 'new-pw');
    await expect(handle({ type: 'updatePassword', id: '1', password: 'payload-pw' }, pageSender('https://github.com/'))).resolves.toEqual({ ok: true, data: null });
    expect(vault.updateRecordPassword).toHaveBeenCalledWith('1', 'new-pw');
    expect(await storedPending()).toBeNull();
  });

  it('from a page: only its own site’s records, only with a capture of that login', async () => {
    const other = r({ id: '3', title: 'GitHub 2', url: 'https://github.com', login: 'carol', password: 'c' });
    await unlocked([github, bank, other]);
    await expect(handle({ type: 'updatePassword', id: '1' }, pageSender('https://github.com/'))).resolves.toEqual(NOTHING_PENDING);
    await submit('https://github.com/login', 'ana', 'new-pw');
    await expect(handle({ type: 'updatePassword', id: '1' }, pageSender('https://evil.com'))).resolves.toEqual(NOT_THIS_SITE);
    await expect(handle({ type: 'updatePassword', id: '3' }, pageSender('https://github.com/'))).resolves.toEqual(NOTHING_PENDING);
    await expect(handle({ type: 'updatePassword', id: '1' }, pageSender('https://github.com/', 8))).resolves.toEqual(NOTHING_PENDING);
    expect(vault.updateRecordPassword).not.toHaveBeenCalled();
  });

  it('claims the capture before writing: a double click updates once; a capture made moot is dropped', async () => {
    await unlocked();
    await submit('https://github.com/login', 'ana', 'new-pw');
    const req: Req = { type: 'updatePassword', id: '1' };
    const results = await Promise.all([handle(req, pageSender('https://github.com/')), handle(req, pageSender('https://github.com/'))]);
    expect(results).toEqual(expect.arrayContaining([{ ok: true, data: null }, NOTHING_PENDING]));
    expect(vault.updateRecordPassword).toHaveBeenCalledTimes(1);

    await submit('https://github.com/login', 'ana', 'newer-pw');
    await saveSession({ vault: [{ ...github, password: 'newer-pw' }, bank] }); // updated elsewhere meanwhile
    await expect(handle(req, pageSender('https://github.com/'))).resolves.toEqual(NOTHING_PENDING);
    expect(vault.updateRecordPassword).toHaveBeenCalledTimes(1);
    expect(await storedPending()).toBeNull();
  });

  it('gives the capture back when the update fails', async () => {
    await unlocked();
    await submit('https://github.com/login', 'ana', 'new-pw');
    vi.mocked(vault.updateRecordPassword).mockRejectedValueOnce(new ExtError('Servidor indisponível'));
    await expect(handle({ type: 'updatePassword', id: '1' }, pageSender('https://github.com/'))).resolves.toEqual({ ok: false, error: 'Servidor indisponível' });
    expect(await storedPending()).toMatchObject({ login: 'ana', password: 'new-pw' });
  });

  it('from the popup uses its payload', async () => {
    await unlocked();
    await expect(handle({ type: 'updatePassword', id: '2', password: 'n' }, popupSender)).resolves.toEqual({ ok: true, data: null });
    expect(vault.updateRecordPassword).toHaveBeenCalledWith('2', 'n');
    await expect(handle({ type: 'updatePassword', id: '2' }, popupSender)).resolves.toEqual({ ok: false, error: 'Mensagem inválida' });
  });

  it('is refused on a read-only shared record, from the popup and from a page', async () => {
    const shared = r({ id: '9', title: 'Compartilhado', url: 'https://github.com', login: 'ana', password: 'old', permission: 'view' });
    await unlocked([shared]);
    await expect(handle({ type: 'updatePassword', id: '9', password: 'n' }, popupSender)).resolves.toEqual(READ_ONLY);
    await saveSession({ pending: { url: 'https://github.com', host: 'github.com', login: 'ana', password: 'n', createdAt: Date.now(), existingId: '9', kind: 'update', tabId: 7 } });
    await expect(handle({ type: 'updatePassword', id: '9' }, pageSender('https://github.com/'))).resolves.toEqual(READ_ONLY);
    expect(vault.updateRecordPassword).not.toHaveBeenCalled();
  });

  it('is refused while locked', async () => {
    await locked();
    await submit('https://github.com/login', 'ana', 'new-pw');
    await expect(handle({ type: 'updatePassword', id: '1' }, pageSender('https://github.com/'))).resolves.toEqual(LOCKED);
  });
});

describe('discardPending / neverForSite', () => {
  it('discardPending forgets only the capture of the asking tab', async () => {
    await unlocked();
    await submit('https://github.com/login', 'bob', 'captured-pw');
    await expect(handle({ type: 'discardPending' }, pageSender('https://github.com/', 8))).resolves.toEqual({ ok: true, data: null });
    expect(await storedPending()).not.toBeNull();
    await expect(handle({ type: 'discardPending' }, pageSender('https://github.com/', 7))).resolves.toEqual({ ok: true, data: null });
    expect(await storedPending()).toBeNull();
  });

  it('neverForSite stores the registrable domain, drops the capture and suppresses later captures', async () => {
    await unlocked();
    await submit('https://gist.github.com/login', 'bob', 'captured-pw');
    await expect(handle({ type: 'neverForSite', host: 'gist.github.com' }, pageSender('https://gist.github.com/login'))).resolves.toEqual({ ok: true, data: null });
    expect((await chrome.storage.local.get('neverHosts')).neverHosts).toEqual(['github.com']);
    expect(await storedPending()).toBeNull();
    await submit('https://github.com/login', 'bob', 'captured-pw');
    expect(await storedPending()).toBeNull();
    await expect(getPending('https://github.com/')).resolves.toEqual({ ok: true, data: null });
  });

  it('a page can only add its own site; the popup any valid host', async () => {
    await unlocked();
    await expect(handle({ type: 'neverForSite', host: 'banco.com.br' }, pageSender('https://github.com/'))).resolves.toEqual(NOT_THIS_SITE);
    await expect(handle({ type: 'neverForSite', host: 'github.com' }, pageSender('https://github.com/', 7, 'https://ads.evil.com/frame'))).resolves.toEqual(NOT_THIS_SITE);
    expect((await chrome.storage.local.get('neverHosts')).neverHosts).toBeUndefined();
    await expect(handle({ type: 'neverForSite', host: 'https://www.banco.com.br/x' }, popupSender)).resolves.toEqual({ ok: true, data: null });
    await expect(handle({ type: 'neverForSite', host: 'javascript:alert(1)' }, popupSender)).resolves.toMatchObject({ ok: false });
    expect((await chrome.storage.local.get('neverHosts')).neverHosts).toEqual(['banco.com.br']);
  });
});

describe('robustness', () => {
  it('answers unknown or malformed messages with an error', async () => {
    await expect(handle({ type: 'nope' } as unknown as Req, popupSender)).resolves.toEqual({ ok: false, error: 'Mensagem inválida' });
    await expect(handle(null as unknown as Req, popupSender)).resolves.toEqual({ ok: false, error: 'Mensagem inválida' });
  });
});
