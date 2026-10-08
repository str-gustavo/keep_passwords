import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Req } from '@/shared/messages';

vi.mock('@/shared/messages', () => ({ send: vi.fn() }));

import { send } from '@/shared/messages';
import { acceptsFillInto, installFillInto } from '@/content/fill-into';
import { fillFromPopup } from '@/content/actions';
import { shadowOf } from '@/content/host';
import { hideToast } from '@/content/toast';
import { getChromeMock, MOCK_EXTENSION_ID, resetChromeMock } from './helpers/chrome-mock';

const sendMock = vi.mocked(send);
const SECRET = 'S3cr3t!pw#123';
const byId = (id: string) => document.getElementById(id) as HTMLInputElement;
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const sent = (type: Req['type']) => sendMock.mock.calls.map(([r]) => r).filter((r) => r.type === type);
const toastText = () => { const h = document.querySelector('nexus-passwords-toast'); return h ? shadowOf(h)?.textContent ?? '' : ''; };

/** What Chrome passes a content script for chrome.tabs.sendMessage from this extension's service worker. */
const swSender: chrome.runtime.MessageSender = { id: MOCK_EXTENSION_ID, origin: `chrome-extension://${MOCK_EXTENSION_ID}` };
const dispatch = (msg: unknown, sender: chrome.runtime.MessageSender) => {
  const sendResponse = vi.fn();
  const returned = getChromeMock().runtime.onMessage.dispatch(msg, sender, sendResponse);
  return { sendResponse, returned };
};

let uninstall: (() => void) | null = null;
beforeEach(() => {
  resetChromeMock();
  sendMock.mockReset();
  sendMock.mockImplementation(async (req: Req) => {
    if (req.type === 'fillRequest') return { login: 'ana@nexus.com', password: SECRET } as never;
    if (req.type === 'totpFor') throw new Error('Registro sem código 2FA');
    throw new Error(`unexpected ${req.type}`);
  });
  document.body.innerHTML = `<form><input type="search" id="s"><input type="password" id="x"><input type="password" id="y"></form>
    <form><input type="email" id="u"><input type="password" id="p"></form>`;
});
afterEach(() => {
  uninstall?.();
  uninstall = null;
  hideToast();
  document.body.innerHTML = '';
});

describe('acceptsFillInto', () => {
  it('accepts only { type: fillInto, id } from this extension, without a tab, in the top frame', () => {
    expect(acceptsFillInto({ type: 'fillInto', id: 'r1' }, swSender, true)).toBe(true);
    expect(acceptsFillInto({ type: 'fillInto', id: 'r1' }, { ...swSender, id: 'otherextensionidotherextensionid' }, true)).toBe(false);
    expect(acceptsFillInto({ type: 'fillInto', id: 'r1' }, { ...swSender, tab: { id: 3, url: 'https://evil.com' } as chrome.tabs.Tab }, true)).toBe(false);
    expect(acceptsFillInto({ type: 'fillInto', id: 'r1' }, swSender, false)).toBe(false);
    expect(acceptsFillInto({ type: 'fillInto', id: 'r1' }, { ...swSender, url: `chrome-extension://${MOCK_EXTENSION_ID}/sw.js` }, true)).toBe(true);
    expect(acceptsFillInto({ type: 'fillInto', id: 'r1' }, { ...swSender, url: 'https://evil.com/' }, true)).toBe(false);
    expect(acceptsFillInto({ type: 'fillInto', id: 7 }, swSender, true)).toBe(false);
    expect(acceptsFillInto({ type: 'fillInto', id: '' }, swSender, true)).toBe(false);
    expect(acceptsFillInto({ type: 'fillRequest', id: 'r1' }, swSender, true)).toBe(false);
    expect(acceptsFillInto(null, swSender, true)).toBe(false);
  });
});

describe('fillInto listener', () => {
  it('asks fillRequest for the id and fills the first login form', async () => {
    uninstall = installFillInto((id) => fillFromPopup(document, id), () => true);
    const { sendResponse } = dispatch({ type: 'fillInto', id: 'r1' }, swSender);
    expect(sendResponse).toHaveBeenCalledWith({ ok: true });
    await flush();
    expect(sent('fillRequest')).toEqual([{ type: 'fillRequest', id: 'r1' }]);
    expect(byId('u').value).toBe('ana@nexus.com');
    expect(byId('p').value).toBe(SECRET);
    expect(byId('x').value).toBe(''); // the sign-up form above is not touched
    expect(byId('y').value).toBe('');
    expect(toastText()).toBe(''); // no 2FA on this record: silent
  });

  it('shows the TOTP toast when the record has a code', async () => {
    sendMock.mockImplementation(async (req: Req) => {
      if (req.type === 'fillRequest') return { login: 'ana', password: SECRET } as never;
      if (req.type === 'totpFor') return { code: '123456', remaining: 20, period: 30 } as never;
      throw new Error('unexpected');
    });
    uninstall = installFillInto((id) => fillFromPopup(document, id), () => true);
    dispatch({ type: 'fillInto', id: 'r1' }, swSender);
    await flush();
    expect(sent('totpFor')).toEqual([{ type: 'totpFor', id: 'r1' }]);
    expect(toastText()).toContain('123 456');
  });

  it('is refused for a foreign extension, a sender with a tab, or a sub-frame', async () => {
    const onFill = vi.fn();
    uninstall = installFillInto(onFill, () => true);
    for (const sender of [{ ...swSender, id: 'otherextensionidotherextensionid' }, { ...swSender, tab: { id: 1, url: 'https://evil.com' } as chrome.tabs.Tab }]) {
      const { sendResponse, returned } = dispatch({ type: 'fillInto', id: 'r1' }, sender);
      expect(sendResponse).not.toHaveBeenCalled();
      expect(returned).toEqual([undefined]);
    }
    uninstall();
    uninstall = installFillInto(onFill, () => false);
    dispatch({ type: 'fillInto', id: 'r1' }, swSender);
    await flush();
    expect(onFill).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('defaults to the real top-frame check', () => {
    const onFill = vi.fn();
    uninstall = installFillInto(onFill);
    dispatch({ type: 'fillInto', id: 'r1' }, swSender);
    expect(onFill).toHaveBeenCalledWith('r1'); // jsdom runs as the top frame
  });

  it('without a login form it asks for nothing and says so', async () => {
    document.body.innerHTML = `<p>sem formulário</p>`;
    await fillFromPopup(document, 'r1');
    expect(sendMock).not.toHaveBeenCalled();
    expect(toastText()).toContain('Nenhum formulário de login encontrado nesta página.');
  });

  it('reports a refused fill in a notice', async () => {
    sendMock.mockRejectedValue(new Error('Registro não corresponde a este site'));
    await fillFromPopup(document, 'r1');
    expect(byId('p').value).toBe('');
    expect(toastText()).toContain('Registro não corresponde a este site');
  });
});
