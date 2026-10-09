// Sign-in, unlock and the decrypted vault, all inside the service worker. Keys are derived and records decrypted with
// the web app's own libraries (@app/crypto, @app/vault/decrypt); the plaintext lives only in storage.session.
import type { LoginResponse, PreloginResponse, SessionUser, VaultResponse } from '@app/api/types';
import { computeAuthKey, unlockDataKey } from '@app/crypto/account';
import { decryptBytes, decryptJson, encryptJson, exportAesKey, generateAesKey, importAesKey, wrapAesKey } from '@app/crypto/aes';
import { fromBase64, toBase64 } from '@app/crypto/encoding';
import { assertKdfIterations } from '@app/crypto/kdf';
import { importPrivateKey } from '@app/crypto/rsa';
import { emptyRecordData, recordDataSchema, touchPasswordDates, type RecordData } from '@app/record-types/record-data';
import { decryptVault } from '@app/vault/decrypt';
import { EMAIL_KEY, REFRESH_MIN_MS, SEARCH_LIMIT } from '@/shared/constants';
import { hostOf, originOf, urlsMatch } from '@/shared/domain';
import { ExtError } from '@/shared/errors';
import type { MatchItem } from '@/shared/messages';
import { ExtApi, ExtApiError } from './api';
import {
  SIGNED_OUT, loadSession, requireUnlocked, saveSession, updateSession,
  type SessionData, type SessionSecrets, type VaultRecordLite,
} from './session';

type DecryptedRecord = Awaited<ReturnType<typeof decryptVault>>['records'][number];

/** Record types whose login/password/url the extension fills and searches. */
const FILLABLE_TYPES = new Set(['login', 'bankAccount', 'membership', 'server', 'databaseCredentials', 'wifi']);
const MAX_TITLE = 500; // recordDataSchema's limit: a longer title would make the record undecryptable in the app
export const READ_ONLY_MESSAGE = 'Você só tem permissão de leitura neste registro.';

// ---------------------------------------------------------------------------------------------------------------
// Pure helpers (no secrets in what they return)

const toItem = (r: VaultRecordLite): MatchItem => ({ id: r.id, title: r.title, login: r.login, url: r.url, hasTotp: r.totp.length > 0 });
const byTitle = (a: VaultRecordLite, b: VaultRecordLite) => a.title.localeCompare(b.title, 'pt-BR', { sensitivity: 'base' });

/** Records whose URL has the page's registrable domain, sorted by title, as MatchItem (no password, TOTP or key). */
export function matches(vault: VaultRecordLite[], pageUrl: string): MatchItem[] {
  return vault.filter((r) => urlsMatch(r.url, pageUrl)).sort(byTitle).map(toItem);
}

/** Case-insensitive search over title, login and URL (everything when the query is blank), at most SEARCH_LIMIT items. */
export function search(vault: VaultRecordLite[], query: string): MatchItem[] {
  const q = query.trim().toLocaleLowerCase('pt-BR');
  const hits = q ? vault.filter((r) => [r.title, r.login, r.url].some((v) => v.toLocaleLowerCase('pt-BR').includes(q))) : [...vault];
  return hits.sort(byTitle).slice(0, SEARCH_LIMIT).map(toItem);
}

export function findRecord(vault: VaultRecordLite[], id: string): VaultRecordLite {
  const r = vault.find((x) => x.id === id);
  if (!r) throw new ExtError('Registro não encontrado');
  return r;
}

