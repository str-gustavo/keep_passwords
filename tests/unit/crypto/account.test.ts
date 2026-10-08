import { describe, expect, it } from 'vitest';
import { createAccountMaterial, computeAuthKey, unlockDataKey, unlockPrivateKey, rewrapForNewPassword, createRecoveryMaterial, computeRecoveryAuthKey, recoverDataKey, WrongPasswordError } from '@/lib/crypto/account';
import { exportAesKey, encryptString, decryptString } from '@/lib/crypto/aes';
import { isValidPhrase } from '@/lib/crypto/bip39';

const email = 'Ana@Example.com';
const password = 'correct horse battery staple';

describe('account material', () => {
  it('creates all blobs and never includes the password or raw keys', async () => {
    const m = await createAccountMaterial(email, password);
    expect(m.kdfIterations).toBe(600_000);
    expect(Buffer.from(m.kdfSalt, 'base64').length).toBe(16);
    expect(Buffer.from(m.authKey, 'base64').length).toBe(32);
    expect(m.encDataKey).not.toContain(password);
    expect(m.publicKey.length).toBeGreaterThan(100);
    expect(isValidPhrase(m.recoveryPhrase)).toBe(true);
    const json = JSON.stringify({ ...m, dataKey: undefined, privateKey: undefined, recoveryPhrase: undefined });
    expect(json).not.toContain(m.recoveryPhrase.split(' ')[0]!);
    expect(json).not.toContain(password);
    expect(json).not.toContain(Buffer.from(await exportAesKey(m.dataKey)).toString('base64'));
  });

  it('unlocks with the right password and rejects the wrong one', async () => {
    const m = await createAccountMaterial(email, password);
    expect(await computeAuthKey(email, password, m.kdfSalt, m.kdfIterations)).toBe(m.authKey);
    const dk = await unlockDataKey(email, password, m.kdfSalt, m.kdfIterations, m.encDataKey);
    expect(await exportAesKey(dk)).toEqual(await exportAesKey(m.dataKey));
    await expect(unlockDataKey(email, 'wrong', m.kdfSalt, m.kdfIterations, m.encDataKey)).rejects.toBeInstanceOf(WrongPasswordError);
    const priv = await unlockPrivateKey(dk, m.encPrivateKey);
    expect(priv.type).toBe('private');
  });

  it('re-wraps for a new password keeping the same data key', async () => {
    const m = await createAccountMaterial(email, password);
    const n = await rewrapForNewPassword(email, 'new password 123', m.dataKey);
    expect(n.authKey).not.toBe(m.authKey);
    const dk = await unlockDataKey(email, 'new password 123', n.kdfSalt, n.kdfIterations, n.encDataKey);
    expect(await exportAesKey(dk)).toEqual(await exportAesKey(m.dataKey));
  });

  it('recovers the data key from the phrase', async () => {
    const m = await createAccountMaterial(email, password);
    const r = await createRecoveryMaterial(m.dataKey);
    expect(r.phrase.split(' ')).toHaveLength(24);
    expect(await computeRecoveryAuthKey(r.phrase.toUpperCase() + ' ', r.recoverySalt)).toBe(r.recoveryAuthKey);
    const dk = await recoverDataKey(r.phrase, r.recoverySalt, r.encDataKeyRecovery);
    expect(await decryptString(dk, await encryptString(m.dataKey, 'x'))).toBe('x');
    const words = r.phrase.split(' ');
    words[0] = words[0] === 'zebra' ? 'zoo' : 'zebra';
    await expect(recoverDataKey(words.join(' '), r.recoverySalt, r.encDataKeyRecovery)).rejects.toBeInstanceOf(WrongPasswordError);
  });
});
