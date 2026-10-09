'use client';
import { useId } from 'react';
import { Plus } from 'lucide-react';

export interface SidebarSectionAction { label: string; testId: string; onClick?: () => void; disabled?: boolean; title?: string }

export function SidebarSection({ title, action, children }: { title: string; action?: SidebarSectionAction; children: React.ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <div className="mb-1 flex h-7 items-center justify-between px-3">
        <h2 id={headingId} className="text-xs font-semibold uppercase tracking-wider text-rail-fg/60">{title}</h2>
        {action && (
          <button
            type="button"
            data-testid={action.testId}
            aria-label={action.label}
            title={action.title ?? action.label}
            disabled={action.disabled}
            onClick={action.onClick}
            className="rounded p-1 text-rail-fg/70 outline-none hover:bg-rail-fg/10 hover:text-rail-fg focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      <ul className="space-y-0.5">{children}</ul>
    </section>
  );
}
