/** A captured credential waiting for "Salvar?" expires after this long. */
export const PENDING_TTL_MS = 5 * 60_000;
/** Minimum time between two automatic vault downloads (popup opening); `refresh`, saves and unlocks bypass it. */
export const REFRESH_MIN_MS = 30_000;
/** chrome.storage.session key holding the SessionData core (token, user, keys, pending; TRUSTED_CONTEXTS only). */
export const SESSION_KEY = 'nexus';
/** chrome.storage.session key of the decrypted vault (own key: other session writes never rewrite it). */
export const SESSION_VAULT_KEY = 'nexus.vault';
/** chrome.storage.session key of lastActivity (own key: a touch is a single small write). */
export const SESSION_ACTIVITY_KEY = 'nexus.lastActivity';
/** chrome.storage.local: registrable domains the user chose "Nunca para este site" for (no secrets). */
export const NEVER_KEY = 'neverHosts';
/** chrome.storage.local: the last e-mail used to sign in (no secrets). */
export const EMAIL_KEY = 'lastEmail';
/** chrome.storage.local: the configured server origin (not secret), so it survives a browser restart. */
export const SERVER_KEY = 'serverUrl';
/** chrome.alarms name of the once-a-minute idle check. */
export const AUTOLOCK_ALARM = 'autolock';
/** A copy made from the popup is cleared from the clipboard after this long (same policy as the web app). */
export const CLIPBOARD_CLEAR_MS = 30_000;
/** chrome.alarms name of the one-shot clipboard clear, CLIPBOARD_CLEAR_MS after the popup's last copy. */
export const CLIPBOARD_ALARM = 'clipboard-clear';
/** chrome.storage.session key of the armed clipboard clear: `{ token, at }` only, never what was copied. */
export const CLIPBOARD_KEY = 'nexus.clipboard';
/** Auto-lock minutes when the account has no valid setting (same default as the web app). */
export const DEFAULT_LOCK_MINUTES = 10;
/** Upper bound the server accepts for lockMinutes; anything above it is clamped. */
export const MAX_LOCK_MINUTES = 60;
/** At most this many results for `search`. */
export const SEARCH_LIMIT = 50;
/** Nexus orange, for the action badge. */
export const BADGE_COLOR = '#FA681F';
/** Path of the web app's vault, opened by `openApp`. */
export const APP_VAULT_PATH = '/cofre';