/** The fillable fields only: the rest of the RecordData (notes, custom fields, attachments…) is not kept. */
async function toLite(r: DecryptedRecord): Promise<VaultRecordLite | null> {
  if (!r.data || !r.key || r.deletedAt !== null || !FILLABLE_TYPES.has(r.type)) return null;
  const f = r.data.fields;
  return {
    id: r.id, type: r.type, title: r.data.title, login: f.login ?? '', password: f.password ?? '', url: f.url ?? '', totp: f.totp ?? '',
    permission: r.access.permission, updatedAt: r.updatedAt, recordKeyRaw: toBase64(await exportAesKey(r.key)),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Network calls

/** An authenticated call; a 401 means the token is dead, so the extension signs out locally (server kept). */
async function authed<T>(s: Pick<SessionData, 'serverUrl' | 'token'>, call: (api: ExtApi) => Promise<T>): Promise<T> {
  if (!s.serverUrl || !s.token) throw new ExtError('Entre novamente na sua conta.');
  const token = s.token;
  try {
    return await call(new ExtApi(s.serverUrl, token));
  } catch (e) {
    // Only if no newer sign-in replaced the token meanwhile.
    if (e instanceof ExtApiError && e.status === 401) await updateSession((cur) => (cur.token === token ? SIGNED_OUT : null));
    throw e;
  }
}

/** Derives the data key from the master password and opens the RSA private key; refuses unsafe KDF parameters. */
async function deriveSecrets(user: SessionUser, password: string): Promise<SessionSecrets> {
  assertKdfIterations(user.kdfIterations);
  const dataKey = await unlockDataKey(user.email, password, user.kdfSalt, user.kdfIterations, user.encDataKey);
  let privateKeyPkcs8: Uint8Array;
  try {
    privateKeyPkcs8 = await decryptBytes(dataKey, fromBase64(user.encPrivateKey));
    await importPrivateKey(privateKeyPkcs8);
  } catch {
    throw new ExtError('Não foi possível abrir a chave privada da conta.');
  }
  return { dataKeyRaw: toBase64(await exportAesKey(dataKey)), privateKeyPkcs8: toBase64(privateKeyPkcs8) };
}

/**
 * Whether a failed first download drops the keys again: only crypto failures (anything that is not a user-facing
 * ExtError: keys that do not import, a malformed vault) and auth failures (401/403; a 401 has signed out already).
 * A vault too large for storage.session ("Cofre grande demais…"), a network or a server error keeps them: the message
 * says what went wrong, and a refresh retries without asking for the master password again.
 */
const dropsKeys = (e: unknown): boolean =>
  !(e instanceof ExtError) || (e instanceof ExtApiError && (e.status === 401 || e.status === 403));

/** First download after sign-in/unlock; on a crypto or auth failure the keys are dropped again (locked). */
async function initialLoad(): Promise<void> {
  try {
    await loadVault(true);
  } catch (e) {
    if (dropsKeys(e)) await saveSession({ secrets: null, vault: [] });
    throw e;
  }
}

export async function signIn(serverUrl: string, email: string, password: string): Promise<void> {
  const mail = email.trim();
  const api = new ExtApi(serverUrl, null);
  const pre = await api.post<PreloginResponse>('/api/auth/prelogin', { email: mail });
  assertKdfIterations(pre.kdfIterations); // anti-downgrade before deriving anything
  const authKey = await computeAuthKey(mail, password, pre.kdfSalt, pre.kdfIterations);
  const { user, token } = await api.post<LoginResponse>('/api/auth/login', { email: mail, authKey });
  if (!token) throw new ExtError('O servidor não emitiu uma sessão para a extensão.');
  const secrets = await deriveSecrets(user, password); // checks user.kdfIterations again
  await saveSession({ serverUrl, token, user, secrets, vault: [], pending: null, lastRefresh: 0, lastActivity: Date.now() });
  await chrome.storage.local.set({ [EMAIL_KEY]: user.email });
  await initialLoad();
}

/** Re-derives the keys with the master password. The account is re-read first (a password change elsewhere, new lock minutes). */
export async function unlock(password: string): Promise<void> {
  const s = await loadSession();
  if (!s.serverUrl || !s.token || !s.user) throw new ExtError('Entre novamente na sua conta.');
  const { user } = await authed(s, (api) => api.get<{ user: SessionUser }>('/api/auth/me'));
  const secrets = await deriveSecrets(user, password);
  const stored = await updateSession((cur) => (cur.token === s.token ? { user, secrets, lastRefresh: 0, lastActivity: Date.now() } : null));
  if (!stored) throw new ExtError('Entre novamente na sua conta.');
  await initialLoad();
}

let latestLoad = 0;
let inFlight: Promise<VaultResponse | null> | null = null;

/** Starts a download (or joins the in-flight one unless `force`); resolves to the downloaded response, or null when skipped. */
function startLoad(force: boolean): Promise<VaultResponse | null> {
  if (!force && inFlight) return inFlight;
  const run = download(force, ++latestLoad);
  inFlight = run;
  void run.finally(() => { if (inFlight === run) inFlight = null; }).catch(() => undefined);
  return run;
}

/**
 * Downloads and decrypts the vault into the session. Automatic calls run at most once per REFRESH_MIN_MS and share an
 * in-flight download; `force` always downloads. A snapshot is dropped when the vault was locked or re-keyed meanwhile,
 * or when a newer download started (its result wins). A vault too large for storage.session rejects with a
 * StorageQuotaError ("Cofre grande demais…", session.ts) and leaves the stored vault as it was.
 */
export async function loadVault(force = false): Promise<void> {
  await startLoad(force);
}

async function download(force: boolean, seq: number): Promise<VaultResponse | null> {
  const s = await requireUnlocked();
  if (!force && Date.now() - s.lastRefresh < REFRESH_MIN_MS) return null;
  const { secrets } = s;
  const keys = { dataKey: await importAesKey(fromBase64(secrets.dataKeyRaw)), privateKey: await importPrivateKey(fromBase64(secrets.privateKeyPkcs8)) };
  const dto = await authed(s, (api) => api.get<VaultResponse>('/api/vault'));
  const { records } = await decryptVault(dto, keys);
  const vault = (await Promise.all(records.map(toLite))).filter((r): r is VaultRecordLite => r !== null);
  await updateSession((cur) =>
    cur.token === s.token && cur.secrets?.dataKeyRaw === secrets.dataKeyRaw && seq === latestLoad ? { vault, lastRefresh: Date.now() } : null,
  );
  return dto;
}

/** One record's full RecordData, decrypted from its blob and validated as the web app does (vault/decrypt.ts). */
async function openRecordData(key: CryptoKey, encData: string): Promise<RecordData> {
  let parsed: ReturnType<typeof recordDataSchema.safeParse> | null;
  try { parsed = recordDataSchema.safeParse(await decryptJson(key, encData)); } catch { parsed = null; }
  if (!parsed?.success) throw new ExtError('Não foi possível abrir este registro. Atualize a senha pelo app.');
  return parsed.data;
}

/** Creates a login record (fresh record key wrapped by the data key) and refreshes the vault; resolves to its id. */
export async function saveNewRecord(args: { url: string; login: string; password: string; title: string }): Promise<string> {
  const s = await requireUnlocked();
  const url = originOf(args.url) ?? ''; // the stored record URL: no path or query that could carry tokens
  const fields: Record<string, string> = {};
  if (args.login) fields.login = args.login;
  if (args.password) fields.password = args.password;
  if (url) fields.url = url;
  const title = (args.title.trim() || hostOf(args.url) || 'Login').slice(0, MAX_TITLE);
  const data = touchPasswordDates(null, { ...emptyRecordData('login'), title, fields });
  const dataKey = await importAesKey(fromBase64(s.secrets.dataKeyRaw));
  const key = await generateAesKey();
  const body = { type: 'login', encData: await encryptJson(key, data), encKey: await wrapAesKey(dataKey, key) };
  const { record } = await authed(s, (api) => api.post<{ record: { id: string } }>('/api/records', body));
  // The record exists now; a failed refresh only leaves the list stale until the next one.
  await loadVault(true).catch(() => undefined);
  return record.id;
}

/**
 * Replaces the password of a record the user can edit. The vault is downloaded first and this record's full data is
 * decrypted from that fresh copy (the session keeps only the fillable fields), so the whole record is re-encrypted from
 * its latest version (no other field is reverted); then the vault is refreshed again.
 */
export async function updateRecordPassword(id: string, password: string): Promise<void> {
  const fresh = await startLoad(true);
  const s = await requireUnlocked();
  const r = findRecord(s.vault, id);
  if (r.permission === 'view') throw new ExtError(READ_ONLY_MESSAGE);
  const dto = fresh?.records.find((x) => x.id === r.id);
  if (!dto) throw new ExtError('Registro não encontrado');
  const key = await importAesKey(fromBase64(r.recordKeyRaw));
  const data = await openRecordData(key, dto.encData);
  const next: RecordData = touchPasswordDates(data, { ...data, fields: { ...data.fields, password } });
  const encData = await encryptJson(key, next);
  await authed(s, (api) => api.put(`/api/records/${encodeURIComponent(r.id)}`, { encData }));
  await loadVault(true).catch(() => undefined);
}
