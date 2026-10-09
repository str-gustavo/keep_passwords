'use client';
import { cn } from '@/lib/ui/cn';
import { Spinner } from './Spinner';
type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md'; loading?: boolean };
const V = {
  primary: 'bg-primary text-fg-on-primary hover:bg-primary-hover active:bg-primary-active active:text-white',
  secondary: 'bg-surface border border-border text-fg hover:bg-surface-2',
  ghost: 'text-primary-text hover:bg-primary-soft',
  danger: 'bg-danger text-fg-on-status hover:opacity-90',
};
/** Defaults to `type="button"`: only buttons that explicitly say `type="submit"` submit a surrounding form. */
export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, type = 'button', ...p }: Props) {
  return (
    <button {...p} type={type} disabled={disabled || loading} className={cn('inline-flex items-center justify-center gap-2 rounded-lg font-semibold outline-none transition focus-visible:ring-[3px] focus-visible:ring-primary-soft focus-visible:border-primary disabled:opacity-50', size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-9 px-4 text-sm', V[variant], className)}>
      {loading && <Spinner className="h-4 w-4" />}{children}
    </button>
  );
}
