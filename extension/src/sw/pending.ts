// Credentials captured when a login/signup form is submitted ("Salvar no Nexus Passwords?" / "Atualizar a senha?")
// and the "Nunca para este site" list.
// - The captured credential is a secret: it lives only in storage.session (SessionData.pending), for the one tab that
//   captured it and at most PENDING_TTL_MS. Content scripts get a PendingSummary (no password); saving happens here.
// - The never-list is not secret: registrable domains in storage.local (trusted contexts only, so pages ask the SW).
import { NEVER_KEY, PENDING_TTL_MS } from '@/shared/constants';
import { hostOf, originOf, registrableDomain, urlsMatch } from '@/shared/domain';
import { ExtError } from '@/shared/errors';
import type { Pending, PendingSummary } from '@/shared/messages';
import { updateSession, type SessionData, type VaultRecordLite } from './session';

export interface CaptureInput { url: string; login: string; password: string; tabId?: number }

/** Logins compare trimmed and case-insensitively (an e-mail typed with another case is the same account). */
export const sameLogin = (a: string, b: string): boolean => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

/**
 * What a credential means for the vault: a new login; an update of an editable record with the same site and login;
 * or nothing (null) when such a record already holds this password, or when only read-only shared records have this
 * login (the user could not update them).
 */
function classify(vault: VaultRecordLite[], url: string, login: string, password: string): Pick<Pending, 'kind' | 'existingId'> | null {
  const same = vault.filter((r) => urlsMatch(r.url, url) && sameLogin(r.login, login));
  if (same.length === 0) return { kind: 'new', existingId: null };
  if (same.some((r) => r.password === password)) return null;
  const editable = same.find((r) => r.permission !== 'view');
  return editable ? { kind: 'update', existingId: editable.id } : null;
}

/**
 * The pending item for a submitted credential, or null when there is nothing to offer: no password, not an http(s)
 * page, the Nexus server itself (its master-password form is never captured) or already stored as is. Pure: the
 * never-list is checked by captureChecked. While locked the vault is empty, so the kind is re-checked on getPending.
 */
export function capture(s: SessionData, input: CaptureInput, now = Date.now()): Pending | null {
  const host = hostOf(input.url);
  const url = originOf(input.url); // the page origin only: a path or query may carry tokens
  if (!host || !url || !input.password) return null;
  if (s.serverUrl && hostOf(s.serverUrl) === host) return null;
  const login = input.login.trim();
  const c = classify(s.vault, input.url, login, input.password);
  if (!c) return null;
  return { url, host, login, password: input.password, createdAt: now, ...c, ...(input.tabId !== undefined ? { tabId: input.tabId } : {}) };
}

/** capture(), unless the site is in the never-list. */
export async function captureChecked(s: SessionData, input: CaptureInput, now = Date.now()): Promise<Pending | null> {
  if (await isNeverHost(input.url)) return null;
  return capture(s, input, now);
}

/** Past its TTL — or "captured in the future" (the clock moved back), which cannot be trusted either. */
const isExpired = (p: Pending, now: number) => now < p.createdAt || now - p.createdAt > PENDING_TTL_MS;

/** The pending item for a page of the same registrable domain, unless expired; with `tabId`, only if that tab captured it. */
export function pendingFor(s: SessionData, pageUrl: string, now = Date.now(), tabId?: number): Pending | null {
  const p = s.pending;
  if (!p || isExpired(p, now) || !urlsMatch(p.url, pageUrl)) return null;
  if (tabId !== undefined && p.tabId !== tabId) return null;
  return p;
}

/**
 * What the save bar may know (never the password). Unlocked, the item is re-checked against the current vault (it may
 * have been captured while locked, or saved from the popup since): null when there is nothing left to offer.
 */
export function summarize(s: SessionData, p: Pending, locked: boolean): PendingSummary | null {
  const shown = { login: p.login, host: p.host, title: p.host };
  if (locked) return { ...shown, kind: p.kind, existingId: null, existingTitle: null, locked: true };
  const c = classify(s.vault, p.url, p.login, p.password);
  if (!c) return null;
  const existing = c.existingId === null ? undefined : s.vault.find((r) => r.id === c.existingId);
  return { ...shown, kind: c.kind, existingId: c.existingId, existingTitle: existing?.title ?? null, locked: false };
}

/** Forgets `p` (saved, dismissed or moot) — unless another capture replaced it meanwhile. */
export function dropPending(p: Pending): Promise<boolean> {
  return updateSession((cur) => {
    const c = cur.pending;
    return c && c.createdAt === p.createdAt && c.tabId === p.tabId && c.url === p.url ? { pending: null } : null;
  });
}

/** Forgets an expired capture (the auto-lock alarm runs this every minute), so a password never outlives its TTL. */
export function purgeExpiredPending(now = Date.now()): Promise<boolean> {
  return updateSession((cur) => (cur.pending && isExpired(cur.pending, now) ? { pending: null } : null));
}

// ---------------------------------------------------------------------------------------------------------------
// Never-list

const isStr = (v: unknown): v is string => typeof v === 'string';
async function readNever(): Promise<string[]> {
  const v = (await chrome.storage.local.get(NEVER_KEY))[NEVER_KEY];
  return Array.isArray(v) ? v.filter(isStr) : [];
}

export async function isNeverHost(url: string): Promise<boolean> {
  const host = hostOf(url);
  return host !== null && (await readNever()).includes(registrableDomain(host));
}

// Read-modify-write of storage.local, chained so concurrent additions are all kept.
let neverQueue: Promise<unknown> = Promise.resolve();

/** "Nunca para este site": adds the registrable domain of `host` (a host or URL) and drops that site's capture. Resolves to the domain. */
export async function neverForSite(host: string): Promise<string> {
  const h = hostOf(host);
  if (!h) throw new ExtError('Endereço inválido');
  const domain = registrableDomain(h);
  const add = async () => {
    const list = await readNever();
    if (!list.includes(domain)) await chrome.storage.local.set({ [NEVER_KEY]: [...list, domain] });
  };
  const run = neverQueue.then(add, add);
  neverQueue = run.catch(() => undefined);
  await run;
  await updateSession((cur) => (cur.pending && registrableDomain(cur.pending.host) === domain ? { pending: null } : null));
  return domain;
}
