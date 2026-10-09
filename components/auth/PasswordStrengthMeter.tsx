'use client';
import { useMemo } from 'react';
import { StrengthBars } from '@/components/ui/StrengthBars';
import { passwordStrength } from '@/lib/generator/strength';
import { t } from '@/lib/i18n/pt-br';

/** Scores `password` with zxcvbn and draws it as four segments (red, orange, green as the score 0–4 rises). */
export function PasswordStrengthMeter({ password }: { password: string }) {
  const { score, label } = useMemo(() => passwordStrength(password), [password]);
  return <StrengthBars score={password ? score : null} label={password ? `${t.passwordStrength}: ${label}` : t.passwordHint} />;
}
