'use client';
import { cn } from '@/lib/ui/cn';
export function Switch({ checked, onChange, label, testId }: { checked: boolean; onChange: (v: boolean) => void; label: string; testId?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} data-testid={testId} onClick={() => onChange(!checked)} className={cn('relative inline-flex h-6 w-11 shrink-0 items-center rounded-full outline-none transition focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary-text focus-visible:ring-offset-surface', checked ? 'bg-primary' : 'bg-border')}>
      <span className={cn('inline-block h-5 w-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-5' : 'translate-x-0.5')} />
    </button>
  );
}
