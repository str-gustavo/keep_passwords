import { t } from '@/lib/i18n/pt-br';
import { cn } from '@/lib/ui/cn';
import { NexusMark } from './NexusMark';

/**
 * The "NEXUS Passwords" wordmark on light surfaces, drawn as text plus the vector X (the 2750×850
 * nexus-logo.png weighs 788 KB). Sized by the caller's font size; screen readers hear the app name.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <p className={cn('leading-none', className)}>
      <span className="sr-only">{t.appName}</span>
      <span aria-hidden="true" className="inline-flex items-baseline gap-2">
        <span className="font-extrabold tracking-[0.08em] text-fg-strong">
          NE<NexusMark size={18} className="mx-[0.02em] inline-block h-[0.89em] w-[0.89em] align-[-0.08em]" />US
        </span>
        <span className="font-medium tracking-tight text-fg">Passwords</span>
      </span>
    </p>
  );
}
