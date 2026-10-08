import { cn } from '@/lib/ui/cn';
export function Label({ className, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label {...p} className={cn('mb-1 block text-xs font-medium text-fg-muted', className)} />;
}
