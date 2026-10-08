import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const PARAMS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const derive = (secret: string, salt: Buffer) =>
  new Promise<Buffer>((res, rej) => scrypt(Buffer.from(secret, 'base64'), salt, 32, PARAMS, (e, k) => (e ? rej(e) : res(k))));

export async function hashSecret(secretBase64: string): Promise<string> {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('base64')}$${(await derive(secretBase64, salt)).toString('base64')}`;
}

export async function verifySecret(secretBase64: string, stored: string): Promise<boolean> {
  const [alg, saltB64, hashB64] = stored.split('$');
  if (alg !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await derive(secretBase64, Buffer.from(saltB64, 'base64'));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
