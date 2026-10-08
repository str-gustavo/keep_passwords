import { type Bytes, toBase64, utf8 } from './encoding';
import { importAesKey } from './aes';

export const KDF_ITERATIONS = 600_000;

export async function deriveMasterKey(password: string, salt: Bytes, iterations = KDF_ITERATIONS): Promise<Bytes> {
  const base = await crypto.subtle.importKey('raw', utf8(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, 256);
  return new Uint8Array(bits);
}

export async function hkdf(ikm: Bytes, salt: Bytes, info: string, length = 32): Promise<Bytes> {
  const base = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: utf8(info) }, base, length * 8);
  return new Uint8Array(bits);
}

export const deriveAuthKey = async (masterKey: Bytes, email: string) =>
  toBase64(await hkdf(masterKey, utf8(email.trim().toLowerCase()), 'keep-auth'));
export const deriveEncKey = async (masterKey: Bytes, email: string) =>
  importAesKey(await hkdf(masterKey, utf8(email.trim().toLowerCase()), 'keep-enc'));
