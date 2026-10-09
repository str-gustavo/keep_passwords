import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { acceptsFillGenerated, fillGeneratedPassword, installFillGenerated } from '@/content/fill-generated';
import { getChromeMock, MOCK_EXTENSION_ID, resetChromeMock } from './helpers/chrome-mock';

const GENERATED = 'G3r@d4-n0-p0pup!xyz';
const byId = (id: string) => document.getElementById(id) as HTMLInputElement;
const msg = { type: 'fillGenerated', password: GENERATED };

/** What Chrome passes a content script for chrome.tabs.sendMessage from this extension's service worker. */
const swSender: chrome.runtime.MessageSender = { id: MOCK_EXTENSION_ID, origin: `chrome-extension://${MOCK_EXTENSION_ID}` };
const dispatch = (m: unknown, sender: chrome.runtime.MessageSender) => {
  const sendResponse = vi.fn();
  const returned = getChromeMock().runtime.onMessage.dispatch(m, sender, sendResponse);
  return { sendResponse, returned };
};

const LOGIN_FORM = `<form><input type="email" id="u"><input type="password" id="p"></form>`;
const CHANGE_FORM = `<form>
  <input type="password" id="cur" autocomplete="current-password">
  <input type="password" id="new1" autocomplete="new-password">
  <input type="password" id="new2" autocomplete="new-password">
</form>`;
const SIGNUP_FORM = `<form><input type="email" id="su"><input type="password" id="s1"><input type="password" id="s2"></form>`;

let uninstall: (() => void) | null = null;
beforeEach(() => {
  resetChromeMock();
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('data-nexus-app');
});
afterEach(() => {
  uninstall?.();
  uninstall = null;
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('data-nexus-app');
});

describe('acceptsFillGenerated', () => {
  it('accepts only { type: fillGenerated, password } from this extension, without a tab, in the top frame', () => {
    expect(acceptsFillGenerated(msg, swSender, true)).toBe(true);
    expect(acceptsFillGenerated(msg, { ...swSender, url: `chrome-extension://${MOCK_EXTENSION_ID}/sw.js` }, true)).toBe(true);
    expect(acceptsFillGenerated(msg, { ...swSender, id: 'otherextensionidotherextensionid' }, true)).toBe(false);
    expect(acceptsFillGenerated(msg, { ...swSender, tab: { id: 3, url: 'https://evil.com' } as chrome.tabs.Tab }, true)).toBe(false);
    expect(acceptsFillGenerated(msg, { ...swSender, url: 'https://evil.com/' }, true)).toBe(false);
    expect(acceptsFillGenerated(msg, swSender, false)).toBe(false);
    expect(acceptsFillGenerated(msg, undefined, true)).toBe(false);
    expect(acceptsFillGenerated({ type: 'fillGenerated', password: '' }, swSender, true)).toBe(false);
    expect(acceptsFillGenerated({ type: 'fillGenerated', password: 7 }, swSender, true)).toBe(false);
    expect(acceptsFillGenerated({ type: 'fillGenerated', password: 'x'.repeat(4097) }, swSender, true)).toBe(false);
    expect(acceptsFillGenerated({ type: 'fillInto', id: 'r1' }, swSender, true)).toBe(false);
    expect(acceptsFillGenerated(null, swSender, true)).toBe(false);
  });
});

