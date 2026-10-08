// Service worker entry: wires Chrome events to the router, the auto-lock alarm and the action badge.
// All state lives in chrome.storage.session (see session.ts), so the worker may be stopped and restarted at any time.
import { AUTOLOCK_ALARM, BADGE_COLOR } from '@/shared/constants';
import type { Req, Res } from '@/shared/messages';
import { handle } from './router';
import { checkAutoLock, loadSession, statusOf } from './session';
import { matches } from './vault';

// Secrets live in storage.session: readable only by trusted extension contexts, never by content scripts.
void chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => undefined);
void chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR }).catch(() => undefined);

/** Messages after which the per-tab match count may have changed. */
const CHANGES_BADGE = new Set<string>(['signIn', 'unlock', 'lock', 'signOut', 'setServer', 'refresh', 'saveNew', 'updatePassword']);
const GENERIC_ERROR: Res = { ok: false, error: 'Não foi possível concluir. Tente novamente.' };

// Chrome 116 answers only through sendResponse (`return true` keeps the channel open for the async reply).
chrome.runtime.onMessage.addListener((req: unknown, sender, sendResponse) => {
  handle(req as Req, sender).then(
    (res) => {
      sendResponse(res);
      const type = (req as { type?: unknown } | null)?.type;
      if (res.ok && typeof type === 'string' && CHANGES_BADGE.has(type)) void refreshActiveBadge();
    },
    () => sendResponse(GENERIC_ERROR),
  );
  return true;
});

// ---- auto-lock: once a minute, compare lastActivity with the account's lockMinutes ----
const ensureAlarm = () => chrome.alarms.create(AUTOLOCK_ALARM, { periodInMinutes: 1 });
chrome.runtime.onInstalled.addListener(() => { void ensureAlarm().catch(() => undefined); });
chrome.runtime.onStartup.addListener(() => { void ensureAlarm().catch(() => undefined); });
// Safety net for a worker started some other way (alarms survive worker restarts but not every browser update).
void chrome.alarms.get(AUTOLOCK_ALARM).then((a) => (a ? undefined : ensureAlarm())).catch(() => undefined);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== AUTOLOCK_ALARM) return;
  return checkAutoLock().then((locked) => (locked ? refreshActiveBadge() : undefined)).catch(() => undefined);
});

// ---- badge: number of records matching the tab (nothing while locked) ----
async function setBadge(tabId: number, url: string | undefined): Promise<void> {
  const s = await loadSession();
  const n = statusOf(s) === 'unlocked' && url ? matches(s.vault, url).length : 0;
  await chrome.action.setBadgeText({ text: n ? String(n) : '', tabId });
}
const safeBadge = (tabId: number, url: string | undefined) => setBadge(tabId, url).catch(() => undefined); // the tab may be gone

async function refreshActiveBadge(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }).catch(() => []);
  if (tab?.id !== undefined) await safeBadge(tab.id, tab.url);
}

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void chrome.tabs.get(tabId).then((tab) => safeBadge(tabId, tab.url), () => undefined);
});
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.url !== undefined || info.status === 'complete') void safeBadge(tabId, tab.url);
});
