// The service worker's message router. Who may ask what:
// - every message must come from this extension (sender.id); anything else is "Origem inválida";
// - extension pages (the popup) are trusted with the account flows, search and fill-from-popup;
// - content scripts are identified by the tab they run in: they only ever see or receive records whose URL matches
//   the tab's URL (sender.tab.url, never a URL from the payload) and, inside an iframe, the frame's URL too.
import { WrongPasswordError } from '@app/crypto/account';
import { generatePassword } from '@app/generator/password';
import { generateTotp, parseOtpauth, totpRemainingSeconds } from '@app/crypto/totp';
import { t } from '@app/i18n/pt-br';
import { APP_VAULT_PATH } from '@/shared/constants';
import { urlsMatch } from '@/shared/domain';
import type { Credentials, FillIntoMsg, GenOptions, OpenPopupResult, Req, Res, TotpCode } from '@/shared/messages';
import { ExtError } from './api';
import { clearSession, loadSession, lockSession, requireUnlocked, saveSession, signOutSession, stateOf, touch, type VaultRecordLite } from './session';
import { findRecord, loadVault, matches, saveNewRecord, search, signIn, unlock, updateRecordPassword } from './vault';

const INVALID_ORIGIN = 'Origem inválida';
const INVALID_MESSAGE = 'Mensagem inválida';
const NOT_THIS_SITE = 'Registro não corresponde a este site';
const NEEDS_SERVER = 'Configure o endereço do servidor.';
const NOT_AVAILABLE = 'Recurso ainda não disponível.';

type PageOrigin = { kind: 'page'; tabUrl: string; frameUrl: string | null; windowId: number | undefined };
type Origin = { kind: 'extension' } | PageOrigin;

/** Classifies the sender, or null when it is not one of this extension's own contexts. */
function originOf(sender: chrome.runtime.MessageSender | undefined): Origin | null {
  if (!sender || sender.id !== chrome.runtime.id) return null;
  if (typeof sender.url === 'string' && sender.url.startsWith(chrome.runtime.getURL(''))) return { kind: 'extension' };
  const tabUrl = sender.tab?.url;
  if (typeof tabUrl === 'string' && tabUrl) return { kind: 'page', tabUrl, frameUrl: typeof sender.url === 'string' ? sender.url : null, windowId: sender.tab?.windowId };
  return null;
}

/** A URL belongs to the sending page when it matches the tab's URL and, for an iframe, the frame's URL as well. */
const allowedFor = (url: string, o: PageOrigin): boolean => urlsMatch(url, o.tabUrl) && (o.frameUrl === null || urlsMatch(url, o.frameUrl));
const recordFor = (r: VaultRecordLite, o: Origin): void => {
  if (o.kind === 'page' && !allowedFor(r.url, o)) throw new ExtError(NOT_THIS_SITE);
};
function extensionOnly(o: Origin): void {
  if (o.kind !== 'extension') throw new ExtError(INVALID_ORIGIN);
}

// Runtime shape check (content scripts live in page renderers; never trust the payload's types). Being a mapped type
// over Req['type'], it also stops compiling when a message is added without a validator.
const isStr = (v: unknown): v is string => typeof v === 'string';
const SHAPES: { [K in Req['type']]: (m: Record<string, unknown>) => boolean } = {
  getState: () => true,
  setServer: (m) => isStr(m.url),
  signIn: (m) => isStr(m.email) && isStr(m.password),
  unlock: (m) => isStr(m.password),
  lock: () => true,
  signOut: () => true,
  refresh: () => true,
  openApp: () => true,
  matchesForUrl: (m) => isStr(m.url),
  search: (m) => isStr(m.query),
  fillRequest: (m) => isStr(m.id),
  totpFor: (m) => isStr(m.id),
  savePending: (m) => isStr(m.url) && isStr(m.login) && isStr(m.password),
  getPending: () => true,
  discardPending: () => true,
  neverForSite: (m) => isStr(m.host),
  saveNew: (m) => isStr(m.url) && isStr(m.login) && isStr(m.password) && isStr(m.title),
  updatePassword: (m) => isStr(m.id) && isStr(m.password),
  generatePassword: (m) => typeof m.opts === 'object' && m.opts !== null,
  openPopup: () => true,
  fillFromPopup: (m) => isStr(m.id) && Number.isInteger(m.tabId),
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
    return await route(req, origin);
  } catch (e) {
    return fail(errorMessage(e));
  }
}

