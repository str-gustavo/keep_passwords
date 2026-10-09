import type { LucideIcon } from 'lucide-react';

/**
 * Page frame shared by the settings and tool screens: a scrollable surface-2 backdrop with a centred column (max
 * 768 px) holding the page title and the white cards.
 */
export function ToolLayout({ icon: Icon, title, description, children }: { icon: LucideIcon; title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-surface-2">
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 lg:px-6 lg:py-8">
        <header className="flex items-start gap-3">
          <Icon className="mt-1 h-5 w-5 shrink-0 text-fg-muted" aria-hidden="true" />
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-fg-strong">{title}</h1>
            <p className="mt-0.5 text-sm text-fg-muted">{description}</p>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
