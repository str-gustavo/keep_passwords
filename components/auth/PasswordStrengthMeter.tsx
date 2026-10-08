'use client';
import { useMemo } from 'react';
import { passwordStrength } from '@/lib/generator/strength';
import { t } from '@/lib/i18n/pt-br';
import { cn } from '@/lib/ui/cn';

/** Four bars that fill in the primary color as the zxcvbn score (0–4) rises. */
export function PasswordStrengthMeter({ password }: { password: string }) {
  const { score, label } = useMemo(() => passwordStrength(password), [password]);
  return (
    <div className="mt-2">
      <div className="flex gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => <span key={i} className={cn('h-1.5 flex-1 rounded-full transition-colors', password && score >= i ? 'bg-primary' : 'bg-border')} />)}
      </div>
      <p className="mt-1 text-xs text-fg-muted" aria-live="polite">{password ? `${t.passwordStrength}: ${label}` : t.passwordHint}</p>
    </div>
  );
}
