import { describe, expect, it } from 'vitest';
import { parseOtpauth, generateTotp, totpRemainingSeconds } from '@/lib/crypto/totp';

const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('totp', () => {
  it('matches RFC 6238 SHA-1 vectors with 8 digits', async () => {
    const p = { secret, digits: 8, period: 30, algorithm: 'SHA-1' as const };
    expect(await generateTotp(p, 59_000)).toBe('94287082');
    expect(await generateTotp(p, 1_111_111_109_000)).toBe('07081804');
    expect(await generateTotp(p, 1_234_567_890_000)).toBe('89005924');
  });
  it('defaults to 6 digits and handles lowercase/space secrets', async () => {
    const p = parseOtpauth('otpauth://totp/GitHub:ana?secret=gezd gnbv gy3t qojq gezd gnbv gy3t qojq&issuer=GitHub');
    expect(p).toMatchObject({ digits: 6, period: 30, algorithm: 'SHA-1', issuer: 'GitHub', account: 'ana' });
    expect(await generateTotp(p, 59_000)).toBe('287082');
  });
  it('parses digits, period and algorithm', () => {
    const p = parseOtpauth('otpauth://totp/x?secret=ABC&digits=8&period=60&algorithm=SHA256');
    expect(p).toMatchObject({ secret: 'ABC', digits: 8, period: 60, algorithm: 'SHA-256' });
  });
  it('normalises the algorithm with or without a hyphen, in any case', () => {
    const alg = (a: string) => parseOtpauth(`otpauth://totp/x?secret=ABC&algorithm=${a}`).algorithm;
    expect([alg('SHA-256'), alg('sha256'), alg('SHA512'), alg('Sha-512'), alg('SHA-1'), alg('sha1')]).toEqual(['SHA-256', 'SHA-256', 'SHA-512', 'SHA-512', 'SHA-1', 'SHA-1']);
    expect(alg('MD5')).toBe('SHA-1');
  });
  it('accepts 6-10 digits and a 15-120 s period, rejects anything else', () => {
    const uri = (q: string) => `otpauth://totp/x?secret=ABC&${q}`;
    expect(parseOtpauth(uri('digits=10&period=15'))).toMatchObject({ digits: 10, period: 15 });
    expect(parseOtpauth(uri('digits=6&period=120'))).toMatchObject({ digits: 6, period: 120 });
    for (const q of ['digits=5', 'digits=11', 'digits=7.5', 'digits=x', 'period=14', 'period=121', 'period=0', 'period=abc']) {
      expect(() => parseOtpauth(uri(q)), q).toThrow('otpauth inválido');
    }
  });
  it('rejects invalid uris', () => {
    expect(() => parseOtpauth('https://x')).toThrow('otpauth inválido');
    expect(() => parseOtpauth('otpauth://totp/x')).toThrow('otpauth inválido');
  });
  it('computes remaining seconds', () => {
    expect(totpRemainingSeconds(30, 59_000)).toBe(1);
    expect(totpRemainingSeconds(30, 60_000)).toBe(30);
  });
});
