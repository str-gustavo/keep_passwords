import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handle } from '@/sw/router';
import { clearArmedClipboard, onClipboardAlarm } from '@/sw/clipboard';
import { acceptsOffscreenClear, clearClipboard, installOffscreenClipboard } from '@/offscreen/clipboard';
import { saveSession } from '@/sw/session';
import { CLIPBOARD_ALARM, CLIPBOARD_CLEAR_MS, CLIPBOARD_KEY } from '@/shared/constants';
import type { Req } from '@/shared/messages';
import { MOCK_EXTENSION_ID, MOCK_EXTENSION_ORIGIN, fireAlarm, getChromeMock, offscreenOpen, resetChromeMock, sendMessageFrom } from './helpers/chrome-mock';
import { pageSender, popupSender, r, secrets, user } from './helpers/fixtures';

const TOKEN = 'q2VtLm5leHVzLnRva2VuMQ=='; // 16 bytes, base64
const INVALID = { ok: false, error: 'Origem inválida' };
const SERVER = 'http://localhost:3000';
const unlocked = () => saveSession({ serverUrl: SERVER, token: 't', user, secrets, vault: [r({ id: '1', url: 'https://github.com', password: 'pw' })], lastActivity: Date.now() });
const armed = async () => (await chrome.storage.session.get(CLIPBOARD_KEY))[CLIPBOARD_KEY] as { token: string; at: number } | undefined;

/** What the offscreen document does with the SW's message (the mock loads no document): clears `board`. */
let board = '';
function playOffscreen() {
  getChromeMock().runtime.sendMessage.mockImplementation(async (msg: unknown) => {
    if ((msg as { type?: unknown }).type !== 'offscreenClearClipboard') throw new Error('unexpected message');
    if (!offscreenOpen()) throw new Error('Could not establish connection. Receiving end does not exist.');
    board = '';
    return { ok: true };
  });
}

beforeEach(() => {
  resetChromeMock();
  board = 'S3nh@-copiada';
  playOffscreen();
});
afterEach(() => vi.restoreAllMocks()); // Date.now spies

describe('clipboardArm', () => {
  it('from popup.html stores only a token and a time, and schedules the 30 s alarm', async () => {
    const before = Date.now();
    await expect(handle({ type: 'clipboardArm', token: TOKEN }, popupSender)).resolves.toEqual({ ok: true, data: null });
    const arm = (await armed())!;
    expect(Object.keys(arm).sort()).toEqual(['at', 'token']);
    expect(arm.token).toBe(TOKEN);
    expect(arm.at).toBeGreaterThanOrEqual(before);
    const alarm = await chrome.alarms.get(CLIPBOARD_ALARM);
    expect(alarm?.scheduledTime).toBe(arm.at + CLIPBOARD_CLEAR_MS);
    expect(CLIPBOARD_CLEAR_MS).toBe(30_000);
    expect(JSON.stringify(getChromeMock().storage.local.set.mock.calls)).not.toContain(TOKEN);
  });

  it('is refused for a content script, a foreign extension and other extension pages', async () => {
    await expect(handle({ type: 'clipboardArm', token: TOKEN }, pageSender('https://github.com/login'))).resolves.toEqual(INVALID);
    await expect(handle({ type: 'clipboardArm', token: TOKEN }, { ...popupSender, id: 'otherextensionidotherextensionid' })).resolves.toEqual(INVALID);
    await expect(handle({ type: 'clipboardArm', token: TOKEN }, { ...popupSender, url: `${MOCK_EXTENSION_ORIGIN}/offscreen.html` })).resolves.toEqual(INVALID);
    expect(await armed()).toBeUndefined();
    expect(getChromeMock().alarms.create).not.toHaveBeenCalled();
  });

  it('accepts only a 16-byte base64 token (no clipboard content fits)', async () => {
    for (const token of ['', 'S3nh@-copiada', 'x'.repeat(24), `${TOKEN}A`, 7]) {
      await expect(handle({ type: 'clipboardArm', token } as unknown as Req, popupSender)).resolves.toEqual({ ok: false, error: 'Mensagem inválida' });
    }
    expect(await armed()).toBeUndefined();
  });

  it('works while the vault is locked or signed out (it only schedules a clear)', async () => {
    await saveSession({ serverUrl: SERVER, token: null, user: null });
    await expect(handle({ type: 'clipboardArm', token: TOKEN }, popupSender)).resolves.toEqual({ ok: true, data: null });
    expect((await armed())?.token).toBe(TOKEN);
  });
});

