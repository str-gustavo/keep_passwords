import { describe, expect, it } from 'vitest';
import { toBase64, fromBase64, utf8, fromUtf8, concatBytes, randomBytes } from '@/lib/crypto/encoding';
import { BLOB_VERSION, generateAesKey, importAesKey, exportAesKey, encryptBytes, decryptBytes, encryptString, decryptString, encryptJson, decryptJson, wrapAesKey, unwrapAesKey, DecryptError } from '@/lib/crypto/aes';

describe('encoding', () => {
  it('round-trips base64 and utf8', () => {
    const bytes = randomBytes(33);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
    expect(fromUtf8(utf8('olá çã'))).toBe('olá çã');
    expect(concatBytes(new Uint8Array([1]), new Uint8Array([2, 3]))).toEqual(new Uint8Array([1, 2, 3]));
  });
});

describe('aes', () => {
  it('produces a versioned blob: version byte, 12-byte iv, ciphertext+tag', async () => {
    const key = await generateAesKey();
    const blob = await encryptBytes(key, utf8('hi'));
    expect(blob[0]).toBe(BLOB_VERSION);
    expect(blob.length).toBe(1 + 12 + 2 + 16);
  });

  it('round-trips bytes, strings and json', async () => {
    const key = await generateAesKey();
    expect(fromUtf8(await decryptBytes(key, await encryptBytes(key, utf8('abc'))))).toBe('abc');
    expect(await decryptString(key, await encryptString(key, 'çã'))).toBe('çã');
    expect(await decryptJson(key, await encryptJson(key, { a: 1 }))).toEqual({ a: 1 });
  });

  it('uses a fresh iv per encryption', async () => {
    const key = await generateAesKey();
    const a = await encryptString(key, 'x');
    const b = await encryptString(key, 'x');
    expect(a).not.toBe(b);
  });

  it('throws DecryptError with the wrong key or a tampered blob', async () => {
    const k1 = await generateAesKey();
    const k2 = await generateAesKey();
    const blob = await encryptString(k1, 'secret');
    await expect(decryptString(k2, blob)).rejects.toBeInstanceOf(DecryptError);
    const bytes = fromBase64(blob);
    bytes[bytes.length - 1]! ^= 0xff;
    await expect(decryptString(k1, toBase64(bytes))).rejects.toBeInstanceOf(DecryptError);
    await expect(decryptBytes(k1, new Uint8Array([0x02, 1, 2, 3]))).rejects.toBeInstanceOf(DecryptError);
  });

  it('throws DecryptError for an unknown version byte on a real blob', async () => {
    const key = await generateAesKey();
    const bytes = fromBase64(await encryptString(key, 'secret'));
    bytes[0] = 0x02;
    await expect(decryptBytes(key, bytes)).rejects.toBeInstanceOf(DecryptError);
  });

  it('throws DecryptError for malformed base64', async () => {
    const key = await generateAesKey();
    await expect(decryptString(key, '%%%not-base64%%%')).rejects.toBeInstanceOf(DecryptError);
    await expect(decryptJson(key, '%%%not-base64%%%')).rejects.toBeInstanceOf(DecryptError);
    await expect(unwrapAesKey(key, '%%%not-base64%%%')).rejects.toBeInstanceOf(DecryptError);
  });

  it('wraps and unwraps keys, exported raw bytes match', async () => {
    const wrapping = await generateAesKey();
    const inner = await generateAesKey();
    const blob = await wrapAesKey(wrapping, inner);
    const back = await unwrapAesKey(wrapping, blob);
    expect(await exportAesKey(back)).toEqual(await exportAesKey(inner));
    const imported = await importAesKey(await exportAesKey(inner));
    expect(await decryptString(imported, await encryptString(inner, 'z'))).toBe('z');
  });
});