const currentState = async () => stateOf(await loadSession());

/** http(s) origin of the configured server; plain http only for localhost (dev). */
function serverOrigin(input: string): string {
  let u: URL;
  try { u = new URL(input.trim()); } catch { throw new ExtError('Endereço do servidor inválido.'); }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) throw new ExtError('Use um endereço https:// (http:// só para localhost).');
  if (u.username || u.password) throw new ExtError('Endereço do servidor inválido.');
  return u.origin;
}

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
    // ---- state and account (no touch: polled by the popup, asked by every page load) ----
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
      await touch();
      const { serverUrl } = await loadSession();
      if (!serverUrl) throw new ExtError(NEEDS_SERVER);
      await signIn(serverUrl, req.email, req.password);
      return ok(await currentState());
    }
    case 'unlock':
      extensionOnly(o);
      await touch();
      await unlock(req.password);
      return ok(await currentState());
    case 'lock':
      await lockSession();
      return ok(await currentState());
    case 'signOut':
      extensionOnly(o);
      await signOutSession();
      return ok(await currentState());
    case 'refresh':
      extensionOnly(o);
      await touch();
      await loadVault(true);
      return ok(await currentState());
    case 'openApp': {
      await touch();
      const { serverUrl } = await loadSession();
      if (!serverUrl) throw new ExtError(NEEDS_SERVER);
      await chrome.tabs.create({ url: serverUrl + APP_VAULT_PATH });
      return ok(null);
    }

    // ---- reading the vault (MatchItem only; no secrets) ----
    case 'matchesForUrl': {
      await touch();
      const s = await requireUnlocked();
      // The popup asks for the active tab it looked up itself; a content script only ever gets its own page.
      if (o.kind === 'extension') return ok(matches(s.vault, req.url));
      return ok(matches(s.vault.filter((r) => allowedFor(r.url, o)), o.tabUrl));
    }
    case 'search': {
      extensionOnly(o);
      await touch();
      const s = await requireUnlocked();
      return ok(search(s.vault, req.query));
    }

    // ---- secrets, one record at a time, for the page they belong to ----
    case 'fillRequest': {
      if (o.kind !== 'page') throw new ExtError(INVALID_ORIGIN);
      await touch();
      const r = findRecord((await requireUnlocked()).vault, req.id);
      recordFor(r, o);
      return ok<Credentials>({ login: r.login, password: r.password });
    }
    case 'totpFor': {
      await touch();
      const r = findRecord((await requireUnlocked()).vault, req.id);
      recordFor(r, o);
      if (!r.totp) throw new ExtError('Registro sem código 2FA');
      return ok(await totpCode(r.totp));
    }
    case 'fillFromPopup': {
      extensionOnly(o);
      await touch();
      const r = findRecord((await requireUnlocked()).vault, req.id);
      let tab: chrome.tabs.Tab;
      try { tab = await chrome.tabs.get(req.tabId); } catch { throw new ExtError('Aba não encontrada'); }
      if (!tab.url || !urlsMatch(r.url, tab.url)) throw new ExtError(NOT_THIS_SITE);
      const msg: FillIntoMsg = { type: 'fillInto', login: r.login, password: r.password };
      // Top frame only: the URL just validated is the top frame's; iframes (ads, widgets) never receive credentials.
      try { await chrome.tabs.sendMessage(req.tabId, msg, { frameId: 0 }); } catch { throw new ExtError('Não foi possível preencher nesta página'); }
      return ok(null);
    }

    // ---- captured credentials (Task 8 wires pending.ts here) ----
    case 'savePending':
    case 'getPending':
    case 'discardPending':
    case 'neverForSite':
      return fail(NOT_AVAILABLE);

    // ---- writing ----
    case 'saveNew': {
      await touch();
      await requireUnlocked();
      if (o.kind === 'page' && !allowedFor(req.url, o)) throw new ExtError(NOT_THIS_SITE);
      const id = await saveNewRecord({ url: req.url, login: req.login, password: req.password, title: req.title });
      return ok({ id });
    }
    case 'updatePassword': {
      await touch();
      const r = findRecord((await requireUnlocked()).vault, req.id);
      recordFor(r, o);
      await updateRecordPassword(r.id, req.password);
      return ok(null);
    }

    // ---- utilities ----
    case 'generatePassword':
      await touch();
      return ok(generatePassword(genOptions(req.opts)));
    case 'openPopup': {
      await touch();
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
