export interface TotpParams { secret: string; digits: number; period: number; algorithm: 'SHA-1' | 'SHA-256' | 'SHA-512'; issuer?: string; account?: string }

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32Decode(s: string): Uint8Array<ArrayBuffer> {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, '');
  const out: number[] = [];
  let bits = 0, value = 0;
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return new Uint8Array(out);
}

export function parseOtpauth(uri: string): TotpParams {
  let url: URL;
  try { url = new URL(uri); } catch { throw new Error('otpauth inválido'); }
  if (url.protocol !== 'otpauth:' || url.host !== 'totp') throw new Error('otpauth inválido');
  const secret = url.searchParams.get('secret');
  if (!secret) throw new Error('otpauth inválido');
  const label = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  const [maybeIssuer, maybeAccount] = label.includes(':') ? label.split(':', 2) : [undefined, label];
  const alg = (url.searchParams.get('algorithm') ?? 'SHA1').toUpperCase().replace('SHA', 'SHA-');
  return {
    secret: secret.replace(/\s+/g, '').toUpperCase(),
    digits: Number(url.searchParams.get('digits') ?? 6),
    period: Number(url.searchParams.get('period') ?? 30),
    algorithm: (['SHA-1', 'SHA-256', 'SHA-512'].includes(alg) ? alg : 'SHA-1') as TotpParams['algorithm'],
    issuer: url.searchParams.get('issuer') ?? maybeIssuer,
    account: maybeAccount || undefined,
  };
}

export async function generateTotp(p: TotpParams, now = Date.now()): Promise<string> {
  const counter = Math.floor(now / 1000 / p.period);
  const msg = new Uint8Array(8);
  new DataView(msg.buffer).setBigUint64(0, BigInt(counter));
  const key = await crypto.subtle.importKey('raw', base32Decode(p.secret), { name: 'HMAC', hash: p.algorithm }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const offset = mac[mac.length - 1]! & 0x0f;
  const code = ((mac[offset]! & 0x7f) << 24) | (mac[offset + 1]! << 16) | (mac[offset + 2]! << 8) | mac[offset + 3]!;
  return String(code % 10 ** p.digits).padStart(p.digits, '0');
}

export const totpRemainingSeconds = (period: number, now = Date.now()) => period - (Math.floor(now / 1000) % period);
