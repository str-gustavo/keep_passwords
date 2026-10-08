import { cn } from '@/lib/ui/cn';
export function Spinner({ className }: { className?: string }) {
  return <span role="status" aria-label="Carregando" className={cn('inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent', className)} />;
}
