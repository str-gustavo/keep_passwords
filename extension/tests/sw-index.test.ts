import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSession, saveSession, stateOf } from '@/sw/session';
import { AUTOLOCK_ALARM, BADGE_COLOR } from '@/shared/constants';
import { addTab, fireAlarm, getChromeMock, resetChromeMock, sendMessageFrom } from './helpers/chrome-mock';
import { r, secrets, user } from './helpers/fixtures';

const SERVER = 'http://localhost:3000';
const vaultList = [r({ id: '1', title: 'GitHub', url: 'https://github.com' }), r({ id: '2', title: 'GitHub 2', url: 'github.com' }), r({ id: '3', url: 'https://other.com' })];

// The worker registers its listeners at import time; reset first, then import a fresh instance.
beforeEach(async () => {
  resetChromeMock();
  vi.resetModules();
  await import('@/sw/index');
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('service worker entry', () => {
  it('restricts storage.session and storage.local to trusted contexts and answers runtime messages asynchronously', async () => {
    await vi.waitFor(() => expect(getChromeMock().storage.local.setAccessLevel).toHaveBeenCalledWith({ accessLevel: 'TRUSTED_CONTEXTS' }));
    expect(getChromeMock().storage.session.setAccessLevel).toHaveBeenCalledWith({ accessLevel: 'TRUSTED_CONTEXTS' });
    await saveSession({ serverUrl: SERVER });
    const res = await sendMessageFrom({ tab: { id: 3, url: 'https://github.com/' } as chrome.tabs.Tab, url: 'https://github.com/' }, { type: 'getState' });
    expect(res).toEqual({ ok: true, data: { status: 'signed-out', serverUrl: SERVER, email: null, lockMinutes: 10, recordCount: 0 } });
  });

  it('creates the once-a-minute autolock alarm on install and on startup', async () => {
    const chromeMock = getChromeMock();
    chromeMock.runtime.onInstalled.dispatch({ reason: 'install' });
    expect(chromeMock.alarms.create).toHaveBeenCalledWith(AUTOLOCK_ALARM, { periodInMinutes: 1 });
    chromeMock.alarms.create.mockClear();
    chromeMock.runtime.onStartup.dispatch();
    expect(chromeMock.alarms.create).toHaveBeenCalledWith(AUTOLOCK_ALARM, { periodInMinutes: 1 });
  });

  it('locks an idle vault when the alarm fires', async () => {
    await saveSession({ serverUrl: SERVER, token: 't', user, secrets, vault: vaultList, lastActivity: Date.now() - 5 * 60_000 });
    await fireAlarm(AUTOLOCK_ALARM);
    const s = await loadSession();
    expect(stateOf(s).status).toBe('locked');
    expect(s.vault).toEqual([]);
  });

  it('badges the active tab with its match count, in Nexus orange', async () => {
    await saveSession({ serverUrl: SERVER, token: 't', user, secrets, vault: vaultList, lastActivity: Date.now() });
    const tab = addTab({ url: 'https://github.com/login' });
    const chromeMock = getChromeMock();
    chromeMock.tabs.onActivated.dispatch({ tabId: tab.id!, windowId: 1 });
    await vi.waitFor(() => expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({ text: '2', tabId: tab.id }));
    expect(chromeMock.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: BADGE_COLOR });
  });

  it('updates the badge when a tab navigates and clears it once locked', async () => {
    await saveSession({ serverUrl: SERVER, token: 't', user, secrets, vault: vaultList, lastActivity: Date.now() });
    const tab = addTab({ url: 'https://other.com/' });
    const chromeMock = getChromeMock();
    chromeMock.tabs.onUpdated.dispatch(tab.id!, { url: 'https://other.com/' }, tab);
    await vi.waitFor(() => expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({ text: '1', tabId: tab.id }));
    await sendMessageFrom({ url: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html' }, { type: 'lock' });
    await vi.waitFor(() => expect(chromeMock.action.setBadgeText).toHaveBeenLastCalledWith({ text: '', tabId: tab.id }));
    await flush();
  });

  it('clears the badge of every tab when the vault auto-locks', async () => {
    await saveSession({ serverUrl: SERVER, token: 't', user, secrets, vault: vaultList, lastActivity: Date.now() - 5 * 60_000 });
    const a = addTab({ url: 'https://github.com/', active: false });
    const b = addTab({ url: 'https://other.com/', active: false });
    const chromeMock = getChromeMock();
    chromeMock.action.setBadgeText.mockClear();
    await fireAlarm(AUTOLOCK_ALARM);
    await vi.waitFor(() => {
      expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({ text: '', tabId: a.id });
      expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({ text: '', tabId: b.id });
    });
  });
});