describe('fillGeneratedPassword', () => {
  it('on a password-change form fills only the new-password fields, never the current one', () => {
    document.body.innerHTML = CHANGE_FORM;
    expect(fillGeneratedPassword(document, GENERATED)).toBe(2);
    expect(byId('cur').value).toBe('');
    expect(byId('new1').value).toBe(GENERATED);
    expect(byId('new2').value).toBe(GENERATED);
  });

  it('prefers a sign-up form over an earlier login form, filling every password field of it', () => {
    document.body.innerHTML = LOGIN_FORM + SIGNUP_FORM;
    expect(fillGeneratedPassword(document, GENERATED)).toBe(2);
    expect(byId('s1').value).toBe(GENERATED);
    expect(byId('s2').value).toBe(GENERATED);
    expect(byId('p').value).toBe('');
    expect(byId('su').value).toBe(''); // never a username
  });

  it('without a sign-up or change form, falls back to the first login form (sign-up pages with one password field)', () => {
    document.body.innerHTML = LOGIN_FORM;
    expect(fillGeneratedPassword(document, GENERATED)).toBe(1);
    expect(byId('p').value).toBe(GENERATED);
    expect(byId('u').value).toBe('');
  });

  it('skips disabled and read-only fields and reports 0 when nothing was filled', () => {
    document.body.innerHTML = `<form><input type="password" id="a" autocomplete="new-password" disabled><input type="password" id="b" autocomplete="new-password" readonly></form>`;
    expect(fillGeneratedPassword(document, GENERATED)).toBe(0);
    expect(byId('a').value).toBe('');
    expect(byId('b').value).toBe('');
    document.body.innerHTML = `<p>sem formulário</p>`;
    expect(fillGeneratedPassword(document, GENERATED)).toBe(0);
  });

  it('notifies the page the way a user would (input and change events)', () => {
    document.body.innerHTML = SIGNUP_FORM;
    const seen: string[] = [];
    byId('s1').addEventListener('input', () => seen.push('input'));
    byId('s1').addEventListener('change', () => seen.push('change'));
    fillGeneratedPassword(document, GENERATED);
    expect(seen).toEqual(['input', 'change']);
  });
});

describe('fillGenerated listener', () => {
  it('fills and answers { ok, filled }', () => {
    document.body.innerHTML = CHANGE_FORM;
    uninstall = installFillGenerated(document, () => true);
    const { sendResponse, returned } = dispatch(msg, swSender);
    expect(sendResponse).toHaveBeenCalledWith({ ok: true, filled: 2 });
    expect(returned).toEqual([undefined]);
    expect(byId('new1').value).toBe(GENERATED);
    expect(byId('cur').value).toBe('');
  });

  it('answers { ok: false, filled: 0 } when the page has no password field', () => {
    document.body.innerHTML = `<p>nada aqui</p>`;
    uninstall = installFillGenerated(document, () => true);
    const { sendResponse } = dispatch(msg, swSender);
    expect(sendResponse).toHaveBeenCalledWith({ ok: false, filled: 0 });
  });

  it('is refused for a foreign extension, a sender with a tab (a page or content script), or a sub-frame', () => {
    document.body.innerHTML = SIGNUP_FORM;
    uninstall = installFillGenerated(document, () => true);
    for (const sender of [{ ...swSender, id: 'otherextensionidotherextensionid' }, { ...swSender, tab: { id: 1, url: 'https://evil.com' } as chrome.tabs.Tab }]) {
      const { sendResponse, returned } = dispatch(msg, sender);
      expect(sendResponse).not.toHaveBeenCalled();
      expect(returned).toEqual([undefined]);
    }
    uninstall();
    uninstall = installFillGenerated(document, () => false);
    const { sendResponse } = dispatch(msg, swSender);
    expect(sendResponse).not.toHaveBeenCalled();
    expect(byId('s1').value).toBe('');
    expect(byId('s2').value).toBe('');
  });

  it('leaves other messages to other listeners', () => {
    document.body.innerHTML = SIGNUP_FORM;
    uninstall = installFillGenerated(document, () => true);
    const { sendResponse } = dispatch({ type: 'fillInto', id: 'r1' }, swSender);
    expect(sendResponse).not.toHaveBeenCalled();
    expect(byId('s1').value).toBe('');
  });

  it('defaults to the real top-frame check', () => {
    document.body.innerHTML = SIGNUP_FORM;
    uninstall = installFillGenerated(document);
    const { sendResponse } = dispatch(msg, swSender); // jsdom runs as the top frame
    expect(sendResponse).toHaveBeenCalledWith({ ok: true, filled: 2 });
  });

  it('is not installed in the Nexus Passwords web app itself', () => {
    document.documentElement.setAttribute('data-nexus-app', '1');
    document.body.innerHTML = SIGNUP_FORM;
    uninstall = installFillGenerated(document, () => true);
    expect(getChromeMock().runtime.onMessage.hasListeners()).toBe(false);
    expect(byId('s1').value).toBe('');
  });
});
