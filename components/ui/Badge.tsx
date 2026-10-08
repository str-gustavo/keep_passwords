import { cn } from '@/lib/ui/cn';
export function Badge({ className, ...p }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span {...p} className={cn('inline-flex items-center rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary', className)} />;
}
