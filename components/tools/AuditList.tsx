'use client';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { TypeIcon } from '@/components/vault/TypeIcon';
import { t } from '@/lib/i18n/pt-br';
import type { RecordTypeId } from '@/lib/record-types/catalog';
import { cn } from '@/lib/ui/cn';

export interface AuditRow { key: string; recordId: string; title: string; type: RecordTypeId; reason: string; strength: { score: number; label: string } }

const pill = 'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium';
const TONE = { bad: 'bg-danger/10 text-danger', fair: 'bg-primary-soft text-primary', good: 'bg-success/10 text-success' } as const;
const strengthTone = (score: number) => (score <= 1 ? TONE.bad : score >= 3 ? TONE.good : TONE.fair);

export function AuditList({ id, testId, title, hint, icon: Icon, rows, onOpen }: { id: string; testId: string; title: string; hint: string; icon: LucideIcon; rows: AuditRow[]; onOpen: (recordId: string) => void }) {
  return (
    <section aria-labelledby={`${id}-title`} data-testid={testId} className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <header className="flex items-start gap-3 border-b border-border px-4 py-3">
        <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', rows.length > 0 ? 'text-primary' : 'text-success')} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 id={`${id}-title`} className="text-sm font-semibold text-fg">{title}</h2>
          <p className="text-xs text-fg-muted">{hint}</p>
        </div>
        <span className={cn(pill, rows.length > 0 ? TONE.fair : TONE.good)}>{rows.length}</span>
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
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <TypeIcon type={r.type} className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-fg">{r.title || t.untitled}</span>
                  <span className="block truncate text-xs text-fg-muted">{r.reason}</span>
                </span>
                <span className={cn(pill, strengthTone(r.strength.score))}>{r.strength.label}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
