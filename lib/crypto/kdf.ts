import { t } from '@/lib/i18n/pt-br';
import { type Bytes, asBytes, toBase64, utf8 } from './encoding';
import { importAesKey } from './aes';

export const KDF_ITERATIONS = 600_000;
/** Same ceiling as the server's zod schema; above it a hostile server could freeze the tab. */
export const KDF_MAX_ITERATIONS = 5_000_000;

/**
 * Anti-downgrade: never derive or use keys with fewer PBKDF2 iterations than this client's floor (nor absurdly many).
 * Throws the pt-BR `unsafeServerParams` error.
 */
export function assertKdfIterations(iterations: unknown): void {
  if (typeof iterations !== 'number' || !Number.isInteger(iterations) || iterations < KDF_ITERATIONS || iterations > KDF_MAX_ITERATIONS) throw new Error(t.unsafeServerParams);
}

export async function deriveMasterKey(password: string, salt: Uint8Array, iterations = KDF_ITERATIONS): Promise<Bytes> {
  const base = await crypto.subtle.importKey('raw', utf8(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: asBytes(salt), iterations }, base, 256);
  return new Uint8Array(bits);
}

export async function hkdf(ikm: Uint8Array, salt: Uint8Array, info: string, length = 32): Promise<Bytes> {
  const base = await crypto.subtle.importKey('raw', asBytes(ikm), 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: asBytes(salt), info: utf8(info) }, base, length * 8);
  return new Uint8Array(bits);
}

export const deriveAuthKey = async (masterKey: Uint8Array, email: string) =>
  toBase64(await hkdf(masterKey, utf8(email.trim().toLowerCase()), 'keep-auth'));
export const deriveEncKey = async (masterKey: Uint8Array, email: string) =>
  importAesKey(await hkdf(masterKey, utf8(email.trim().toLowerCase()), 'keep-enc'));
