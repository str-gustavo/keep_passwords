'use client';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/ui/cn';

type Props = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> & {
  label: string; tone?: 'default' | 'danger'; variant?: 'ghost' | 'secondary'; size?: 'sm' | 'md'; loading?: boolean;
};

/**
 * Square icon-only button (32 px, or 36 px with `size="md"` to line up with a default Button); `label` becomes the
 * accessible name. `variant="secondary"` adds the bordered white face of Button's secondary variant.
 */
export function IconButton({ label, tone = 'default', variant = 'ghost', size = 'sm', loading, disabled, children, className, ...p }: Props) {
  return (
    <button
      type="button"
      {...p}
      aria-label={label}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg text-fg-muted outline-none transition focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50',
        size === 'md' ? 'h-9 w-9' : 'h-8 w-8',
        variant === 'secondary' && 'border border-border bg-surface',
        tone === 'danger' ? 'hover:bg-danger-soft hover:text-danger' : 'hover:bg-surface-2 hover:text-fg',
        className,
      )}
    >
      {loading ? <Spinner className="h-4 w-4" /> : children}
    </button>
  );
}
