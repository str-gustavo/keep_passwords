/** A captured credential waiting for "Salvar?" expires after this long. */
export const PENDING_TTL_MS = 5 * 60_000;
/** Minimum time between two automatic vault downloads (popup opening); `refresh`, saves and unlocks bypass it. */
export const REFRESH_MIN_MS = 30_000;
/** chrome.storage.session key holding the whole SessionData object (secrets included; TRUSTED_CONTEXTS only). */
export const SESSION_KEY = 'nexus';
/** chrome.storage.local: registrable domains the user chose "Nunca para este site" for (no secrets). */
export const NEVER_KEY = 'neverHosts';
/** chrome.storage.local: the last e-mail used to sign in (no secrets). */
export const EMAIL_KEY = 'lastEmail';
/** chrome.storage.local: the configured server origin (not secret), so it survives a browser restart. */
export const SERVER_KEY = 'serverUrl';
/** chrome.alarms name of the once-a-minute idle check. */
export const AUTOLOCK_ALARM = 'autolock';
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
