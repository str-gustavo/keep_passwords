// The service worker's message router. Who may ask what:
// - every message must come from this extension (sender.id); anything else is "Origem inválida";
// - extension pages (the popup) are trusted with the account flows, search, fill-from-popup and, from popup.html only,
//   revealing one password, arming the clipboard clear and relaying a generated password to the active tab;
// - content scripts are identified by the tab they run in: they only ever see or receive records whose URL matches
//   the tab's URL (sender.tab.url, never a URL from the payload) and, inside an iframe, the frame's URL too;
// - a credential captured on submit (pending.ts) belongs to the tab that captured it: only that tab, on that site, sees
//   a summary of it (never the password) and can save it — the saved password is the captured one, not the payload's.
// Auto-lock is enforced at request time as well (not only by the alarm). Reads (getState, matchesForUrl, search,
// getPending) never extend the session, whoever asks: only the popup's actions (POPUP_ACTIVITY) and a page's validated
// clicks count as activity, so a popup left open (it polls getState) cannot keep the vault unlocked.
import { WrongPasswordError } from '@app/crypto/account';
import { generatePassword } from '@app/generator/password';
import { generateTotp, parseOtpauth, totpRemainingSeconds } from '@app/crypto/totp';
import { t } from '@app/i18n/pt-br';
import { APP_VAULT_PATH } from '@/shared/constants';
import { hostOf, urlsMatch } from '@/shared/domain';
import { ExtError } from '@/shared/errors';
import type {
  Credentials, FillGeneratedMsg, FillGeneratedResult, FillIntoMsg, GenOptions, OpenPopupResult, Pending, PendingSummary, Req, Res, RevealedPassword, TotpCode,
} from '@/shared/messages';
import { serverOrigin } from '@/shared/server-url';
import { armClipboardClear, clearArmedClipboard } from './clipboard';
import { captureChecked, dropPending, isNeverHost, neverForSite, pendingFor, sameLogin, summarize } from './pending';
import {
  checkAutoLock, clearSession, loadSession, lockSession, requireUnlocked, saveSession, signOutSession, stateOf, statusOf, touch,
  updateSession, type SessionData, type UnlockedSession, type VaultRecordLite,
} from './session';
import { READ_ONLY_MESSAGE, findRecord, loadVault, matches, saveNewRecord, search, signIn, unlock, updateRecordPassword } from './vault';

const INVALID_ORIGIN = 'Origem inválida';
const INVALID_MESSAGE = 'Mensagem inválida';
const NOT_THIS_SITE = 'Registro não corresponde a este site';
const NEEDS_SERVER = 'Configure o endereço do servidor.';
const NOTHING_PENDING = 'Nenhuma senha capturada nesta página';
const TAB_NOT_FOUND = 'Aba não encontrada';
const CANNOT_FILL = 'Não foi possível preencher nesta página';
const POPUP_PATH = '/popup.html';

type PageOrigin = { kind: 'page'; tabUrl: string; frameUrl: string | null; tabId: number | undefined; windowId: number | undefined };
type ExtensionOrigin = { kind: 'extension'; path: string };
type Origin = ExtensionOrigin | PageOrigin;

/** Classifies the sender, or null when it is not one of this extension's own contexts. */
function originOf(sender: chrome.runtime.MessageSender | undefined): Origin | null {
  if (!sender || sender.id !== chrome.runtime.id) return null;
  if (typeof sender.url === 'string' && sender.url.startsWith(chrome.runtime.getURL(''))) {
    try { return { kind: 'extension', path: new URL(sender.url).pathname }; } catch { return null; }
  }
  const tabUrl = sender.tab?.url;
  if (typeof tabUrl === 'string' && tabUrl) {
    return { kind: 'page', tabUrl, frameUrl: typeof sender.url === 'string' ? sender.url : null, tabId: sender.tab?.id, windowId: sender.tab?.windowId };
  }
  return null;
}

