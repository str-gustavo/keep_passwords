// Service worker entry: wires Chrome events to the router, the auto-lock alarm and the action badge.
// All state lives in chrome.storage.session (see session.ts), so the worker may be stopped and restarted at any time.
import { AUTOLOCK_ALARM, BADGE_COLOR, CLIPBOARD_ALARM, SESSION_KEY } from '@/shared/constants';
import type { Req, Res } from '@/shared/messages';
import { onClipboardAlarm } from './clipboard';
import { purgeExpiredPending } from './pending';
import { handle } from './router';
import { checkAutoLock, loadSession, statusOf } from './session';
import { matches } from './vault';

/**
 * storage.session holds the secrets: trusted contexts only (the default, made explicit). storage.local holds the server
 * mirror: also restricted where Chrome supports it, so a content script cannot plant another server (session.ts trusts
 * the mirror only with host permission anyway).
 */
async function hardenStorage(): Promise<void> {
  try { await chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }); } catch { /* best effort */ }
  try { await chrome.storage.local.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' }); } catch { /* unsupported for local */ }
}
void hardenStorage();
void chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR }).catch(() => undefined);

/** Messages after which the active tab's match count may have changed. */
const CHANGES_BADGE = new Set<Req['type']>(['signIn', 'unlock', 'lock', 'signOut', 'setServer', 'refresh', 'saveNew', 'updatePassword']);
const GENERIC_ERROR: Res = { ok: false, error: 'Não foi possível concluir. Tente novamente.' };

// Chrome 116 answers only through sendResponse (`return true` keeps the channel open for the async reply).
chrome.runtime.onMessage.addListener((req: unknown, sender, sendResponse) => {
  handle(req as Req, sender).then(
    (res) => {
      sendResponse(res);
      const type = (req as { type?: unknown } | null)?.type;
      if (res.ok && CHANGES_BADGE.has(type as Req['type'])) void refreshActiveBadge();
    },
    () => sendResponse(GENERIC_ERROR),
  );
  return true;
});

// ---- auto-lock: once a minute, compare lastActivity with the account's lockMinutes (and forget expired captures) ----
const ensureAlarm = () => chrome.alarms.create(AUTOLOCK_ALARM, { periodInMinutes: 1 });
const onBoot = () => { void hardenStorage(); void ensureAlarm().catch(() => undefined); };
chrome.runtime.onInstalled.addListener(onBoot);
chrome.runtime.onStartup.addListener(onBoot);
// Safety net for a worker started some other way (alarms survive worker restarts but not every browser update).
void chrome.alarms.get(AUTOLOCK_ALARM).then((a) => (a ? undefined : ensureAlarm())).catch(() => undefined);

chrome.alarms.onAlarm.addListener((alarm) => {
  // 30 s after the popup's last copy (clipboard.ts): clear it through the offscreen document, popup open or not.
  if (alarm.name === CLIPBOARD_ALARM) return onClipboardAlarm();
  if (alarm.name !== AUTOLOCK_ALARM) return;
  const quiet = (p: Promise<unknown>) => p.then(() => undefined, () => undefined);
  return Promise.all([quiet(checkAutoLock()), quiet(purgeExpiredPending())]).then(() => undefined);
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

async function clearAllBadges(): Promise<void> {
  const tabs = await chrome.tabs.query({}).catch(() => []);
  await Promise.all(tabs.map((tab) => (tab.id === undefined ? undefined : chrome.action.setBadgeText({ text: '', tabId: tab.id }).catch(() => undefined))));
}

// Whatever locked or signed out (button, alarm, request-time auto-lock, 401, server change): no tab keeps a count.
const hasSecrets = (core: unknown) => !!(core && typeof core === 'object' && (core as { secrets?: unknown }).secrets);
chrome.storage.session.onChanged.addListener((changes) => {
  const core = changes[SESSION_KEY];
  if (core && hasSecrets(core.oldValue) && !hasSecrets(core.newValue)) void clearAllBadges();
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void chrome.tabs.get(tabId).then((tab) => safeBadge(tabId, tab.url), () => undefined);
});
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.url !== undefined || info.status === 'complete') void safeBadge(tabId, tab.url);
});
