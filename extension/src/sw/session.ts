// The service worker's whole state, kept in chrome.storage.session (memory-only, wiped when the browser closes,
// readable only by trusted extension contexts) — never in module memory, since Chrome may stop the worker at any time,
// and never in storage.local. Only the server origin (not secret) is mirrored to storage.local, and that mirror is
// trusted only when it is a valid origin the user granted host permission for.
//
// Layout: the core (everything but the vault and lastActivity) under SESSION_KEY, the decrypted vault under
// SESSION_VAULT_KEY and lastActivity under SESSION_ACTIVITY_KEY, so a touch or a pending write never rewrites the vault.
import type { SessionUser } from '@app/api/types';
import { DEFAULT_LOCK_MINUTES, MAX_LOCK_MINUTES, SERVER_KEY, SESSION_ACTIVITY_KEY, SESSION_KEY, SESSION_VAULT_KEY } from '@/shared/constants';
import { ExtError } from '@/shared/errors';
import type { ExtState, ExtStatus, Pending } from '@/shared/messages';
import { isServerOrigin } from '@/shared/server-url';

/** base64 of the raw AES data key and of the PKCS#8 RSA private key. */
export interface SessionSecrets { dataKeyRaw: string; privateKeyPkcs8: string }
/**
 * A decrypted, fillable record: only what filling, matching and search need. The full RecordData (notes, custom fields,
 * attachments, history) is not kept — it would only bloat storage.session; a password update decrypts it from a fresh
 * download instead. `recordKeyRaw` (base64 of the record's AES key) is for that update. Both stay in storage.session and
 * are never sent to the popup or a content script (those get MatchItem).
 */
export interface VaultRecordLite {
  id: string; type: string; title: string; login: string; password: string; url: string; totp: string;
  permission: 'owner' | 'edit' | 'view'; updatedAt: string; recordKeyRaw: string;
}
export interface SessionData {
  serverUrl: string | null; token: string | null; user: SessionUser | null; secrets: SessionSecrets | null;
  vault: VaultRecordLite[]; lastActivity: number; lastRefresh: number; pending: Pending | null;
}

const empty = (): SessionData => ({ serverUrl: null, token: null, user: null, secrets: null, vault: [], lastActivity: 0, lastRefresh: 0, pending: null });

/** The stored session as is (no server fallback). Without `withVault` the vault is not read (reported as []). */
async function readStored(withVault: boolean): Promise<SessionData> {
  const got = await chrome.storage.session.get(withVault ? [SESSION_KEY, SESSION_VAULT_KEY, SESSION_ACTIVITY_KEY] : [SESSION_KEY, SESSION_ACTIVITY_KEY]);
  const core = got[SESSION_KEY];
  const vault = got[SESSION_VAULT_KEY];
  const activity = got[SESSION_ACTIVITY_KEY];
  return {
    ...empty(),
    ...(core && typeof core === 'object' ? (core as Partial<SessionData>) : {}),
    vault: Array.isArray(vault) ? (vault as VaultRecordLite[]) : [],
    lastActivity: typeof activity === 'number' ? activity : 0,
  };
}

/** The storage.local mirror, only when it is exactly a valid server origin that still has host permission. */
async function trustedMirror(): Promise<string | null> {
  try {
    const m = (await chrome.storage.local.get(SERVER_KEY))[SERVER_KEY];
    if (!isServerOrigin(m)) return null;
    return (await chrome.permissions.contains({ origins: [`${m}/*`] })) ? m : null;
  } catch {
    return null;
  }
}

/** Stored session plus, when it has no server, the trusted mirror (in memory only). */
async function resolved(withVault: boolean): Promise<SessionData> {
  const s = await readStored(withVault);
  if (!s.serverUrl) s.serverUrl = await trustedMirror();
  return s;
}

// Core writes are read-merge-write, so every write is chained: two concurrent handlers (a touch() and a sign-in, say)
// would otherwise lose one another's fields. All writers live in this worker, so a module-level chain is enough.
// Never call loadSession() (or anything queued) from inside a queued task.
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

export const VAULT_TOO_LARGE_MESSAGE = 'Cofre grande demais para a extensão. Reduza anexos/notas ou use o app.';
/** storage.session refused a write for its size limit (QUOTA_BYTES): in practice, a vault too large to hold decrypted. */
export class StorageQuotaError extends ExtError {
  constructor() { super(VAULT_TOO_LARGE_MESSAGE); this.name = 'StorageQuotaError'; }
}
const isQuotaError = (e: unknown): boolean => /quota/i.test(e instanceof Error ? e.message : String(e));

/** chrome.storage.session.set, with a quota rejection turned into a StorageQuotaError (shown to the user as is). */
async function setSession(items: Record<string, unknown>): Promise<void> {
  try {
    await chrome.storage.session.set(items);
  } catch (e) {
    if (isQuotaError(e)) throw new StorageQuotaError();
    throw e;
  }
}

