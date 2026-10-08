import { exportAesKey, importAesKey } from './aes';
import { fromBase64, toBase64 } from './encoding';

const ALG = { name: 'RSA-OAEP', hash: 'SHA-256' } as const;

export async function generateRsaKeyPair() {
  const pair = await crypto.subtle.generateKey(
    { ...ALG, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) },
    true,
    ['encrypt', 'decrypt'],
  );
  return {
    publicKey: pair.publicKey,
    privateKey: pair.privateKey,
    publicKeySpki: toBase64(new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey))),
    privateKeyPkcs8: new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey)),
  };
}
export const importPublicKey = (spki: string) => crypto.subtle.importKey('spki', fromBase64(spki) as BufferSource, ALG, true, ['encrypt']);
export const importPrivateKey = (pkcs8: Uint8Array) => crypto.subtle.importKey('pkcs8', pkcs8 as BufferSource, ALG, true, ['decrypt']);
export const rsaWrapAesKey = async (publicKey: CryptoKey, key: CryptoKey) =>
  toBase64(new Uint8Array(await crypto.subtle.encrypt(ALG, publicKey, await exportAesKey(key))));
export const rsaUnwrapAesKey = async (privateKey: CryptoKey, blob: string) =>
  importAesKey(new Uint8Array(await crypto.subtle.decrypt(ALG, privateKey, fromBase64(blob) as BufferSource)));
