import { type Bytes, concatBytes, fromBase64, fromUtf8, randomBytes, toBase64, utf8 } from './encoding';

export const BLOB_VERSION = 0x01;
const IV_LENGTH = 12;

export class DecryptError extends Error {
  constructor(message = 'Não foi possível decifrar') { super(message); this.name = 'DecryptError'; }
}

export const generateAesKey = () =>
  crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
export const importAesKey = (raw: Bytes) =>
  crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
export const exportAesKey = async (key: CryptoKey) => new Uint8Array(await crypto.subtle.exportKey('raw', key));

export async function encryptBytes(key: CryptoKey, plaintext: Bytes): Promise<Bytes> {
  const iv = randomBytes(IV_LENGTH);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext));
  return concatBytes(new Uint8Array([BLOB_VERSION]), iv, ct);
}

export async function decryptBytes(key: CryptoKey, blob: Bytes): Promise<Bytes> {
  if (blob.length < 1 + IV_LENGTH + 16 || blob[0] !== BLOB_VERSION) throw new DecryptError();
  const iv = blob.subarray(1, 1 + IV_LENGTH);
  const ct = blob.subarray(1 + IV_LENGTH);
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct));
  } catch {
    throw new DecryptError();
  }
}

export const encryptString = async (key: CryptoKey, text: string) => toBase64(await encryptBytes(key, utf8(text)));
export const decryptString = async (key: CryptoKey, blob: string) => fromUtf8(await decryptBytes(key, fromBase64(blob)));
export const encryptJson = <T>(key: CryptoKey, value: T) => encryptString(key, JSON.stringify(value));
export const decryptJson = async <T>(key: CryptoKey, blob: string) => JSON.parse(await decryptString(key, blob)) as T;
export const wrapAesKey = async (wrappingKey: CryptoKey, key: CryptoKey) =>
  toBase64(await encryptBytes(wrappingKey, await exportAesKey(key)));
export const unwrapAesKey = async (wrappingKey: CryptoKey, blob: string) =>
  importAesKey(await decryptBytes(wrappingKey, fromBase64(blob)));
