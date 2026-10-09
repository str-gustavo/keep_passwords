import { cn } from '@/lib/ui/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-fg-on-primary hover:bg-primary-hover active:bg-primary-active active:text-white',
  secondary: 'bg-surface border border-border text-fg hover:bg-surface-2',
  ghost: 'text-primary-text hover:bg-primary-soft',
  danger: 'bg-danger text-fg-on-status hover:opacity-90',
};

/**
 * The classes of <Button>, also for links that must look like one ("Abrir site", the 404's "Ir para o cofre"). Kept
 * out of Button.tsx ('use client') so server components can call it. Focus: a 2 px primary-text ring (5.7:1 on white),
 * offset by the surface colour so it stays clear of the orange fill in both themes.
 */
export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md'): string {
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-lg font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary-text focus-visible:ring-offset-surface disabled:opacity-50',
    size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-9 px-4 text-sm',
    VARIANT[variant],
  );
}