/** A URL belongs to the sending page when it matches the tab's URL and, for an iframe, the frame's URL as well. */
const allowedFor = (url: string, o: PageOrigin): boolean => urlsMatch(url, o.tabUrl) && (o.frameUrl === null || urlsMatch(url, o.frameUrl));
function recordFor(r: VaultRecordLite, o: Origin): void {
  if (o.kind === 'page' && !allowedFor(r.url, o)) throw new ExtError(NOT_THIS_SITE);
}
function extensionOnly(o: Origin): asserts o is ExtensionOrigin {
  if (o.kind !== 'extension') throw new ExtError(INVALID_ORIGIN);
}
/** popup.html itself, not any other extension page (the offscreen document included). */
function popupOnly(o: Origin): asserts o is ExtensionOrigin {
  extensionOnly(o);
  if (o.path !== POPUP_PATH) throw new ExtError(INVALID_ORIGIN);
}
/**
 * The popup's actions that count as user activity (touched up front, before routing). Everything else from an extension
 * page — getState (polled every 5 s while the popup is open), matchesForUrl, search, getPending, lock, signOut,
 * openPopup — never extends the session.
 */
const POPUP_ACTIVITY: ReadonlySet<Req['type']> = new Set<Req['type']>([
  'setServer', 'signIn', 'unlock', 'refresh', 'revealPassword', 'fillFromPopup', 'totpFor', 'generatePassword',
  'fillGeneratedFromPopup', 'clipboardArm', 'saveNew', 'updatePassword', 'discardPending', 'neverForSite', 'openApp',
]);
/**
 * Page-originated actions extend the session only once they passed validation (popup actions: POPUP_ACTIVITY).
 * savePending and getPending never do: a page can fire synthetic submits and reloads, which must not keep the vault
 * unlocked; only the user's own clicks in the save bar (save, update, dismiss, never) count as activity.
 */
const touchFromPage = (o: Origin) => (o.kind === 'page' ? touch() : Promise.resolve());

/** The credential this page's tab captured: same tab, same site (tab and frame), not expired. */
function pendingOfPage(s: SessionData, o: PageOrigin): Pending | null {
  if (o.tabId === undefined) return null;
  const p = pendingFor(s, o.tabUrl, Date.now(), o.tabId);
  return p && allowedFor(p.url, o) ? p : null;
}
/** Statuses that keep a capture (locked too: the save bar then asks to unlock). */
const keepsCaptures = (s: SessionData) => statusOf(s) === 'unlocked' || statusOf(s) === 'locked';

/**
 * Takes this page's capture for a save-bar action. It is re-checked against the vault (it must still be the `kind` the
 * bar offered, else it is dropped as moot) and removed from the session BEFORE the network round trip, so a double
 * click or two tabs cannot save it twice.
 */
async function claimPending(s: SessionData, o: PageOrigin, kind: Pending['kind'], fits: (p: Pending) => boolean = () => true): Promise<Pending> {
  const p = pendingOfPage(s, o);
  if (!p || !fits(p)) throw new ExtError(NOTHING_PENDING);
  const current = summarize(s, p, false);
  if (!current || current.kind !== kind) {
    await dropPending(p);
    throw new ExtError(NOTHING_PENDING);
  }
  if (!(await dropPending(p))) throw new ExtError(NOTHING_PENDING); // claimed by a concurrent request
  return p;
}
/** Gives a claimed capture back after a failed save, so the user can retry — unless locked, signed out or re-captured meanwhile. */
const restorePending = (p: Pending, s: UnlockedSession) =>
  updateSession((c) => (!c.pending && statusOf(c) === 'unlocked' && c.user?.id === s.user.id ? { pending: p } : null)).catch(() => false);