/** One storage.session.set with only the keys the patch touches; the core is merged onto `current`. */
async function write(current: SessionData, patch: Partial<SessionData>): Promise<void> {
  const { vault, lastActivity, ...corePatch } = patch;
  const items: Record<string, unknown> = {};
  if (Object.keys(corePatch).length > 0) {
    const { vault: _v, lastActivity: _a, ...core } = current;
    items[SESSION_KEY] = { ...core, ...corePatch };
  }
  if (vault !== undefined) items[SESSION_VAULT_KEY] = vault;
  if (lastActivity !== undefined) items[SESSION_ACTIVITY_KEY] = lastActivity;
  if (Object.keys(items).length > 0) await setSession(items);
  if ('serverUrl' in patch) {
    if (patch.serverUrl) await chrome.storage.local.set({ [SERVER_KEY]: patch.serverUrl });
    else await chrome.storage.local.remove(SERVER_KEY);
  }
}

export async function loadSession(): Promise<SessionData> {
  const s = await readStored(true);
  if (!s.serverUrl) {
    const mirrored = await trustedMirror();
    if (mirrored) {
      s.serverUrl = mirrored;
      // Adopt it into the session (after a browser restart), unless a write set a server meanwhile.
      await serialized(async () => {
        const cur = await readStored(false);
        if (!cur.serverUrl) await write(cur, { serverUrl: mirrored });
      });
    }
  }
  return s;
}

const hasCoreFields = (patch: Partial<SessionData>) => Object.keys(patch).some((k) => k !== 'vault' && k !== 'lastActivity');

/** Merges `patch` into the stored session. */
export function saveSession(patch: Partial<SessionData>): Promise<void> {
  return serialized(async () => write(hasCoreFields(patch) ? await resolved(false) : empty(), patch));
}

/**
 * Atomic conditional update: `fn` sees the current session and returns the patch to merge, or null to leave it alone.
 * Resolves to whether something was written. Used where a slow operation must not resurrect state that changed meanwhile
 * (a vault download finishing after a lock).
 */
export function updateSession(fn: (s: SessionData) => Partial<SessionData> | null): Promise<boolean> {
  return serialized(async () => {
    const current = await resolved(true);
    const patch = fn(current);
    if (!patch) return false;
    await write(current, patch);
    return true;
  });
}

const LOCKED: Partial<SessionData> = { secrets: null, vault: [], pending: null };
/** Patch that forgets the account (token, user, keys, vault, pending) but keeps the configured server. */
export const SIGNED_OUT: Partial<SessionData> = { token: null, user: null, secrets: null, vault: [], pending: null, lastActivity: 0, lastRefresh: 0 };

export function lockMinutesOf(user: SessionUser | null): number {
  const m = user?.lockMinutes;
  if (typeof m !== 'number' || !Number.isFinite(m) || m <= 0) return DEFAULT_LOCK_MINUTES;
  return Math.min(MAX_LOCK_MINUTES, Math.max(1, m));
}

export function statusOf(s: SessionData): ExtStatus {
  if (!s.serverUrl) return 'needs-server';
  if (!s.token || !s.user) return 'signed-out';
  if (!s.secrets) return 'locked';
  return 'unlocked';
}

const isExpired = (s: SessionData, now: number) => statusOf(s) === 'unlocked' && now - s.lastActivity >= lockMinutesOf(s.user) * 60_000;

/**
 * Records user activity — unless the vault already sat idle past lockMinutes: then it locks instead, so a late action
 * can never revive an expired session. Atomic with the other writes.
 */
export function touch(now = Date.now()): Promise<void> {
  return serialized(async () => {
    const s = await resolved(false);
    if (isExpired(s, now)) await write(s, LOCKED);
    else await setSession({ [SESSION_ACTIVITY_KEY]: now });
  });
}

/** Forgets the keys, the decrypted vault and any captured credential; the token stays so the master password alone unlocks again. */
export const lockSession = (): Promise<void> => saveSession(LOCKED);

/** Sign-out: everything but the server origin. */
export const signOutSession = (): Promise<void> => saveSession(SIGNED_OUT);

/** Forgets everything, the configured server included (server change; sign-out keeps the server instead). */
export function clearSession(): Promise<void> {
  return serialized(async () => {
    await chrome.storage.session.remove([SESSION_KEY, SESSION_VAULT_KEY, SESSION_ACTIVITY_KEY]);
    await chrome.storage.local.remove(SERVER_KEY);
  });
}

/** What the popup and content scripts may know: no token, no keys, no records — a count only. */
export function stateOf(s: SessionData): ExtState {
  const status = statusOf(s);
  return { status, serverUrl: s.serverUrl, email: s.user?.email ?? null, lockMinutes: lockMinutesOf(s.user), recordCount: status === 'unlocked' ? s.vault.length : 0 };
}

export const LOCKED_MESSAGE = 'Cofre bloqueado';
export type UnlockedSession = SessionData & { serverUrl: string; token: string; user: SessionUser; secrets: SessionSecrets };

/** The session, or an ExtError('Cofre bloqueado') unless it is unlocked. */
export async function requireUnlocked(): Promise<UnlockedSession> {
  const s = await loadSession();
  if (statusOf(s) !== 'unlocked') throw new ExtError(LOCKED_MESSAGE);
  return s as UnlockedSession;
}

/** Locks when the vault is unlocked and idle for at least the account's lockMinutes; resolves to whether it locked. */
export function checkAutoLock(now = Date.now()): Promise<boolean> {
  return serialized(async () => {
    const s = await resolved(false);
    if (!isExpired(s, now)) return false;
    await write(s, LOCKED);
    return true;
  });
}