describe('the clipboard-clear alarm', () => {
  beforeEach(async () => {
    vi.resetModules();
    await import('@/sw/index'); // registers the alarm listener on the (reset) mock
  });

  it('clears through an offscreen document: create, message, close', async () => {
    await handle({ type: 'clipboardArm', token: TOKEN }, popupSender);
    vi.spyOn(Date, 'now').mockReturnValue((await armed())!.at + CLIPBOARD_CLEAR_MS);
    await fireAlarm(CLIPBOARD_ALARM);
    const mock = getChromeMock();
    expect(mock.offscreen.createDocument).toHaveBeenCalledWith({
      url: 'offscreen.html',
      reasons: ['CLIPBOARD'],
      justification: 'Limpar a área de transferência após copiar uma senha',
    });
    expect(mock.runtime.sendMessage).toHaveBeenCalledWith({ type: 'offscreenClearClipboard' });
    expect(mock.offscreen.closeDocument).toHaveBeenCalled();
    expect(offscreenOpen()).toBe(false);
    expect(board).toBe('');
    expect(await armed()).toBeUndefined();
  });

  it('does nothing when nothing is armed (a lock already cleared it)', async () => {
    await fireAlarm(CLIPBOARD_ALARM);
    expect(getChromeMock().offscreen.createDocument).not.toHaveBeenCalled();
    expect(board).toBe('S3nh@-copiada');
  });

  it('leaves a newer copy alone: it has its own alarm', async () => {
    await handle({ type: 'clipboardArm', token: TOKEN }, popupSender); // armed just now
    await onClipboardAlarm(Date.now() + 1_000);
    expect(getChromeMock().offscreen.createDocument).not.toHaveBeenCalled();
    expect((await armed())?.token).toBe(TOKEN);
  });

  it('reuses an offscreen document that is already open', async () => {
    await handle({ type: 'clipboardArm', token: TOKEN }, popupSender);
    await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['CLIPBOARD'], justification: 'x' });
    await onClipboardAlarm(Date.now() + CLIPBOARD_CLEAR_MS);
    expect(board).toBe('');
    expect(offscreenOpen()).toBe(false);
  });

  it('never throws, and still closes the document, when the offscreen document does not answer', async () => {
    await handle({ type: 'clipboardArm', token: TOKEN }, popupSender);
    getChromeMock().runtime.sendMessage.mockRejectedValue(new Error('Could not establish connection. Receiving end does not exist.'));
    await expect(onClipboardAlarm(Date.now() + CLIPBOARD_CLEAR_MS)).resolves.toBeUndefined();
    expect(getChromeMock().offscreen.closeDocument).toHaveBeenCalled();
    expect(offscreenOpen()).toBe(false);
  });

  it('never throws when the document cannot be created at all', async () => {
    await handle({ type: 'clipboardArm', token: TOKEN }, popupSender);
    getChromeMock().offscreen.createDocument.mockRejectedValue(new Error('offscreen unavailable'));
    await expect(onClipboardAlarm(Date.now() + CLIPBOARD_CLEAR_MS)).resolves.toBeUndefined();
    expect(board).toBe('S3nh@-copiada');
  });
});

describe('lock and sign-out', () => {
  it('lock clears an armed copy at once', async () => {
    await unlocked();
    await handle({ type: 'clipboardArm', token: TOKEN }, popupSender);
    await expect(handle({ type: 'lock' }, popupSender)).resolves.toMatchObject({ ok: true, data: { status: 'locked' } });
    expect(board).toBe('');
    expect(await armed()).toBeUndefined();
    expect(offscreenOpen()).toBe(false);
  });

  it('signOut clears an armed copy too', async () => {
    await unlocked();
    await handle({ type: 'clipboardArm', token: TOKEN }, popupSender);
    await expect(handle({ type: 'signOut' }, popupSender)).resolves.toMatchObject({ ok: true, data: { status: 'signed-out' } });
    expect(board).toBe('');
    expect(await armed()).toBeUndefined();
  });

  it('a lock with nothing armed leaves the clipboard alone', async () => {
    await unlocked();
    await handle({ type: 'lock' }, popupSender);
    expect(getChromeMock().offscreen.createDocument).not.toHaveBeenCalled();
    expect(board).toBe('S3nh@-copiada');
  });

  it('clearArmedClipboard reports whether it cleared', async () => {
    await expect(clearArmedClipboard()).resolves.toBe(false);
    await handle({ type: 'clipboardArm', token: TOKEN }, popupSender);
    await expect(clearArmedClipboard()).resolves.toBe(true);
  });
});

