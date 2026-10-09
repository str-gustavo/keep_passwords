// Typed messages between the extension contexts (popup, content scripts, offscreen document) and the service worker.
// Every request goes through chrome.runtime.sendMessage and is answered with a `Res`. No response ever carries the
// master password, a key or another record's password; `fillRequest` hands over one record's login and password only
// after the service worker checked that the record belongs to the sender's page. The only other password that crosses
// a message is a freshly generated one (`fillGeneratedFromPopup` → `fillGenerated`), which is not a vault secret.
// Reads (`getState`, `matchesForUrl`, `search`, `getPending`) never extend the session, from the popup or a page; only
// the popup's actions and a page's validated actions count as activity (router.ts, POPUP_ACTIVITY).

export type ExtStatus = 'needs-server' | 'signed-out' | 'locked' | 'unlocked';
export interface ExtState { status: ExtStatus; serverUrl: string | null; email: string | null; lockMinutes: number; recordCount: number }
export interface MatchItem { id: string; title: string; login: string; url: string; hasTotp: boolean }
export interface GenOptions { length: number; upper: boolean; lower: boolean; digits: boolean; symbols: boolean; excludeAmbiguous: boolean }
export type Req =
  | { type: 'getState' } | { type: 'setServer'; url: string } | { type: 'signIn'; email: string; password: string }
  | { type: 'unlock'; password: string } | { type: 'lock' } | { type: 'signOut' } | { type: 'refresh'; force?: boolean } | { type: 'openApp' }
  | { type: 'matchesForUrl'; url: string } | { type: 'search'; query: string }
  | { type: 'fillRequest'; id: string } | { type: 'totpFor'; id: string }
  | { type: 'revealPassword'; id: string }                  // popup.html only → { password } (copy to clipboard)
  | { type: 'savePending'; url: string; login: string; password: string } | { type: 'getPending' } | { type: 'discardPending' } | { type: 'neverForSite'; host: string }
  // From a content script only `title` / `id` count: the url, login and password come from the credential that tab
  // captured (savePending), never from the payload. The popup passes them explicitly.
  | { type: 'saveNew'; title: string; url?: string; login?: string; password?: string } | { type: 'updatePassword'; id: string; password?: string }
  | { type: 'generatePassword'; opts: GenOptions }
  | { type: 'openPopup' }
  | { type: 'fillFromPopup'; id: string; tabId: number }
  // popup.html only. After the popup wrote to the clipboard itself: schedule the service worker's 30 s clear, which
  // survives the popup closing. `token` is 16 random bytes (base64), unrelated to what was copied: the clipboard's
  // content never reaches the service worker.
  | { type: 'clipboardArm'; token: string }
  // popup.html only → FillGeneratedResult. "Usar nesta página": the service worker checks the tab is a web page and
  // relays the generator's password to its top frame (FillGeneratedMsg). Never logged nor stored.
  | { type: 'fillGeneratedFromPopup'; tabId: number; password: string };
export type Res<T = unknown> = { ok: true; data: T } | { ok: false; error: string };
/**
 * A credential captured on submit, waiting for "Salvar?" (service worker only, in storage.session; never sent out).
 * `url` is the page origin; `tabId` is the tab whose content script captured it — only that tab can see or use it.
 */
export interface Pending { url: string; host: string; login: string; password: string; createdAt: number; existingId: string | null; kind: 'new' | 'update'; tabId?: number }
/**
 * `getPending` answer: what the save bar shows, never the password. `title` is the suggested record title (the host);
 * `locked` means the vault must be unlocked first (the capture is kept meanwhile; existingId/existingTitle are null).
 */
export interface PendingSummary { kind: 'new' | 'update'; login: string; host: string; title: string; existingId: string | null; existingTitle: string | null; locked: boolean }

/** `fillRequest` answer: the one record the user picked, for the page it was checked against. */
export interface Credentials { login: string; password: string; hasTotp: boolean }
/** `revealPassword` answer (popup only). */
export interface RevealedPassword { password: string }
/** `totpFor` answer. */
export interface TotpCode { code: string; remaining: number; period: number }
/** `openPopup` answer: false when Chrome refused (no user gesture, unsupported); the UI then explains the toolbar icon. */
export interface OpenPopupResult { opened: boolean }
/**
 * Service worker → content script (top frame of the validated tab) after `fillFromPopup`. Carries no secret: the content
 * script answers by sending `fillRequest` with this id, which the service worker validates against its real URL.
 */
export interface FillIntoMsg { type: 'fillInto'; id: string }
/** Service worker → content script (top frame of a web tab) after `fillGeneratedFromPopup`; answered with FillGeneratedReply. */
export interface FillGeneratedMsg { type: 'fillGenerated'; password: string }
/** The content script's answer to `fillGenerated`: how many password fields it filled (`ok` when at least one). */
export interface FillGeneratedReply { ok: boolean; filled: number }
/** `fillGeneratedFromPopup` answer. */
export interface FillGeneratedResult { filled: number }
/** Service worker → its offscreen document: write an empty string to the clipboard; answered `{ ok: boolean }`. */
export interface OffscreenClearMsg { type: 'offscreenClearClipboard' }

/**
 * A `{ ok: false }` answer from the service worker. Its message was written for the user (pt-BR, no secrets), unlike a
 * transport failure (e.g. "Could not establish connection"), which `send` lets through as a plain Error.
 */
export class SwError extends Error {
  constructor(message: string) { super(message); this.name = 'SwError'; }
}

/** chrome.runtime.sendMessage wrapper: resolves with `data`, throws a SwError carrying the pt-BR message on `{ ok: false }`. */
export async function send<T>(req: Req): Promise<T> {
  const res = (await chrome.runtime.sendMessage(req)) as Res<T> | undefined;
  if (!res || typeof res !== 'object') throw new Error('O Nexus Passwords não respondeu. Tente novamente.');
  if (!res.ok) throw new SwError(res.error);
  return res.data;
}
