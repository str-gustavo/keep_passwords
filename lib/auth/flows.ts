import { api, ApiClientError } from '@/lib/api/client';
import type { LoginResponse, PreloginResponse, SessionUser } from '@/lib/api/types';
import { computeAuthKey, computeRecoveryAuthKey, createAccountMaterial, createRecoveryMaterial, recoverDataKey, rewrapForNewPassword, unlockDataKey, unlockPrivateKey, WrongPasswordError } from '@/lib/crypto/account';
import { KDF_ITERATIONS } from '@/lib/crypto/kdf';
import { t } from '@/lib/i18n/pt-br';
import { loadVault } from '@/lib/vault/actions';
import { useVault } from '@/lib/vault/store';

/** Anti-downgrade: never derive or use keys with fewer PBKDF2 iterations than this client's floor. */
function assertKdfParams(iterations: unknown): void {
  if (typeof iterations !== 'number' || !Number.isInteger(iterations) || iterations < KDF_ITERATIONS) throw new Error(t.unsafeServerParams);
}

// A stale-cookie cleanup may still be in flight when the user submits; requests that set the
// session cookie wait for it so its logout response can never clear the new cookie.
let staleSessionCleanup: Promise<void> = Promise.resolve();

/** The middleware only checks cookie presence: if the cookie no longer maps to a valid session, clear it. */
export function clearStaleSession(): Promise<void> {
  staleSessionCleanup = (async () => {
    try { await api.get('/api/auth/me'); }
    catch (e) {
      if (e instanceof ApiClientError && e.status === 401) {
        try { await api.post('/api/auth/logout'); } catch { /* best effort */ }
      }
    }
  })();
  return staleSessionCleanup;
}

async function unlockSession(user: SessionUser, dataKey: CryptoKey) {
  assertKdfParams(user.kdfIterations);
  const privateKey = await unlockPrivateKey(dataKey, user.encPrivateKey);
  useVault.getState().setUser(user);
  useVault.getState().setKeys({ dataKey, privateKey });
}

export async function signUp(email: string, name: string, password: string): Promise<{ phrase: string }> {
  const m = await createAccountMaterial(email, password);
  await staleSessionCleanup;
  // Built field by field: the password, the recovery phrase and the raw keys never leave the device.
  const { user } = await api.post<LoginResponse>('/api/auth/register', {
    email, name, authKey: m.authKey, kdfSalt: m.kdfSalt, kdfIterations: m.kdfIterations, encDataKey: m.encDataKey, publicKey: m.publicKey, encPrivateKey: m.encPrivateKey,
    recoveryAuthKey: m.recovery.recoveryAuthKey, recoverySalt: m.recovery.recoverySalt, encDataKeyRecovery: m.recovery.encDataKeyRecovery,
  });
  await unlockSession(user, m.dataKey);
  // A brand-new account has an empty vault: no round trip whose failure could keep the phrase from being shown.
  useVault.getState().setVault({ records: [], folders: [] });
  return { phrase: m.recoveryPhrase };
}

export async function signIn(email: string, password: string): Promise<void> {
  const pre = await api.post<PreloginResponse>('/api/auth/prelogin', { email });
  assertKdfParams(pre.kdfIterations);
  const authKey = await computeAuthKey(email, password, pre.kdfSalt, pre.kdfIterations);
  await staleSessionCleanup;
  const { user } = await api.post<LoginResponse>('/api/auth/login', { email, authKey });
  assertKdfParams(user.kdfIterations);
  const dataKey = await unlockDataKey(user.email, password, user.kdfSalt, user.kdfIterations, user.encDataKey);
  await unlockSession(user, dataKey);
  await loadVault();
}

export const recoverStart = (email: string) => api.post<{ recoverySalt: string }>('/api/auth/recovery/start', { email });

export async function recoverComplete(email: string, phrase: string, newPassword: string, recoverySalt: string): Promise<{ phrase: string }> {
  const recoveryAuthKey = await computeRecoveryAuthKey(phrase, recoverySalt);
  const v = await api.post<{ token: string; encDataKeyRecovery: string }>('/api/auth/recovery/verify', { email, recoveryAuthKey });
  const dataKey = await recoverDataKey(phrase, recoverySalt, v.encDataKeyRecovery);
  const n = await rewrapForNewPassword(email, newPassword, dataKey);
  const rec = await createRecoveryMaterial(dataKey);
  await staleSessionCleanup;
  const { user } = await api.post<LoginResponse>('/api/auth/recovery/complete', {
    token: v.token, newAuthKey: n.authKey, kdfSalt: n.kdfSalt, kdfIterations: n.kdfIterations, encDataKey: n.encDataKey,
    recoveryAuthKey: rec.recoveryAuthKey, recoverySalt: rec.recoverySalt, encDataKeyRecovery: rec.encDataKeyRecovery,
  });
  await unlockSession(user, dataKey);
  // The old phrase is already invalid here: a load failure must not hide the new one (the store keeps status 'error').
  await loadVault().catch(() => undefined);
  return { phrase: rec.phrase };
}

/** Only same-origin absolute paths; anything else (other origins, protocol-relative, backslashes, whitespace) falls back. */
export function safeNextPath(next: string | null | undefined, fallback = '/cofre'): string {
  return next && /^\/(?![/\\])[^\s\\]*$/.test(next) ? next : fallback;
}

/** Maps a flow error to a pt-BR message safe to show; unknown errors never leak internals. */
export function authErrorMessage(e: unknown, wrongSecretMessage: string = t.wrongMasterPassword): string {
  if (e instanceof WrongPasswordError) return wrongSecretMessage;
  if (e instanceof ApiClientError) return e.message;
  if (e instanceof Error && e.message === t.unsafeServerParams) return e.message;
  return t.genericAuthError;
}
