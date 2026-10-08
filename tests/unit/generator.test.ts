import { describe, expect, it } from 'vitest';
import { generatePassword, generatePassphrase } from '@/lib/generator/password';
import { passwordStrength } from '@/lib/generator/strength';

describe('generatePassword', () => {
  it('respects length and includes every enabled class', () => {
    for (let i = 0; i < 20; i++) {
      const pw = generatePassword({ length: 16, upper: true, lower: true, digits: true, symbols: true, excludeAmbiguous: false });
      expect(pw).toHaveLength(16);
      expect(pw).toMatch(/[A-Z]/); expect(pw).toMatch(/[a-z]/); expect(pw).toMatch(/[0-9]/); expect(pw).toMatch(/[^A-Za-z0-9]/);
    }
  });
  it('excludes ambiguous characters when asked', () => {
    const pw = generatePassword({ length: 200, upper: true, lower: true, digits: true, symbols: false, excludeAmbiguous: true });
    expect(pw).not.toMatch(/[Il1O0]/);
  });
  it('clamps length to 8..64 and falls back to lower when nothing is enabled', () => {
    expect(generatePassword({ length: 2, upper: false, lower: false, digits: false, symbols: false, excludeAmbiguous: false })).toMatch(/^[a-z]{8}$/);
    expect(generatePassword({ length: 999, upper: true, lower: true, digits: true, symbols: true, excludeAmbiguous: false })).toHaveLength(64);
  });
  it('generates different passwords', () => {
    const o = { length: 20, upper: true, lower: true, digits: true, symbols: true, excludeAmbiguous: false };
    expect(generatePassword(o)).not.toBe(generatePassword(o));
  });
});

describe('generatePassphrase', () => {
  it('joins N wordlist words with the separator, optionally capitalized', () => {
    const p = generatePassphrase({ words: 5, separator: '-', capitalize: true });
    const parts = p.split('-');
    expect(parts).toHaveLength(5);
    for (const w of parts) expect(w).toMatch(/^[A-Z][a-z]+$/);
  });
});

describe('passwordStrength', () => {
  it('scores weak and strong passwords with pt-BR labels', () => {
    expect(passwordStrength('123456').score).toBeLessThanOrEqual(1);
    expect(passwordStrength('x7#Qp!2mZ@9vL$kR').score).toBeGreaterThanOrEqual(3);
    expect(['Muito fraca', 'Fraca', 'Razoável', 'Forte', 'Muito forte']).toContain(passwordStrength('abc').label);
  });
});
