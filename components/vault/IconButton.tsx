'use client';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/ui/cn';

type Props = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> & { label: string; tone?: 'default' | 'danger'; loading?: boolean };

/** Square 32px icon-only button; `label` becomes the accessible name. */
export function IconButton({ label, tone = 'default', loading, disabled, children, className, ...p }: Props) {
  return (
    <button
      type="button"
      {...p}
      aria-label={label}
      disabled={disabled || loading}
      className={cn(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-fg-muted outline-none transition focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50',
        tone === 'danger' ? 'hover:bg-surface-2 hover:text-danger' : 'hover:bg-primary-soft hover:text-primary',
        className,
      )}
    >
      {loading ? <Spinner className="h-4 w-4" /> : children}
    </button>
  );
}
