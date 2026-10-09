/**
 * In-memory `chrome.*` mock for the extension's unit tests (installed per test file by tests/setup.ts).
 *
 * Faithful where it catches real bugs:
 * - storage values and runtime messages are JSON round-tripped, like Chrome's serialization
 *   (a Uint8Array or CryptoKey does not survive; store base64 strings instead);
 * - `runtime.onMessage` honours only the Chrome 116 contract: a listener answers with `sendResponse`,
 *   synchronously or after `return true`. A returned Promise is NOT treated as the answer (the caller
 *   gets `undefined`), exactly as in the minimum Chrome version the manifest targets.
 * Simplified: `tabs.query({ url })` and `permissions.contains` compare strings exactly (no match
 * patterns); every API is promise-only (no callbacks); one window (id 1) is the current window;
 * `offscreen` only tracks whether its single document is open (creating a second one or closing
 * none rejects, like Chrome) and loads nothing: tests play the document's answer themselves.
 *
 * Every API function is a `vi.fn`, so tests can assert calls or override behaviour
 * (`chrome.tabs.sendMessage.mockResolvedValue(...)` via `getChromeMock()`). `resetChromeMock()` clears
 * all state, listeners, call history and overrides IN PLACE (modules holding references keep working),
 * which also drops listeners that modules registered at import time.
 */
import { vi, type Mock } from 'vitest';
import manifest from '../../manifest.json';

export const MOCK_EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop';
export const MOCK_EXTENSION_ORIGIN = `chrome-extension://${MOCK_EXTENSION_ID}`;
export const NO_RECEIVER_ERROR = 'Could not establish connection. Receiving end does not exist.';

type Listener = (...args: any[]) => unknown;
type StorageChange = { oldValue?: unknown; newValue?: unknown };
type StorageKeys = string | string[] | Record<string, unknown> | null | undefined;
type AlarmInfo = { name?: string | undefined; when?: number | undefined; delayInMinutes?: number | undefined; periodInMinutes?: number | undefined };
type MessageListener = (message: unknown, sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void) => unknown;

