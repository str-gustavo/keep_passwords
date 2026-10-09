import { cn } from '@/lib/ui/cn';

/** Fill colour by zxcvbn score: 0–1 danger, 2 primary, 3–4 success. */
const fillOf = (score: number) => (score <= 1 ? 'bg-danger' : score === 2 ? 'bg-primary' : 'bg-success');

/**
 * Four thin segments for a 0–4 strength score plus a one-line label; `score === null` (no password yet) lights none.
 * Any password lights at least the first segment, so "Muito fraca" (0) still shows red. No zxcvbn in here: callers
 * score the password.
 */
export function StrengthBars({ score, label }: { score: 0 | 1 | 2 | 3 | 4 | null; label: string }) {
  const lit = score === null ? 0 : Math.max(1, score);
  const fill = score === null ? '' : fillOf(score);
  return (
    <div className="mt-2">
      <div className="flex gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => <span key={i} data-seg className={cn('h-1.5 flex-1 rounded-full transition-colors', i <= lit ? fill : 'bg-surface-2')} />)}
      </div>
      <p className="mt-1 text-xs text-fg-muted" aria-live="polite">{label}</p>
    </div>
  );
}
