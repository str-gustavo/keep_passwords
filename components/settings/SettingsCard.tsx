import type { LucideIcon } from 'lucide-react';

/** One settings section: a white bordered card with icon, title and short description over a padded body. */
export function SettingsCard({ id, icon: Icon, title, description, children }: { id: string; icon: LucideIcon; title: string; description?: string; children: React.ReactNode }) {
  const titleId = `${id}-title`;
  return (
    <section aria-labelledby={titleId} className="rounded-xl border border-border bg-surface">
      <header className="flex items-start gap-3 border-b border-border px-4 py-4 sm:px-6">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-fg-muted" aria-hidden="true" />
        <div className="min-w-0">
          <h2 id={titleId} className="text-sm font-semibold text-fg-strong">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-fg-muted">{description}</p>}
        </div>
      </header>
      <div className="p-4 sm:p-6">{children}</div>
    </section>
  );
}