/** Mimics `chrome.events.Event`; `dispatch` is the test-side trigger. */
export class MockEvent<L extends Listener = Listener> {
  #listeners: L[] = [];
  readonly addListener = vi.fn((listener: L) => {
    if (!this.#listeners.includes(listener)) this.#listeners.push(listener);
  });
  readonly removeListener = vi.fn((listener: L) => {
    this.#listeners = this.#listeners.filter((l) => l !== listener);
  });
  readonly hasListener = vi.fn((listener: L) => this.#listeners.includes(listener));
  readonly hasListeners = vi.fn(() => this.#listeners.length > 0);

  get listeners(): readonly L[] {
    return this.#listeners;
  }
  /** Calls every listener synchronously and returns what each returned (await them for async handlers). */
  dispatch(...args: Parameters<L>): unknown[] {
    return [...this.#listeners].map((l) => l(...args));
  }
  reset(): void {
    this.#listeners = [];
    for (const f of [this.addListener, this.removeListener, this.hasListener, this.hasListeners]) f.mockReset();
  }
}

const serialize = <T>(value: T): T => (value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T));

function createChromeMock() {
  const fns: Mock[] = [];
  const events: MockEvent[] = [];
  const fn = <T extends (...args: any[]) => any>(impl: T): Mock<T> => {
    const f = vi.fn(impl);
    fns.push(f);
    return f;
  };
  const event = <L extends Listener = Listener>(): MockEvent<L> => {
    const e = new MockEvent<L>();
    events.push(e as unknown as MockEvent);
    return e;
  };

  // ---- storage ----
  const storageOnChanged = event<(changes: Record<string, StorageChange>, areaName: string) => void>();
  const areas: Map<string, unknown>[] = [];
  const storageArea = (areaName: 'session' | 'local') => {
    const data = new Map<string, unknown>();
    areas.push(data);
    const onChanged = event<(changes: Record<string, StorageChange>) => void>();
    const emit = (changes: Record<string, StorageChange>) => {
      if (Object.keys(changes).length === 0) return;
      onChanged.dispatch(changes);
      storageOnChanged.dispatch(changes, areaName);
    };
    const change = (key: string, newValue: unknown): StorageChange => {
      const c: StorageChange = {};
      if (data.has(key)) c.oldValue = data.get(key);
      if (newValue !== undefined) c.newValue = newValue;
      return c;
    };
    return {
      /** Test helper: the stored (already serialized) items. */
      data,
      get: fn(async (keys?: StorageKeys): Promise<Record<string, unknown>> => {
        const out: Record<string, unknown> = {};
        if (keys === undefined || keys === null) {
          for (const [k, v] of data) out[k] = serialize(v);
        } else if (typeof keys === 'string' || Array.isArray(keys)) {
          for (const k of typeof keys === 'string' ? [keys] : keys) if (data.has(k)) out[k] = serialize(data.get(k));
        } else {
          for (const [k, fallback] of Object.entries(keys)) out[k] = data.has(k) ? serialize(data.get(k)) : fallback;
        }
        return out;
      }),
      set: fn(async (items: Record<string, unknown>): Promise<void> => {
        const changes: Record<string, StorageChange> = {};
        for (const [k, v] of Object.entries(items)) {
          if (v === undefined) continue;
          const value = serialize(v);
          changes[k] = change(k, value);
          data.set(k, value);
        }
        emit(changes);
      }),
      remove: fn(async (keys: string | string[]): Promise<void> => {
        const changes: Record<string, StorageChange> = {};
        for (const k of typeof keys === 'string' ? [keys] : keys) {
          if (!data.has(k)) continue;
          changes[k] = change(k, undefined);
          data.delete(k);
        }
        emit(changes);
      }),
      clear: fn(async (): Promise<void> => {
        const changes: Record<string, StorageChange> = {};
        for (const k of data.keys()) changes[k] = change(k, undefined);
        data.clear();
        emit(changes);
      }),
      setAccessLevel: fn(async (_options: { accessLevel: `${chrome.storage.AccessLevel}` }): Promise<void> => undefined),
      onChanged,
    };
  };

  // ---- runtime ----
  const onMessage = event<MessageListener>();
  const popupSender: chrome.runtime.MessageSender = { id: MOCK_EXTENSION_ID, url: `${MOCK_EXTENSION_ORIGIN}/popup.html`, origin: MOCK_EXTENSION_ORIGIN };
  const deliver = (message: unknown, sender: chrome.runtime.MessageSender): Promise<unknown> => {
    const listeners = [...onMessage.listeners];
    if (listeners.length === 0) return Promise.reject(new Error(NO_RECEIVER_ERROR));
    const payload = serialize(message);
    return new Promise((resolve) => {
      let answered = false;
      let keepOpen = false;
      const sendResponse = (response?: unknown) => {
        if (answered) return;
        answered = true;
        resolve(serialize(response));
      };
      for (const listener of listeners) if (listener(payload, sender, sendResponse) === true) keepOpen = true;
      // No synchronous answer and nobody returned true: Chrome closes the port and the caller gets undefined.
      if (!keepOpen) sendResponse(undefined);
    });
  };

  // ---- alarms ----
  const alarms = new Map<string, chrome.alarms.Alarm>();

  // ---- tabs ----
  const tabs: chrome.tabs.Tab[] = [];
  let nextTabId = 1;
  const addTab = (partial: Partial<chrome.tabs.Tab> = {}): chrome.tabs.Tab => {
    const tab: chrome.tabs.Tab = {
      id: nextTabId++,
      index: tabs.length,
      windowId: 1,
      active: true,
      pinned: false,
      highlighted: false,
      incognito: false,
      selected: false,
      discarded: false,
      autoDiscardable: true,
      frozen: false,
      groupId: -1,
      lastAccessed: Date.now(),
      status: 'complete',
      ...partial,
    };
    if (tab.id !== undefined && tab.id >= nextTabId) nextTabId = tab.id + 1;
    if (tab.active) for (const t of tabs) if (t.windowId === tab.windowId) t.active = false;
    tabs.push(tab);
    return tab;
  };

  // ---- offscreen (at most one document per extension) ----
  let offscreenOpen = false;

  // ---- permissions ----
  const grantedOrigins = new Set<string>();
  const grantedPermissions = new Set<string>(manifest.permissions);

  const chromeMock = {
    storage: { session: storageArea('session'), local: storageArea('local'), onChanged: storageOnChanged },
    runtime: {
      id: MOCK_EXTENSION_ID,
      lastError: undefined as chrome.runtime.LastError | undefined,
      getURL: fn((path: string) => `${MOCK_EXTENSION_ORIGIN}/${path.replace(/^\//, '')}`),
      getManifest: fn(() => serialize(manifest) as unknown as chrome.runtime.Manifest),
      sendMessage: fn((message: unknown) => deliver(message, popupSender)),
      onMessage,
      onInstalled: event(),
      onStartup: event(),
    },
    alarms: {
      create: fn(async (nameOrInfo?: string | AlarmInfo, maybeInfo?: AlarmInfo): Promise<void> => {
        const info: AlarmInfo = (typeof nameOrInfo === 'object' ? nameOrInfo : maybeInfo) ?? {};
        const name = typeof nameOrInfo === 'string' ? nameOrInfo : (info.name ?? '');
        const delay = info.delayInMinutes ?? info.periodInMinutes ?? 0;
        const alarm = { name, scheduledTime: info.when ?? Date.now() + delay * 60_000, persistAcrossSessions: false } as chrome.alarms.Alarm;
        if (info.periodInMinutes !== undefined) alarm.periodInMinutes = info.periodInMinutes;
        alarms.set(name, alarm);
      }),
      get: fn(async (name = ''): Promise<chrome.alarms.Alarm | undefined> => alarms.get(name)),
      getAll: fn(async (): Promise<chrome.alarms.Alarm[]> => [...alarms.values()]),
      clear: fn(async (name = ''): Promise<boolean> => alarms.delete(name)),
      clearAll: fn(async (): Promise<boolean> => {
        const had = alarms.size > 0;
        alarms.clear();
        return had;
      }),
      onAlarm: event<(alarm: chrome.alarms.Alarm) => unknown>(),
    },
    tabs: {
      query: fn(async (q: chrome.tabs.QueryInfo = {}): Promise<chrome.tabs.Tab[]> =>
        tabs.filter(
          (t) =>
            (q.active === undefined || t.active === q.active) &&
            (q.windowId === undefined || t.windowId === q.windowId) &&
            (!q.currentWindow && !q.lastFocusedWindow ? true : t.windowId === 1) &&
            (q.url === undefined || (typeof q.url === 'string' ? [q.url] : q.url).includes(t.url ?? '')),
        ),
      ),
      get: fn(async (tabId: number): Promise<chrome.tabs.Tab> => {
        const tab = tabs.find((t) => t.id === tabId);
        if (!tab) throw new Error(`No tab with id: ${tabId}.`);
        return tab;
      }),
      create: fn(async (props: chrome.tabs.CreateProperties = {}): Promise<chrome.tabs.Tab> => {
        const partial: Partial<chrome.tabs.Tab> = { active: props.active ?? true, windowId: props.windowId ?? 1 };
        if (props.url !== undefined) partial.url = props.url;
        return addTab(partial);
      }),
      sendMessage: fn(async (_tabId: number, _message: unknown): Promise<unknown> => undefined),
      onActivated: event<(info: chrome.tabs.OnActivatedInfo) => void>(),
      onUpdated: event<(tabId: number, changeInfo: chrome.tabs.OnUpdatedInfo, tab: chrome.tabs.Tab) => void>(),
      onRemoved: event<(tabId: number, removeInfo: chrome.tabs.OnRemovedInfo) => void>(),
    },
    action: {
      setBadgeText: fn(async (_details: chrome.action.BadgeTextDetails): Promise<void> => undefined),
      setBadgeBackgroundColor: fn(async (_details: chrome.action.BadgeColorDetails): Promise<void> => undefined),
      openPopup: fn(async (_options?: chrome.action.OpenPopupOptions): Promise<void> => undefined),
    },
    permissions: {
      request: fn(async (p: chrome.permissions.Permissions): Promise<boolean> => {
        for (const o of p.origins ?? []) grantedOrigins.add(o);
        for (const perm of p.permissions ?? []) grantedPermissions.add(perm);
        return true;
      }),
      contains: fn(async (p: chrome.permissions.Permissions): Promise<boolean> =>
        (p.origins ?? []).every((o) => grantedOrigins.has(o)) && (p.permissions ?? []).every((perm) => grantedPermissions.has(perm)),
      ),
      remove: fn(async (p: chrome.permissions.Permissions): Promise<boolean> => {
        for (const o of p.origins ?? []) grantedOrigins.delete(o);
        for (const perm of p.permissions ?? []) grantedPermissions.delete(perm);
        return true;
      }),
    },
    offscreen: {
      createDocument: fn(async (_parameters: chrome.offscreen.CreateParameters): Promise<void> => {
        if (offscreenOpen) throw new Error('Only a single offscreen document may be created.');
        offscreenOpen = true;
      }),
      closeDocument: fn(async (): Promise<void> => {
        if (!offscreenOpen) throw new Error('No current offscreen document.');
        offscreenOpen = false;
      }),
    },
    scripting: {
      executeScript: fn(async (_injection: unknown): Promise<unknown[]> => []),
      insertCSS: fn(async (_injection: unknown): Promise<void> => undefined),
      registerContentScripts: fn(async (_scripts: unknown[]): Promise<void> => undefined),
      unregisterContentScripts: fn(async (_filter?: unknown): Promise<void> => undefined),
      getRegisteredContentScripts: fn(async (_filter?: unknown): Promise<unknown[]> => []),
    },
  };

  const helpers = {
    /** Adds a tab (window 1, active by default; activating it deactivates the window's other tabs). */
    addTab,
    /** Delivers `message` to runtime.onMessage as if sent from another context (e.g. a content script with `sender.tab`). */
    sendMessageFrom: (sender: chrome.runtime.MessageSender, message: unknown) => deliver(message, { id: MOCK_EXTENSION_ID, ...sender }),
    /** Fires onAlarm for `name` (a created alarm, or a synthetic one) and awaits the listeners; one-shot alarms are removed. */
    /** Whether the offscreen document is open (created and not closed yet). */
    offscreenOpen: () => offscreenOpen,
    fireAlarm: async (name: string): Promise<void> => {
      const alarm = alarms.get(name) ?? ({ name, scheduledTime: Date.now(), persistAcrossSessions: false } as chrome.alarms.Alarm);
      if (alarm.periodInMinutes === undefined) alarms.delete(name);
      await Promise.all(chromeMock.alarms.onAlarm.dispatch(alarm));
    },
    reset: () => {
      for (const f of fns) f.mockReset();
      for (const e of events) e.reset();
      for (const a of areas) a.clear();
      alarms.clear();
      tabs.length = 0;
      nextTabId = 1;
      offscreenOpen = false;
      grantedOrigins.clear();
      grantedPermissions.clear();
      for (const p of manifest.permissions) grantedPermissions.add(p);
      chromeMock.runtime.lastError = undefined;
    },
  };

  return { chromeMock, helpers };
}

export type ChromeMock = ReturnType<typeof createChromeMock>['chromeMock'];
type Helpers = ReturnType<typeof createChromeMock>['helpers'];

let current: { chromeMock: ChromeMock; helpers: Helpers } | null = null;

/** Installs a fresh mock as `globalThis.chrome` and returns it (typed with the vi.fn handles). */
export function installChromeMock(): ChromeMock {
  current = createChromeMock();
  (globalThis as unknown as { chrome: unknown }).chrome = current.chromeMock;
  return current.chromeMock;
}

/** Clears storage, listeners, alarms, tabs, granted permissions, call history and overrides, in place. */
export function resetChromeMock(): ChromeMock {
  if (!current) return installChromeMock();
  current.helpers.reset();
  return current.chromeMock;
}

function installed() {
  if (!current) throw new Error('chrome mock not installed (tests/setup.ts calls installChromeMock())');
  return current;
}

/** The installed mock, typed for assertions (`getChromeMock().tabs.sendMessage.mockResolvedValue(...)`). */
export const getChromeMock = (): ChromeMock => installed().chromeMock;
export const addTab = (partial?: Partial<chrome.tabs.Tab>): chrome.tabs.Tab => installed().helpers.addTab(partial);
export const sendMessageFrom = (sender: chrome.runtime.MessageSender, message: unknown): Promise<unknown> =>
  installed().helpers.sendMessageFrom(sender, message);
export const fireAlarm = (name: string): Promise<void> => installed().helpers.fireAlarm(name);
export const offscreenOpen = (): boolean => installed().helpers.offscreenOpen();
