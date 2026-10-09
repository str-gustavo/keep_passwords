import { cn } from '@/lib/ui/cn';
const TONE = {
  neutral: 'bg-surface-2 text-fg-muted',
  primary: 'bg-primary-soft text-primary-text',
  success: 'bg-success-soft text-success',
  danger: 'bg-danger-soft text-danger',
};
export function Badge({ tone = 'neutral', className, ...p }: React.HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof TONE }) {
  return <span {...p} className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', TONE[tone], className)} />;
}
