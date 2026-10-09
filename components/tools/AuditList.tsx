'use client';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { TypeIcon } from '@/components/vault/TypeIcon';
import { t } from '@/lib/i18n/pt-br';
import type { RecordTypeId } from '@/lib/record-types/catalog';

export interface AuditRow { key: string; recordId: string; title: string; type: RecordTypeId; reason: string; strength: { score: number; label: string } }

/** How bad a non-empty list is: `danger` for weak and reused passwords, `primary` for old ones. */
export type AuditSeverity = 'danger' | 'primary';

/** A row's strength label: weak (0–1) danger, fair (2) primary, strong (3–4) neutral. */
const strengthTone = (score: number) => (score <= 1 ? 'danger' : score === 2 ? 'primary' : 'neutral');

export function AuditList({ id, testId, title, hint, icon: Icon, severity, rows, onOpen }: {
  id: string; testId: string; title: string; hint: string; icon: LucideIcon; severity: AuditSeverity; rows: AuditRow[]; onOpen: (recordId: string) => void;
}) {
  return (
    <section aria-labelledby={`${id}-title`} data-testid={testId} className="overflow-hidden rounded-xl border border-border bg-surface">
      <header className="flex items-start gap-3 border-b border-border px-4 py-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-fg-muted" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 id={`${id}-title`} className="text-sm font-semibold text-fg-strong">{title}</h2>
          <p className="text-xs text-fg-muted">{hint}</p>
        </div>
        {/* An empty list is fine: neutral count. */}
        <Badge tone={rows.length > 0 ? severity : 'neutral'} className="shrink-0 tabular-nums">{rows.length}</Badge>
      </header>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-fg-muted">{t.auditNoneFound}</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.key}>
              <button
                type="button"
                data-testid={`audit-item-${r.recordId}`}
                onClick={() => onOpen(r.recordId)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left outline-none transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-fg-muted">
                  <TypeIcon type={r.type} className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-fg">{r.title || t.untitled}</span>
                  <span className="block truncate text-xs text-fg-muted">{r.reason}</span>
                </span>
                <Badge tone={strengthTone(r.strength.score)} className="shrink-0">{r.strength.label}</Badge>
                <ChevronRight className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
