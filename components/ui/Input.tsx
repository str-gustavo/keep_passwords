'use client';
import { forwardRef } from 'react';
import { cn } from '@/lib/ui/cn';
export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} {...p} className={cn('h-[38px] w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted outline-none focus:border-primary focus:ring-[3px] focus:ring-primary-soft', className)} />;
});
