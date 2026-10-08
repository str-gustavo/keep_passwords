import { describe, expect, it } from 'vitest';
import { t } from '@/lib/i18n/pt-br';
import { parseLockMinutes, validatePasswordChange } from '@/lib/settings/validation';

describe('parseLockMinutes', () => {
  it('accepts integers from 1 to 60', () => {
    expect(parseLockMinutes('1')).toBe(1);
    expect(parseLockMinutes('15')).toBe(15);
    expect(parseLockMinutes(' 60 ')).toBe(60);
  });
  it('rejects out-of-range, empty and non-integer values', () => {
    for (const v of ['', ' ', '0', '61', '-5', '2.5', '1e1', 'abc', '10min']) expect(parseLockMinutes(v)).toBeNull();
  });
});

describe('validatePasswordChange', () => {
  const ok = 'uma frase longa e forte';
  it('passes a valid change', () => {
    expect(validatePasswordChange('senha-atual-123', ok, ok)).toEqual({});
  });
  it('requires the current password', () => {
    expect(validatePasswordChange('', ok, ok)).toEqual({ current: t.currentPasswordRequired });
  });
  it('requires at least 12 characters for the new password', () => {
    expect(validatePasswordChange('senha-atual-123', 'curta', 'curta')).toEqual({ next: t.passwordTooShort });
  });
  it('rejects a new password equal to the current one', () => {
    expect(validatePasswordChange(ok, ok, ok)).toEqual({ next: t.newPasswordSameAsCurrent });
  });
  it('requires the confirmation to match', () => {
    expect(validatePasswordChange('senha-atual-123', ok, `${ok}!`)).toEqual({ confirm: t.passwordsDontMatch });
  });
  it('reports every problem at once', () => {
    expect(validatePasswordChange('', 'curta', 'outra')).toEqual({ current: t.currentPasswordRequired, next: t.passwordTooShort, confirm: t.passwordsDontMatch });
  });
});
