import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NO_RECEIVER_ERROR, addTab, fireAlarm, getChromeMock, resetChromeMock, sendMessageFrom } from './helpers/chrome-mock';

beforeEach(() => {
  resetChromeMock();
});

describe('chrome mock: storage', () => {
  it('round-trips chrome.storage.session set/get', async () => {
    await chrome.storage.session.set({ token: 'abc', user: { email: 'a@b.c' } });
    expect(await chrome.storage.session.get('token')).toEqual({ token: 'abc' });
    expect(await chrome.storage.session.get(['token', 'user', 'missing'])).toEqual({ token: 'abc', user: { email: 'a@b.c' } });
    expect(await chrome.storage.session.get({ missing: 5, token: 'x' })).toEqual({ missing: 5, token: 'abc' });
    expect(await chrome.storage.session.get(null)).toEqual({ token: 'abc', user: { email: 'a@b.c' } });
  });

  it('keeps session and local apart and supports remove/clear', async () => {
    await chrome.storage.session.set({ a: 1, b: 2 });
    await chrome.storage.local.set({ a: 'local' });
    await chrome.storage.session.remove('a');
    expect(await chrome.storage.session.get(null)).toEqual({ b: 2 });
    await chrome.storage.session.clear();
    expect(await chrome.storage.session.get(null)).toEqual({});
    expect(await chrome.storage.local.get('a')).toEqual({ a: 'local' });
  });

  it('stores JSON-serialized copies, like Chrome', async () => {
    const value = { list: [1, 2], bytes: new Uint8Array([7]) };
    await chrome.storage.local.set({ value });
    value.list.push(3);
    const { value: stored } = await chrome.storage.local.get('value');
    expect(stored).toEqual({ list: [1, 2], bytes: { 0: 7 } });
  });

  it('fires onChanged with old and new values', async () => {
    const listener = vi.fn();
    chrome.storage.onChanged.addListener(listener);
    await chrome.storage.session.set({ k: 1 });
    await chrome.storage.session.set({ k: 2 });
    expect(listener).toHaveBeenLastCalledWith({ k: { oldValue: 1, newValue: 2 } }, 'session');
  });

  it('accepts setAccessLevel as a no-op', async () => {
    await expect(chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })).resolves.toBeUndefined();
  });
});

describe('chrome mock: runtime messaging', () => {
  it('rejects when nobody listens', async () => {
    await expect(chrome.runtime.sendMessage({ type: 'getState' })).rejects.toThrow(NO_RECEIVER_ERROR);
  });

  it('delivers a synchronous sendResponse', async () => {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      sendResponse({ echo: msg });
    });
    expect(await chrome.runtime.sendMessage({ type: 'ping' })).toEqual({ echo: { type: 'ping' } });
  });

  it('supports the `return true` + async sendResponse pattern and passes the sender', async () => {
    chrome.runtime.onMessage.addListener((_msg, sender, sendResponse) => {
      setTimeout(() => sendResponse({ from: sender.tab?.url ?? sender.url }), 0);
      return true;
    });
    expect(await chrome.runtime.sendMessage({ type: 'x' })).toEqual({ from: `chrome-extension://${chrome.runtime.id}/popup.html` });
    const tab = addTab({ url: 'https://site.example/login' });
    expect(await sendMessageFrom({ tab, frameId: 0 }, { type: 'x' })).toEqual({ from: 'https://site.example/login' });
  });

  it('ignores a returned Promise, as Chrome 116 does', async () => {
    chrome.runtime.onMessage.addListener((async () => ({ late: true })) as unknown as Parameters<typeof chrome.runtime.onMessage.addListener>[0]);
    expect(await chrome.runtime.sendMessage({ type: 'x' })).toBeUndefined();
  });
});

describe('chrome mock: alarms, tabs, permissions, reset', () => {
  it('creates, fires and clears alarms', async () => {
    const onAlarm = vi.fn();
    chrome.alarms.onAlarm.addListener(onAlarm);
    await chrome.alarms.create('autolock', { periodInMinutes: 1 });
    expect(await chrome.alarms.get('autolock')).toMatchObject({ name: 'autolock', periodInMinutes: 1 });
    await fireAlarm('autolock');
    expect(onAlarm).toHaveBeenCalledWith(expect.objectContaining({ name: 'autolock' }));
    expect(await chrome.alarms.clear('autolock')).toBe(true);
    expect(await chrome.alarms.getAll()).toEqual([]);
  });

  it('queries the active tab and rejects unknown tab ids', async () => {
    addTab({ url: 'https://a.example/' });
    const b = addTab({ url: 'https://b.example/' });
    expect(await chrome.tabs.query({ active: true, currentWindow: true })).toEqual([b]);
    await expect(chrome.tabs.get(999)).rejects.toThrow('No tab with id: 999.');
    const created = await chrome.tabs.create({ url: 'https://c.example/', active: false });
    expect(await chrome.tabs.get(created.id!)).toMatchObject({ url: 'https://c.example/', active: false });
  });

  it('grants requested origins and knows the manifest permissions', async () => {
    expect(await chrome.permissions.contains({ origins: ['https://x.example/*'] })).toBe(false);
    expect(await chrome.permissions.request({ origins: ['https://x.example/*'] })).toBe(true);
    expect(await chrome.permissions.contains({ origins: ['https://x.example/*'], permissions: ['storage'] })).toBe(true);
  });

  it('resets state, listeners, call history and overrides in place', async () => {
    const mock = getChromeMock();
    await chrome.storage.session.set({ a: 1 });
    chrome.runtime.onMessage.addListener(() => undefined);
    mock.tabs.sendMessage.mockResolvedValue('overridden');
    await chrome.action.setBadgeText({ text: '3' });

    resetChromeMock();

    expect(globalThis.chrome).toBe(mock);
    expect(await chrome.storage.session.get(null)).toEqual({});
    expect(chrome.runtime.onMessage.hasListeners()).toBe(false);
    expect(await chrome.tabs.sendMessage(1, {})).toBeUndefined();
    expect(mock.action.setBadgeText).not.toHaveBeenCalled();
  });
});