describe('offscreen document', () => {
  const swSender: chrome.runtime.MessageSender = { id: MOCK_EXTENSION_ID, url: `${MOCK_EXTENSION_ORIGIN}/sw.js`, origin: MOCK_EXTENSION_ORIGIN };
  let clip: { writeText: ReturnType<typeof vi.fn> };
  let uninstall: (() => void) | null = null;

  beforeEach(() => {
    clip = { writeText: vi.fn(async (t: string) => { board = t; }) };
    Object.defineProperty(navigator, 'clipboard', { value: clip, configurable: true });
  });
  afterEach(() => {
    uninstall?.();
    uninstall = null;
  });

  it('accepts offscreenClearClipboard only from this extension, without a tab', () => {
    const msg = { type: 'offscreenClearClipboard' };
    expect(acceptsOffscreenClear(msg, swSender)).toBe(true);
    expect(acceptsOffscreenClear(msg, { id: MOCK_EXTENSION_ID })).toBe(true);
    expect(acceptsOffscreenClear(msg, { ...swSender, id: 'otherextensionidotherextensionid' })).toBe(false);
    expect(acceptsOffscreenClear(msg, { ...swSender, tab: { id: 3, url: 'https://evil.com' } as chrome.tabs.Tab })).toBe(false);
    expect(acceptsOffscreenClear(msg, { ...swSender, url: 'https://evil.com/' })).toBe(false);
    expect(acceptsOffscreenClear(msg, undefined)).toBe(false);
    expect(acceptsOffscreenClear({ type: 'getState' }, swSender)).toBe(false);
    expect(acceptsOffscreenClear(null, swSender)).toBe(false);
  });

  it('writes an empty string and answers { ok: true }', async () => {
    uninstall = installOffscreenClipboard();
    await expect(sendMessageFrom(swSender, { type: 'offscreenClearClipboard' })).resolves.toEqual({ ok: true });
    expect(clip.writeText).toHaveBeenCalledWith('');
    expect(board).toBe('');
  });

  it('ignores a content script and leaves every other message to the service worker', async () => {
    uninstall = installOffscreenClipboard();
    const page = { tab: { id: 3, url: 'https://evil.com/' } as chrome.tabs.Tab, url: 'https://evil.com/' };
    await expect(sendMessageFrom(page, { type: 'offscreenClearClipboard' })).resolves.toBeUndefined();
    const sendResponse = vi.fn();
    const returned = getChromeMock().runtime.onMessage.dispatch({ type: 'getState' }, popupSender, sendResponse);
    expect(returned).toEqual([undefined]);
    expect(sendResponse).not.toHaveBeenCalled();
    expect(clip.writeText).not.toHaveBeenCalled();
    expect(board).toBe('S3nh@-copiada');
  });

  it('falls back to execCommand("copy") when the async clipboard refuses (an offscreen document is never focused)', async () => {
    clip.writeText.mockRejectedValue(new DOMException('Document is not focused.', 'NotAllowedError'));
    let copied: string | null = null;
    const exec = vi.fn((command: string) => {
      if (command !== 'copy') return false;
      const data = new Map<string, string>();
      const event = new Event('copy', { cancelable: true });
      Object.defineProperty(event, 'clipboardData', { value: { setData: (t: string, v: string) => data.set(t, v) } });
      document.dispatchEvent(event);
      copied = event.defaultPrevented ? (data.get('text/plain') ?? null) : (document.getSelection()?.toString() ?? '');
      return true;
    });
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true });
    await expect(clearClipboard(document)).resolves.toBe(true);
    expect(exec).toHaveBeenCalledWith('copy');
    expect(copied).toBe('');
    expect(document.querySelector('textarea')).toBeNull(); // the helper textarea is gone
  });

  it('reports failure when neither way works', async () => {
    clip.writeText.mockRejectedValue(new Error('denied'));
    Object.defineProperty(document, 'execCommand', { value: vi.fn(() => false), configurable: true });
    await expect(clearClipboard(document)).resolves.toBe(false);
  });
});
