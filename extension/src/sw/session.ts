// The service worker's whole state, kept in chrome.storage.session (memory-only, wiped when the browser closes,
// readable only by trusted extension contexts) — never in module memory, since Chrome may stop the worker at any time,
// and never in storage.local. Only the server origin (not secret) is mirrored to storage.local.
import type { SessionUser } from '@app/api/types';
import type { RecordData } from '@app/record-types/record-data';
import { DEFAULT_LOCK_MINUTES, MAX_LOCK_MINUTES, SERVER_KEY, SESSION_KEY } from '@/shared/constants';
import type { ExtState, ExtStatus, Pending } from '@/shared/messages';
import { ExtError } from './api';

/** base64 of the raw AES data key and of the PKCS#8 RSA private key. */
export interface SessionSecrets { dataKeyRaw: string; privateKeyPkcs8: string }
/**
 * A decrypted, fillable record. `data` (the full RecordData) and `recordKeyRaw` (base64 of the record's AES key) exist
 * so a password update can re-encrypt the whole record; they stay in storage.session and are never sent to the popup or
 * a content script (those get MatchItem).
 */
export interface VaultRecordLite {
  id: string; type: string; title: string; login: string; password: string; url: string; totp: string;
  permission: 'owner' | 'edit' | 'view'; updatedAt: string; data: RecordData; recordKeyRaw: string;
}
export interface SessionData {
  serverUrl: string | null; token: string | null; user: SessionUser | null; secrets: SessionSecrets | null;
  vault: VaultRecordLite[]; lastActivity: number; lastRefresh: number; pending: Pending | null;
}

const empty = (): SessionData => ({ serverUrl: null, token: null, user: null, secrets: null, vault: [], lastActivity: 0, lastRefresh: 0, pending: null });

export async function loadSession(): Promise<SessionData> {
  const [stored, local] = await Promise.all([chrome.storage.session.get(SESSION_KEY), chrome.storage.local.get(SERVER_KEY)]);
  const raw = stored[SESSION_KEY];
  const s: SessionData = { ...empty(), ...(raw && typeof raw === 'object' ? (raw as Partial<SessionData>) : {}) };
  // After a browser restart storage.session is empty; the configured server survives in storage.local.
  const mirrored = local[SERVER_KEY];
  if (!s.serverUrl && typeof mirrored === 'string' && mirrored) s.serverUrl = mirrored;
  return s;
}

// Every write is a read-merge-write of one object, so writes are chained: two concurrent handlers (a touch() and a
// sign-in, say) would otherwise lose one another's fields. All writers live in this worker, so a module-level chain
// is enough.
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

async function write(current: SessionData, patch: Partial<SessionData>): Promise<void> {
  await chrome.storage.session.set({ [SESSION_KEY]: { ...current, ...patch } });
  if ('serverUrl' in patch) {
    if (patch.serverUrl) await chrome.storage.local.set({ [SERVER_KEY]: patch.serverUrl });
    else await chrome.storage.local.remove(SERVER_KEY);
  }
}

/** Merges `patch` into the stored session. */
export function saveSession(patch: Partial<SessionData>): Promise<void> {
  return serialized(async () => write(await loadSession(), patch));
}

/**
 * Atomic conditional update: `fn` sees the current session and returns the patch to merge, or null to leave it alone.
 * Resolves to whether something was written. Used where a slow operation must not resurrect state that changed meanwhile
 * (a vault download finishing after a lock).
 */
export function updateSession(fn: (s: SessionData) => Partial<SessionData> | null): Promise<boolean> {
  return serialized(async () => {
    const current = await loadSession();
    const patch = fn(current);
    if (!patch) return false;
    await write(current, patch);
    return true;
  });
}

export const touch = (): Promise<void> => saveSession({ lastActivity: Date.now() });

const LOCKED: Partial<SessionData> = { secrets: null, vault: [], pending: null };
/** Patch that forgets the account (token, user, keys, vault, pending) but keeps the configured server. */
export const SIGNED_OUT: Partial<SessionData> = { token: null, user: null, secrets: null, vault: [], pending: null, lastActivity: 0, lastRefresh: 0 };

/** Forgets the keys, the decrypted vault and any captured credential; the token stays so the master password alone unlocks again. */
export const lockSession = (): Promise<void> => saveSession(LOCKED);

/** Sign-out: everything but the server origin. */
export const signOutSession = (): Promise<void> => saveSession(SIGNED_OUT);

/** Forgets everything, the configured server included (server change; sign-out re-saves the server afterwards). */
export function clearSession(): Promise<void> {
  return serialized(async () => {
    await chrome.storage.session.remove(SESSION_KEY);
    await chrome.storage.local.remove(SERVER_KEY);
  });
}

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
  return updateSession((s) => (statusOf(s) === 'unlocked' && now - s.lastActivity >= lockMinutesOf(s.user) * 60_000 ? LOCKED : null));
}
