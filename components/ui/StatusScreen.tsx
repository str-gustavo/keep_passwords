import { cn } from '@/lib/ui/cn';

/** Centered icon, heading, text and action: the error boundaries and the 404 page. */
export function StatusScreen({ icon, title, description, action, fullScreen, alert }: {
  icon: React.ReactNode; title: string; description: string; action: React.ReactNode; fullScreen?: boolean; alert?: boolean;
}) {
  return (
    <div role={alert ? 'alert' : undefined} className={cn('flex flex-1 flex-col items-center justify-center gap-3 bg-surface-2 p-6 text-center', fullScreen && 'min-h-screen')}>
      <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary [&>svg]:h-6 [&>svg]:w-6">{icon}</span>
      <h1 className="text-lg font-semibold text-fg">{title}</h1>
      <p className="max-w-sm text-sm text-fg-muted">{description}</p>
      <div className="mt-2">{action}</div>
    </div>
  );
}
