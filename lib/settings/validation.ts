import { t } from '@/lib/i18n/pt-br';

export const LOCK_MINUTES_MIN = 1;
export const LOCK_MINUTES_MAX = 60;
export const MIN_MASTER_PASSWORD = 12;

/** Whole minutes typed in the auto-lock field, or null when not an integer in 1–60 (the server's accepted range). */
export function parseLockMinutes(text: string): number | null {
  const s = text.trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n >= LOCK_MINUTES_MIN && n <= LOCK_MINUTES_MAX ? n : null;
}

export type PasswordChangeErrors = Partial<Record<'current' | 'next' | 'confirm', string>>;

export function validatePasswordChange(current: string, next: string, confirm: string): PasswordChangeErrors {
  const errors: PasswordChangeErrors = {};
  if (!current) errors.current = t.currentPasswordRequired;
  if (next.length < MIN_MASTER_PASSWORD) errors.next = t.passwordTooShort;
  else if (next === current) errors.next = t.newPasswordSameAsCurrent;
  if (confirm !== next) errors.confirm = t.passwordsDontMatch;
  return errors;
}
