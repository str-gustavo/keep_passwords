import { describe, expect, it } from 'vitest';
import { WORDLIST, generatePhrase, normalizePhrase, isValidPhrase } from '@/lib/crypto/bip39';
import { sha256Sync } from '@/lib/crypto/sha256-sync';

describe('bip39', () => {
  it('has 2048 unique words', () => {
    expect(WORDLIST.length).toBe(2048);
    expect(new Set(WORDLIST).size).toBe(2048);
    expect(WORDLIST[0]).toBe('abandon');
    expect(WORDLIST[2047]).toBe('zoo');
  });
  it('generates valid 24-word phrases that differ', () => {
    const a = generatePhrase();
    const b = generatePhrase();
    expect(a.split(' ')).toHaveLength(24);
    expect(a).not.toBe(b);
    expect(isValidPhrase(a)).toBe(true);
    expect(isValidPhrase(a.toUpperCase())).toBe(true);
  });
  it('rejects wrong checksum, unknown words and wrong length', () => {
    const words = generatePhrase().split(' ');
    const swapped = [...words];
    swapped[0] = words[0] === 'abandon' ? 'ability' : 'abandon';
    expect(isValidPhrase(swapped.join(' '))).toBe(false);
    expect(isValidPhrase(words.slice(0, 12).join(' '))).toBe(false);
    expect(isValidPhrase('notaword ' + words.slice(1).join(' '))).toBe(false);
  });
  it('normalizes whitespace and case', () => {
    expect(normalizePhrase('  Abandon   ABILITY\nable ')).toBe('abandon ability able');
  });
  it('sha256Sync matches WebCrypto', async () => {
    for (const n of [0, 31, 100]) {
      const input = crypto.getRandomValues(new Uint8Array(n));
      expect(sha256Sync(input)).toEqual(new Uint8Array(await crypto.subtle.digest('SHA-256', input)));
    }
  });
});
