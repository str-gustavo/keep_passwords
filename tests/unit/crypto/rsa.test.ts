import { describe, expect, it } from 'vitest';
import { generateRsaKeyPair, importPublicKey, importPrivateKey, rsaWrapAesKey, rsaUnwrapAesKey } from '@/lib/crypto/rsa';
import { generateAesKey, exportAesKey } from '@/lib/crypto/aes';

describe('rsa', () => {
  it('wraps an AES key for a public key and unwraps with the private key', async () => {
    const pair = await generateRsaKeyPair();
    const pub = await importPublicKey(pair.publicKeySpki);
    const priv = await importPrivateKey(pair.privateKeyPkcs8);
    const key = await generateAesKey();
    const blob = await rsaWrapAesKey(pub, key);
    expect(Buffer.from(blob, 'base64').length).toBe(256);
    expect(await exportAesKey(await rsaUnwrapAesKey(priv, blob))).toEqual(await exportAesKey(key));
  });

  it('fails with another private key', async () => {
    const a = await generateRsaKeyPair();
    const b = await generateRsaKeyPair();
    const blob = await rsaWrapAesKey(a.publicKey, await generateAesKey());
    await expect(rsaUnwrapAesKey(b.privateKey, blob)).rejects.toThrow();
  });
});
