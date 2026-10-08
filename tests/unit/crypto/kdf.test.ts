import { describe, expect, it } from 'vitest';
import { KDF_ITERATIONS, deriveMasterKey, hkdf, deriveAuthKey, deriveEncKey } from '@/lib/crypto/kdf';
import { utf8 } from '@/lib/crypto/encoding';
import { encryptString, decryptString } from '@/lib/crypto/aes';

describe('kdf', () => {
  it('defaults to 600000 iterations and derives 32 deterministic bytes', async () => {
    expect(KDF_ITERATIONS).toBe(600_000);
    const salt = utf8('0123456789abcdef');
    const a = await deriveMasterKey('senha', salt, 1000);
    const b = await deriveMasterKey('senha', salt, 1000);
    expect(a.length).toBe(32);
    expect(a).toEqual(b);
    expect(await deriveMasterKey('senhb', salt, 1000)).not.toEqual(a);
  });

  it('hkdf separates auth and enc keys', async () => {
    const ikm = await deriveMasterKey('p', utf8('saltsaltsaltsalt'), 1000);
    const auth = await deriveAuthKey(ikm, 'a@b.c');
    const enc = await deriveEncKey(ikm, 'a@b.c');
    expect(Buffer.from(auth, 'base64').length).toBe(32);
    expect(await hkdf(ikm, utf8('a@b.c'), 'keep-auth')).toEqual(new Uint8Array(Buffer.from(auth, 'base64')));
    expect(await decryptString(enc, await encryptString(enc, 'ok'))).toBe('ok');
    expect(await deriveAuthKey(ikm, 'x@b.c')).not.toBe(auth);
  });
});
