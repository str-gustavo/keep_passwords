import { DecryptError, decryptBytes, encryptBytes, generateAesKey, importAesKey, unwrapAesKey, wrapAesKey } from './aes';
import { fromBase64, randomBytes, toBase64 } from './encoding';
import { KDF_ITERATIONS, deriveAuthKey, deriveEncKey, deriveMasterKey, hkdf } from './kdf';
import { generateRsaKeyPair, importPrivateKey } from './rsa';
import { generatePhrase, normalizePhrase } from './bip39';

export interface RecoveryMaterial { phrase: string; recoveryAuthKey: string; recoverySalt: string; encDataKeyRecovery: string }
export interface AccountMaterial {
  kdfSalt: string; kdfIterations: number; authKey: string; encDataKey: string;
  publicKey: string; encPrivateKey: string; recovery: Omit<RecoveryMaterial, 'phrase'>;
}
export class WrongPasswordError extends Error {
  constructor() { super('Senha mestra incorreta'); this.name = 'WrongPasswordError'; }
}

export async function createAccountMaterial(
  email: string,
  password: string,
): Promise<AccountMaterial & { recoveryPhrase: string; dataKey: CryptoKey; privateKey: CryptoKey }> {
  const dataKey = await generateAesKey();
  const wrapped = await rewrapForNewPassword(email, password, dataKey);
  const pair = await generateRsaKeyPair();
  const encPrivateKey = toBase64(await encryptBytes(dataKey, pair.privateKeyPkcs8));
  const { phrase, ...recovery } = await createRecoveryMaterial(dataKey);
  return { ...wrapped, publicKey: pair.publicKeySpki, encPrivateKey, recovery, recoveryPhrase: phrase, dataKey, privateKey: pair.privateKey };
}

export async function computeAuthKey(email: string, password: string, kdfSalt: string, kdfIterations: number) {
  return deriveAuthKey(await deriveMasterKey(password, fromBase64(kdfSalt), kdfIterations), email);
}

export async function unlockDataKey(email: string, password: string, kdfSalt: string, kdfIterations: number, encDataKey: string) {
  const encKey = await deriveEncKey(await deriveMasterKey(password, fromBase64(kdfSalt), kdfIterations), email);
  try { return await unwrapAesKey(encKey, encDataKey); }
  catch (e) { if (e instanceof DecryptError) throw new WrongPasswordError(); throw e; }
}

export async function unlockPrivateKey(dataKey: CryptoKey, encPrivateKey: string) {
  return importPrivateKey(await decryptBytes(dataKey, fromBase64(encPrivateKey)));
}

export async function rewrapForNewPassword(email: string, newPassword: string, dataKey: CryptoKey) {
  const salt = randomBytes(16);
  const masterKey = await deriveMasterKey(newPassword, salt, KDF_ITERATIONS);
  const encKey = await deriveEncKey(masterKey, email);
  return {
    kdfSalt: toBase64(salt), kdfIterations: KDF_ITERATIONS,
    authKey: await deriveAuthKey(masterKey, email),
    encDataKey: await wrapAesKey(encKey, dataKey),
  };
}

async function recoveryKeys(phrase: string, salt: Uint8Array) {
  const rk = await deriveMasterKey(normalizePhrase(phrase), salt, KDF_ITERATIONS);
  return {
    authKey: toBase64(await hkdf(rk, salt, 'keep-recovery-auth')),
    encKey: await importAesKey(await hkdf(rk, salt, 'keep-recovery-enc')),
  };
}

export async function createRecoveryMaterial(dataKey: CryptoKey): Promise<RecoveryMaterial> {
  const phrase = generatePhrase();
  const salt = randomBytes(16);
  const k = await recoveryKeys(phrase, salt);
  return { phrase, recoveryAuthKey: k.authKey, recoverySalt: toBase64(salt), encDataKeyRecovery: await wrapAesKey(k.encKey, dataKey) };
}

export async function computeRecoveryAuthKey(phrase: string, recoverySalt: string) {
  return (await recoveryKeys(phrase, fromBase64(recoverySalt))).authKey;
}

export async function recoverDataKey(phrase: string, recoverySalt: string, encDataKeyRecovery: string) {
  const k = await recoveryKeys(phrase, fromBase64(recoverySalt));
  try { return await unwrapAesKey(k.encKey, encDataKeyRecovery); }
  catch (e) { if (e instanceof DecryptError) throw new WrongPasswordError(); throw e; }
}
