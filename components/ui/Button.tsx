'use client';
import { cn } from '@/lib/ui/cn';
import { buttonClass, type ButtonSize, type ButtonVariant } from './buttonClass';
import { Spinner } from './Spinner';
type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; loading?: boolean };
/** Defaults to `type="button"`: only buttons that explicitly say `type="submit"` submit a surrounding form. */
export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, type = 'button', ...p }: Props) {
  return (
    <button {...p} type={type} disabled={disabled || loading} className={cn(buttonClass(variant, size), className)}>
      {loading && <Spinner className="h-4 w-4" />}{children}
    </button>
  );
}
