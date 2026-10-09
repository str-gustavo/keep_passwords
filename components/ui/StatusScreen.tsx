import { Wordmark } from '@/components/brand/Wordmark';
import { cn } from '@/lib/ui/cn';

/**
 * Centered icon, heading, text and action on the white surface: the error boundaries and the 404 page. Full-screen
 * (outside the vault shell) it carries the wordmark on top, since nothing else on the page says which app this is.
 */
export function StatusScreen({ icon, title, description, action, fullScreen, alert }: {
  icon: React.ReactNode; title: string; description: string; action: React.ReactNode; fullScreen?: boolean; alert?: boolean;
}) {
  return (
    <div role={alert ? 'alert' : undefined} className={cn('flex flex-1 flex-col items-center justify-center gap-3 bg-surface p-6 text-center', fullScreen && 'min-h-screen')}>
      {fullScreen && <Wordmark className="mb-6 text-xl" />}
      <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-fg-muted [&>svg]:h-6 [&>svg]:w-6">{icon}</span>
      <h1 className="text-xl font-semibold text-fg-strong">{title}</h1>
      <p className="max-w-sm text-sm text-fg-muted">{description}</p>
      <div className="mt-2">{action}</div>
    </div>
  );
}