// Runtime shape check (content scripts live in page renderers; never trust the payload's types). Being a mapped type
// over Req['type'], it also stops compiling when a message is added without a validator.
const isStr = (v: unknown): v is string => typeof v === 'string';
// Bounds on what a page may hand over for storage (a title above 500 would not even decrypt in the web app).
const MAX = { url: 2048, login: 1024, password: 4096, title: 500 } as const;
const within = (v: unknown, max: number): boolean => isStr(v) && v.length <= max;
const optWithin = (v: unknown, max: number): boolean => v === undefined || within(v, max);
/** clipboardArm's token: 16 random bytes in base64, so it cannot carry what was copied. */
const CLIPBOARD_TOKEN = /^[A-Za-z0-9+/]{22}==$/;
const SHAPES: { [K in Req['type']]: (m: Record<string, unknown>) => boolean } = {
  getState: () => true,
  setServer: (m) => isStr(m.url),
  signIn: (m) => isStr(m.email) && isStr(m.password),
  unlock: (m) => isStr(m.password),
  lock: () => true,
  signOut: () => true,
  refresh: (m) => m.force === undefined || typeof m.force === 'boolean',
  openApp: () => true,
  matchesForUrl: (m) => isStr(m.url),
  search: (m) => isStr(m.query),
  fillRequest: (m) => isStr(m.id),
  totpFor: (m) => isStr(m.id),
  revealPassword: (m) => isStr(m.id),
  savePending: (m) => within(m.url, MAX.url) && within(m.login, MAX.login) && within(m.password, MAX.password),
  getPending: () => true,
  discardPending: () => true,
  neverForSite: (m) => isStr(m.host),
  saveNew: (m) => within(m.title, MAX.title) && optWithin(m.url, MAX.url) && optWithin(m.login, MAX.login) && optWithin(m.password, MAX.password),
  updatePassword: (m) => isStr(m.id) && optWithin(m.password, MAX.password),
  generatePassword: (m) => typeof m.opts === 'object' && m.opts !== null,
  openPopup: () => true,
  fillFromPopup: (m) => isStr(m.id) && Number.isInteger(m.tabId),
  clipboardArm: (m) => isStr(m.token) && CLIPBOARD_TOKEN.test(m.token),
  fillGeneratedFromPopup: (m) => Number.isInteger(m.tabId) && within(m.password, MAX.password) && m.password !== '',
};
function isReq(v: unknown): v is Req {
  if (!v || typeof v !== 'object') return false;
  const m = v as Record<string, unknown>;
  return typeof m.type === 'string' && Object.hasOwn(SHAPES, m.type) && SHAPES[m.type as Req['type']](m);
}

/** Only messages written for the user are shown; anything unexpected becomes a generic message (no internals, no secrets). */
function errorMessage(e: unknown): string {
  if (e instanceof ExtError) return e.message;
  if (e instanceof WrongPasswordError) return t.wrongMasterPassword;
  if (e instanceof Error && e.message === t.unsafeServerParams) return e.message;
  return t.genericAuthError;
}

const ok = <T>(data: T): Res<T> => ({ ok: true, data });
const fail = (error: string): Res<never> => ({ ok: false, error });

export async function handle(req: Req, sender: chrome.runtime.MessageSender): Promise<Res> {
  const origin = originOf(sender);
  if (!origin) return fail(INVALID_ORIGIN);
  if (!isReq(req)) return fail(INVALID_MESSAGE);
  try {
    // Request-time auto-lock: an idle vault is locked before anything is read, even if the alarm has not fired yet.
    await checkAutoLock();
    if (origin.kind === 'extension' && POPUP_ACTIVITY.has(req.type)) await touch();
    return await route(req, origin);
  } catch (e) {
    return fail(errorMessage(e));
  }
}

const currentState = async () => stateOf(await loadSession());

function genOptions(o: GenOptions): GenOptions {
  return { length: Number(o.length) || 20, upper: o.upper === true, lower: o.lower === true, digits: o.digits === true, symbols: o.symbols === true, excludeAmbiguous: o.excludeAmbiguous === true };
}

async function totpCode(uri: string): Promise<TotpCode> {
  let p: ReturnType<typeof parseOtpauth>;
  try { p = parseOtpauth(uri); } catch { throw new ExtError('Código 2FA inválido neste registro'); }
  const now = Date.now();
  return { code: await generateTotp(p, now), remaining: totpRemainingSeconds(p.period, now), period: p.period };
}

