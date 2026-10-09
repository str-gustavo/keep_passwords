'use client';
import dynamic from 'next/dynamic';

// zxcvbn and its dictionaries are large: load the sign-up meter only when a record password is first shown.
const PasswordStrengthMeter = dynamic(
  () => import('@/components/auth/PasswordStrengthMeter').then((m) => m.PasswordStrengthMeter),
  // Same height as the meter (6 px segments, 4 px gap, one 16 px label line), so nothing below it jumps on load.
  { ssr: false, loading: () => <div className="mt-2 h-[26px]" aria-hidden="true" /> },
);

/**
 * Strength segments for a record password. Reuses the sign-up meter (`StrengthBars`); renders nothing while empty
 * because the sign-up meter's empty-state hint is about the master password.
 */
export function StrengthMeter({ password }: { password: string }) {
  return password ? <PasswordStrengthMeter password={password} /> : null;
}
