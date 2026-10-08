import { api, ApiClientError } from '@/lib/api/client';
import type { LoginResponse, PreloginResponse, SessionUser } from '@/lib/api/types';
import { computeAuthKey, computeRecoveryAuthKey, createAccountMaterial, createRecoveryMaterial, recoverDataKey, rewrapForNewPassword, unlockDataKey, unlockPrivateKey, WrongPasswordError } from '@/lib/crypto/account';
import { assertKdfIterations } from '@/lib/crypto/kdf';
import { t } from '@/lib/i18n/pt-br';
import { loadVault } from '@/lib/vault/actions';
import { useVault } from '@/lib/vault/store';

async function unlockSession(user: SessionUser, dataKey: CryptoKey) {
  assertKdfIterations(user.kdfIterations);
  const privateKey = await unlockPrivateKey(dataKey, user.encPrivateKey);
  useVault.getState().setUser(user);
  useVault.getState().setKeys({ dataKey, privateKey });
}

export async function signUp(email: string, name: string, password: string): Promise<{ phrase: string }> {
  const m = await createAccountMaterial(email, password);
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
  assertKdfIterations(pre.kdfIterations);
  const authKey = await computeAuthKey(email, password, pre.kdfSalt, pre.kdfIterations);
  const { user } = await api.post<LoginResponse>('/api/auth/login', { email, authKey });
  assertKdfIterations(user.kdfIterations);
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
  const { user } = await api.post<LoginResponse>('/api/auth/recovery/complete', {
    token: v.token, newAuthKey: n.authKey, kdfSalt: n.kdfSalt, kdfIterations: n.kdfIterations, encDataKey: n.encDataKey,
    recoveryAuthKey: rec.recoveryAuthKey, recoverySalt: rec.recoverySalt, encDataKeyRecovery: rec.encDataKeyRecovery,
  });
  await unlockSession(user, dataKey);
  // The old phrase is already invalid here: a load failure must not hide the new one (the store keeps status 'error').
  await loadVault().catch(() => undefined);
  return { phrase: rec.phrase };
}

/**
 * Only same-origin absolute paths; anything else (other origins, protocol-relative, backslashes, whitespace,
 * dot segments that normalize to `//host`) falls back. Returns the normalized path.
 */
export function safeNextPath(next: string | null | undefined, fallback = '/cofre'): string {
  if (!next || !/^\/(?![/\\])[^\s\\]*$/.test(next)) return fallback;
  let u: URL;
  try { u = new URL(next, 'http://n'); } catch { return fallback; }
  if (u.origin !== 'http://n' || u.pathname.startsWith('//')) return fallback;
  return u.pathname + u.search + u.hash;
}

/** Maps a flow error to a pt-BR message safe to show; unknown errors never leak internals. */
export function authErrorMessage(e: unknown, wrongSecretMessage: string = t.wrongMasterPassword): string {
  if (e instanceof WrongPasswordError) return wrongSecretMessage;
  if (e instanceof ApiClientError) return e.message;
  if (e instanceof Error && e.message === t.unsafeServerParams) return e.message;
  return t.genericAuthError;
}