async function route(req: Req, o: Origin): Promise<Res> {
  switch (req.type) {
    // ---- state and account ----
    case 'getState':
      return ok(await currentState());
    case 'setServer': {
      extensionOnly(o);
      const origin = serverOrigin(req.url);
      if ((await loadSession()).serverUrl !== origin) {
        await clearSession(); // another server: nothing of the old account survives
        await saveSession({ serverUrl: origin });
      }
      return ok(await currentState());
    }
    case 'signIn': {
      extensionOnly(o);
      const { serverUrl } = await loadSession();
      if (!serverUrl) throw new ExtError(NEEDS_SERVER);
      await signIn(serverUrl, req.email, req.password);
      return ok(await currentState());
    }
    case 'unlock':
      extensionOnly(o);
      await unlock(req.password);
      return ok(await currentState());
    case 'lock':
      extensionOnly(o);
      await lockSession();
      await clearArmedClipboard(); // a password copied from the popup does not outlive the lock (never throws)
      return ok(await currentState());
    case 'signOut':
      extensionOnly(o);
      await signOutSession();
      await clearArmedClipboard();
      return ok(await currentState());
    case 'refresh':
      extensionOnly(o);
      await loadVault(req.force === true);
      return ok(await currentState());
    case 'openApp': {
      const { serverUrl } = await loadSession();
      if (!serverUrl) throw new ExtError(NEEDS_SERVER);
      await chrome.tabs.create({ url: serverUrl + APP_VAULT_PATH });
      return ok(null);
    }

    // ---- reading the vault (MatchItem only; no secrets; a page's reads never extend the session) ----
    case 'matchesForUrl': {
      const s = await requireUnlocked();
      // The popup asks for the active tab it looked up itself; a content script only ever gets its own page.
      if (o.kind === 'extension') return ok(matches(s.vault, req.url));
      return ok(matches(s.vault.filter((r) => allowedFor(r.url, o)), o.tabUrl));
    }
    case 'search': {
      extensionOnly(o);
      const s = await requireUnlocked();
      return ok(search(s.vault, req.query));
    }

    // ---- secrets, one record at a time, for the page they belong to ----
    case 'fillRequest': {
      if (o.kind !== 'page') throw new ExtError(INVALID_ORIGIN);
      const r = findRecord((await requireUnlocked()).vault, req.id);
      recordFor(r, o);
      await touchFromPage(o);
      return ok<Credentials>({ login: r.login, password: r.password, hasTotp: r.totp !== '' });
    }
    case 'totpFor': {
      const r = findRecord((await requireUnlocked()).vault, req.id);
      recordFor(r, o);
      if (!r.totp) throw new ExtError('Registro sem código 2FA');
      await touchFromPage(o);
      return ok(await totpCode(r.totp));
    }
    case 'revealPassword': {
      popupOnly(o);
      const r = findRecord((await requireUnlocked()).vault, req.id);
      return ok<RevealedPassword>({ password: r.password });
    }
    case 'fillFromPopup': {
      extensionOnly(o);
      const r = findRecord((await requireUnlocked()).vault, req.id);
      let tab: chrome.tabs.Tab;
      try { tab = await chrome.tabs.get(req.tabId); } catch { throw new ExtError(TAB_NOT_FOUND); }
      if (!tab.url || !urlsMatch(r.url, tab.url)) throw new ExtError(NOT_THIS_SITE);
      // No secret leaves here: the tab's top frame answers with fillRequest(id), validated against its real URL.
      const msg: FillIntoMsg = { type: 'fillInto', id: r.id };
      try { await chrome.tabs.sendMessage(req.tabId, msg, { frameId: 0 }); } catch { throw new ExtError(CANNOT_FILL); }
      return ok(null);
    }
    case 'fillGeneratedFromPopup': {
      // "Usar nesta página" in the popup's generator. The password was generated in the popup and is not a vault
      // secret, so it may go to the web page the user is looking at (its top frame only); it is never logged or stored.
      popupOnly(o);
      let tab: chrome.tabs.Tab;
      try { tab = await chrome.tabs.get(req.tabId); } catch { throw new ExtError(TAB_NOT_FOUND); }
      if (!tab.url || hostOf(tab.url) === null) throw new ExtError('Não é possível preencher nesta página');
      const msg: FillGeneratedMsg = { type: 'fillGenerated', password: req.password };
      let reply: unknown;
      try { reply = await chrome.tabs.sendMessage(req.tabId, msg, { frameId: 0 }); } catch { throw new ExtError(CANNOT_FILL); }
      const filled = (reply as { filled?: unknown } | null | undefined)?.filled;
      if (typeof filled !== 'number' || !Number.isInteger(filled) || filled < 0) throw new ExtError(CANNOT_FILL);
      if (filled === 0) throw new ExtError('Nenhum campo de senha encontrado nesta página');
      return ok<FillGeneratedResult>({ filled });
    }

    // ---- captured credentials (a page only ever sees its own tab's capture, and never its password) ----
    case 'savePending': {
      // No touch(): a synthetic submit must not keep the vault unlocked.
      if (o.kind !== 'page' || o.tabId === undefined) throw new ExtError(INVALID_ORIGIN);
      if (!allowedFor(req.url, o)) throw new ExtError(NOT_THIS_SITE);
      const s = await loadSession();
      if (!keepsCaptures(s)) return ok(null); // signed out: nowhere to save it
      const p = await captureChecked(s, { url: req.url, login: req.login, password: req.password, tabId: o.tabId });
      if (p) {
        // Only into the same account, still signed in: a sign-out or account switch meanwhile wins.
        await updateSession((c) => (keepsCaptures(c) && c.user?.id === s.user?.id ? { pending: p } : null));
      } else {
        // Nothing to offer (already stored, never-list…): an earlier capture of this tab and site is superseded.
        const old = pendingOfPage(s, o);
        if (old) await dropPending(old);
      }
      return ok(null);
    }
    case 'getPending': {
      if (o.kind !== 'page') throw new ExtError(INVALID_ORIGIN);
      // Asked on every page load: never extends the session.
      const s = await loadSession();
      const status = statusOf(s);
      const p = status === 'unlocked' || status === 'locked' ? pendingOfPage(s, o) : null;
      if (!p || (await isNeverHost(p.url))) return ok(null);
      const summary = summarize(s, p, status === 'locked');
      if (!summary) await dropPending(p); // the vault holds it already (saved from the popup meanwhile)
      return ok<PendingSummary | null>(summary);
    }
    case 'discardPending': {
      const s = await loadSession();
      const p = o.kind === 'page' ? pendingOfPage(s, o) : s.pending;
      if (p) {
        await dropPending(p);
        await touchFromPage(o);
      }
      return ok(null);
    }
    case 'neverForSite': {
      if (o.kind === 'page' && !allowedFor(req.host, o)) throw new ExtError(NOT_THIS_SITE);
      await neverForSite(req.host);
      await touchFromPage(o);
      return ok(null);
    }

    // ---- writing ----
    case 'saveNew': {
      const s = await requireUnlocked();
      if (o.kind === 'page') {
        // The save bar: what this tab captured; url, login and password in the payload are ignored.
        const p = await claimPending(s, o, 'new');
        await touch();
        try {
          return ok({ id: await saveNewRecord({ url: p.url, login: p.login, password: p.password, title: req.title }) });
        } catch (e) {
          await restorePending(p, s);
          throw e;
        }
      }
      if (req.url === undefined || req.password === undefined) throw new ExtError(INVALID_MESSAGE);
      const id = await saveNewRecord({ url: req.url, login: req.login ?? '', password: req.password, title: req.title });
      return ok({ id });
    }
    case 'updatePassword': {
      const s = await requireUnlocked();
      const r = findRecord(s.vault, req.id);
      recordFor(r, o);
      if (r.permission === 'view') throw new ExtError(READ_ONLY_MESSAGE);
      if (o.kind === 'page') {
        // The save bar: this tab's capture of this record's login; its password, never the payload's.
        const p = await claimPending(s, o, 'update', (c) => sameLogin(c.login, r.login));
        await touch();
        try {
          await updateRecordPassword(r.id, p.password);
        } catch (e) {
          await restorePending(p, s);
          throw e;
        }
        return ok(null);
      }
      if (!req.password) throw new ExtError(INVALID_MESSAGE);
      await updateRecordPassword(r.id, req.password);
      return ok(null);
    }

    // ---- utilities ----
    case 'generatePassword':
      await touchFromPage(o);
      return ok<{ password: string }>({ password: generatePassword(genOptions(req.opts)) });
    case 'clipboardArm':
      // The popup already wrote to the clipboard; only a random token arrives here (see clipboard.ts).
      popupOnly(o);
      await armClipboardClear(req.token);
      return ok(null);
    case 'openPopup': {
      try {
        await chrome.action.openPopup(o.kind === 'page' && o.windowId !== undefined ? { windowId: o.windowId } : undefined);
        return ok<OpenPopupResult>({ opened: true });
      } catch {
        return ok<OpenPopupResult>({ opened: false });
      }
    }
    default:
      return unreachable(req);
  }
}

/** Compile-time exhaustiveness: adding a Req variant without a case above fails to type-check here. */
function unreachable(req: never): Res {
  void req;
  return fail(INVALID_MESSAGE);
}
