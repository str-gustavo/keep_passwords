'use client';
import { cn } from '@/lib/ui/cn';
import { Spinner } from './Spinner';
type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md'; loading?: boolean };
const V = {
  primary: 'bg-primary text-white hover:bg-primary-hover active:bg-primary-active',
  secondary: 'bg-surface border border-border text-fg hover:bg-surface-2',
  ghost: 'text-fg hover:bg-primary-soft',
  danger: 'bg-danger text-white hover:opacity-90',
};
export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...p }: Props) {
  return (
    <button {...p} disabled={disabled || loading} className={cn('inline-flex items-center justify-center gap-2 rounded-lg font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50', size === 'sm' ? 'h-8 px-3 text-sm' : 'h-10 px-4 text-sm', V[variant], className)}>
      {loading && <Spinner className="h-4 w-4" />}{children}
    </button>
  );
}
